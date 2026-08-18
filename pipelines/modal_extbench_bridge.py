"""External OCR benchmarks, stock Qwen3.5-4B vs a repaired bridge — through the
ocr_postraining/extbench apps unchanged (their official scorers are never forked).

extbench serves a checkpoint DIRECTORY with vLLM (bench_{olmocr,omnidoc,pulse}.py all do
`LLM(model=<path>)`), so an arm is a whole serving checkpoint rather than a load-time
hook. This module materializes two directories on ocr-rl-trainer-models-0 that differ in
EXACTLY the vision merger's tensors — verified per tensor by sha256 over the safetensors
byte ranges — and collects the scorers' reports into validation/extbench_base_vs_repaired.json.

    uv run modal run modal_extbench_bridge.py --materialize   # stock + repaired, verified
    uv run modal run modal_extbench_bridge.py --verify        # re-verify existing dirs
    uv run modal run modal_extbench_bridge.py --launch        # print the bench commands
    uv run modal run modal_extbench_bridge.py --collect       # -> validation/ + md table
    uv run modal run modal_extbench_bridge.py --items         # per-item forensics

--items goes under the headline numbers: it rebuilds olmOCR-bench's per-test pass vector
for both arms from the scorer's own jsonls + failed.jsonl (checked against the scorer's
printed tables, never trusted), classifies every pass->fail item, and measures length,
cap hits, repetition, table markup and markdown decoration on every generated
prediction of all three benches -> validation/extbench_item_level.json.

The bridge must be a FROZEN snapshot: modal_phaseb_train rewrites
/vol/phaseb/<arm>/bridge.safetensors at every val improvement, so a live arm dir served
to a benchmark is not a citable identity. Default = the 1-epoch snapshot R5b_5k_ep1.
A later checkpoint is a new snapshot + a new --repaired-dir and --repaired-arm (never
overwrite an arm that has already been scored):

    uv run modal run modal_extbench_bridge.py --materialize \
        --bridge-path /vol/phaseb/R5b_5k_ep2/bridge.safetensors \
        --repaired-dir qwen35_4b_R5b_5k_ep2
    uv run modal run modal_extbench_bridge.py --launch --repaired-dir qwen35_4b_R5b_5k_ep2
    uv run modal run modal_extbench_bridge.py --collect \
        --repaired-dir qwen35_4b_R5b_5k_ep2 --repaired-arm repaired_ep2 \
        --out-name extbench_base_vs_repaired_ep2.json

The bench runs themselves are launched from ocr_postraining/extbench with the printed
lines; every stage is resume-safe (existing predictions are skipped), so a function
timeout is recovered by re-running the same command.

Ops (learned 2026-08-17, cost 4 finished inference stages their scorer run): `--detach`
survives a disconnect but NOT a killed client — SIGKILLing the `modal run` process
cancels its in-flight call, and the score stage runs from the LOCAL entrypoint after
infer returns. Start each client in its own session so a killed parent cannot take it
down (`python -c "import subprocess; subprocess.Popen(cmd, start_new_session=True)"`,
tmux, or setsid where it exists — macOS has none). Re-scoring is free: predictions
already on the volume are kept, so `--stage score --candidate <dir>` re-runs the
scorer alone.
"""

from __future__ import annotations

import json
import random
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_OUT_PATH = REPO_ROOT / "validation" / "extbench_base_vs_repaired.json"
ITEM_OUT_PATH = REPO_ROOT / "validation" / "extbench_item_level.json"
VERIFY_PATH = REPO_ROOT / "validation" / "extbench_arms_verify.json"
EXTBENCH_DIR = REPO_ROOT.parent / "ocr_postraining" / "extbench"

APP_NAME = "encoder-anatomy-extbench"
VOL_PATH = "/vol"
MODELS_PATH = "/models"
DATA_PATH = "/data"
HF_CACHE_PATH = "/hf"
EXPORTS = f"{MODELS_PATH}/hf_exports"

CHECKPOINT = "Qwen/Qwen3.5-4B"  # the tower modal_phaseb_train trained the bridge inside
DEFAULT_STOCK_DIR = "qwen35_4b_stock"
# FROZEN byte-copy of the 1-epoch R5b_5k checkpoint. modal_phaseb_train rewrites
# phaseb/R5b_5k/bridge.safetensors at every val improvement, so the live arm dir is not
# a citable identity — always materialize from a _ep1-style snapshot.
DEFAULT_BRIDGE_PATH = f"{VOL_PATH}/phaseb/R5b_5k_ep1/bridge.safetensors"
DEFAULT_REPAIRED_DIR = "qwen35_4b_R5b_5k"
ARM_STOCK = "stock"
DEFAULT_REPAIRED_ARM = "repaired_ep1"
MERGER_SEP = ".merger."
BENCHES = ("olmocr", "omnidoc", "pulse")
BENCH_MODULE = {"olmocr": "bench_olmocr.py", "omnidoc": "bench_omnidoc.py",
                "pulse": "bench_pulse.py"}
# bench_pulse.py pins its app name; the other two read BENCH_APP, which keeps the two
# arms in separate apps so stopping one never touches the other.
BENCH_APP_OVERRIDE = {"olmocr": True, "omnidoc": True, "pulse": False}

# item-level forensics
OLMOCR_JSONLS = ("arxiv_math.jsonl", "headers_footers.jsonl", "long_tiny_text.jsonl",
                 "multi_column.jsonl", "old_scans.jsonl", "old_scans_math.jsonl",
                 "table_tests.jsonl")
BASELINE_FILE = "baseline"          # the scorer's pseudo-file for auto-generated baselines
# SamplingParams(max_tokens=...) in each extbench app — a prediction at the cap was cut off
GEN_CAP = {"olmocr": 8192, "omnidoc": 8192, "pulse": 16384}
CAP_MARGIN = 0.98                   # post-processing strips a few tokens off a capped run
REPETITION_FLOOR = 0.10             # >=10% of n-grams identical = a looping generation
PARTIAL_FLOOR = 0.60                # fuzzy-match ratio above which the text was mostly read
GOLD_FIELDS = ("text", "math", "cell", "before", "after", "top_heading", "left_heading",
               "up", "down", "left", "right", "first_n", "last_n")


# --------------------------------------------------------------------------- #
# pure parts (unit-tested; no modal, no volume)
# --------------------------------------------------------------------------- #

def merger_key_map(checkpoint_keys, bridge_keys) -> dict[str, str]:
    """{full checkpoint key: bridge-file key} for the ONE vision merger.

    Both directions are checked: every bridge tensor must name a checkpoint
    tensor, and every checkpoint merger tensor must be covered by the bridge —
    a saved file that does not exactly describe this merger fails loudly
    instead of silently repairing part of it (adapters/qwen_vit.py's strict
    load_state_dict contract, in checkpoint-key space).
    """
    merger = {k for k in checkpoint_keys if MERGER_SEP in k}
    if not merger:
        raise RuntimeError(f"no checkpoint key contains {MERGER_SEP!r}")
    prefixes = {k.split(MERGER_SEP)[0] for k in merger}
    if len(prefixes) != 1:
        raise RuntimeError(f"expected one merger, found prefixes {sorted(prefixes)}")
    prefix = prefixes.pop()
    mapping = {f"{prefix}{MERGER_SEP}{b}": b for b in bridge_keys}
    if set(mapping) != merger:
        raise RuntimeError(
            f"bridge keys do not match the checkpoint's merger: "
            f"missing={sorted(merger - set(mapping))} "
            f"unknown={sorted(set(mapping) - merger)}"
        )
    return mapping


_OLMOCR_OVERALL = re.compile(
    r"^(?P<cand>\S+)\s*: Average Score: (?P<score>[\d.]+)% ± (?P<ci>[\d.]+)%", re.M)
_OLMOCR_TESTTYPE = re.compile(
    r"^\s+(?P<name>[a-z_]+)\s*: (?P<score>[\d.]+)% average pass rate over (?P<n>\d+) tests",
    re.M)
_OLMOCR_FILE = re.compile(
    r"^\s+(?P<name>\S+)\s+: (?P<score>[\d.]+)% \((?P<passed>\d+)/(?P<total>\d+) tests\)", re.M)


def parse_olmocr_summary(text: str) -> dict:
    """`python -m olmocr.bench.benchmark` stdout -> {overall, ci95, test_types, by_file}.

    Only the "Final Summary" block is read; the per-test FAIL log above it uses
    the same percent formatting.
    """
    marker = text.rfind("Final Summary")
    if marker < 0:
        raise RuntimeError("olmOCR summary has no 'Final Summary' block")
    tail = text[marker:]
    overall = _OLMOCR_OVERALL.search(tail)
    if overall is None:
        raise RuntimeError("olmOCR summary has no candidate 'Average Score' line")
    return {
        "candidate": overall["cand"],
        "overall": float(overall["score"]),
        "ci95": float(overall["ci"]),
        "test_types": {m["name"]: {"score": float(m["score"]), "n_tests": int(m["n"])}
                       for m in _OLMOCR_TESTTYPE.finditer(tail)},
        "by_file": {m["name"]: {"score": float(m["score"]), "passed": int(m["passed"]),
                                "total": int(m["total"])}
                    for m in _OLMOCR_FILE.finditer(tail)},
    }


def omnidoc_slices(metric: dict) -> dict:
    """<candidate>_quick_match_metric_result.json -> headline + every group/page slice.

    Overall is OmniDocBench's own composite, on the 0-100 scale the leaderboard
    uses: ((1 - text_block Edit_dist) + table TEDS + display_formula CDM) / 3 * 100.
    It is None when CDM is absent (the CDM stage can be dropped by the scorer),
    never silently replaced by a two-term average.
    """
    def _all(section: str, metric_name: str, key: str):
        node = ((metric.get(section) or {}).get("all") or {}).get(metric_name) or {}
        val = node.get(key)
        return None if val is None else float(val)

    text_edit = _all("text_block", "Edit_dist", "ALL_page_avg")
    teds = _all("table", "TEDS", "all")
    cdm = _all("display_formula", "CDM", "all")
    overall = (None if None in (text_edit, teds, cdm)
               else round(((1.0 - text_edit) + teds + cdm) / 3.0 * 100.0, 4))
    return {
        "overall": overall,
        "text_block_edit": text_edit,
        "table_teds": teds,
        "table_teds_structure_only": _all("table", "TEDS_structure_only", "all"),
        "table_edit": _all("table", "Edit_dist", "ALL_page_avg"),
        "display_formula_cdm": cdm,
        "display_formula_edit": _all("display_formula", "Edit_dist", "ALL_page_avg"),
        "reading_order_edit": _all("reading_order", "Edit_dist", "ALL_page_avg"),
        "slices": {
            section: {
                "group": (metric.get(section) or {}).get("group", {}),
                "page": (metric.get(section) or {}).get("page", {}),
            }
            for section in ("text_block", "display_formula", "table", "reading_order")
            if section in metric
        },
    }


def pulse_slices(summary: dict) -> dict:
    """bench_pulse summary_with_langs.json -> summary + per-language (Coverage kept:
    T-LAG excludes missing predictions, so the mean is only readable next to it)."""
    return {"summary": summary.get("summary", {}),
            "per_language": summary.get("per_language", {})}


def delta_tree(stock, repaired):
    """repaired - stock over matching numeric leaves; dicts recurse on the
    intersection, everything else is dropped (a slice present in one arm only
    has no delta)."""
    if isinstance(stock, dict) and isinstance(repaired, dict):
        out = {}
        for k in stock:
            if k not in repaired:
                continue
            sub = delta_tree(stock[k], repaired[k])
            if sub is not None:
                out[k] = sub
        return out or None
    if isinstance(stock, bool) or isinstance(repaired, bool):
        return None
    if isinstance(stock, (int, float)) and isinstance(repaired, (int, float)):
        return round(float(repaired) - float(stock), 6)
    return None


def launch_commands(stock_dir: str, repaired_dir: str, benches=BENCHES) -> list[str]:
    """The exact extbench lines that run both arms (cwd = ocr_postraining/extbench).

    Run each in its own session (see the module docstring): the score stage is issued by
    the LOCAL entrypoint once infer returns, and a killed client cancels it even under
    --detach.
    """
    cmds = []
    for bench in benches:
        for arm, ckpt in (("stock", stock_dir), ("repaired", repaired_dir)):
            prefix = (f"BENCH_APP=bench-{bench}-{arm} " if BENCH_APP_OVERRIDE[bench] else "")
            cmds.append(f"{prefix}modal run --detach {BENCH_MODULE[bench]} "
                        f"--model {EXPORTS}/{ckpt}")
    return cmds


def assemble_bundle(reports: dict, config: dict,
                    repaired_arm: str = DEFAULT_REPAIRED_ARM) -> dict:
    """{arm: {bench: raw report payload}} -> the extbench_base_vs_repaired.json bundle.

    repaired_arm names the checkpoint generation (e.g. repaired_ep1) so a later
    epoch's numbers can sit beside these without ambiguity; `arms` records the
    two keys for consumers.
    """
    parse = {"olmocr": parse_olmocr_summary, "omnidoc": omnidoc_slices,
             "pulse": pulse_slices}
    arms: dict[str, dict] = {}
    for arm, benches in reports.items():
        arms[arm] = {}
        for bench, entry in benches.items():
            if not entry.get("found"):
                arms[arm][bench] = {"status": "missing", "path": entry.get("path")}
                continue
            arms[arm][bench] = {
                "status": "ok",
                "path": entry["path"],
                "n_predictions": entry.get("n_predictions"),
                **parse[bench](entry["payload"]),
            }
    stock, repaired = arms.get(ARM_STOCK, {}), arms.get(repaired_arm, {})
    deltas = {}
    for bench in set(stock) & set(repaired):
        if stock[bench].get("status") == "ok" == repaired[bench].get("status"):
            deltas[bench] = delta_tree(stock[bench], repaired[bench])
    return {
        "experiment": "external OCR benchmarks — stock vs repaired projector",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "arms": {"stock": ARM_STOCK, "repaired": repaired_arm},
        ARM_STOCK: stock,
        repaired_arm: repaired,
        "delta": deltas,
        "config": config,
    }


def _row(name: str, stock, repaired, delta, nd: int = 4) -> str:
    ints = isinstance(stock, int) and isinstance(repaired, int)

    def val(v):
        return "—" if v is None else (str(v) if ints else f"{v:.{nd}f}")

    def dev(v):
        return "—" if v is None else (f"{v:+.0f}" if ints else f"{v:+.{nd}f}")

    return f"| {name} | {val(stock)} | {val(repaired)} | {dev(delta)} |"


def markdown_tables(bundle: dict) -> str:
    """Raw per-benchmark tables (overall + every sub-slice) for docs/results.md."""
    out: list[str] = []
    labels = bundle.get("arms", {"stock": ARM_STOCK, "repaired": DEFAULT_REPAIRED_ARM})
    stock, repaired = bundle[labels["stock"]], bundle[labels["repaired"]]
    delta = bundle["delta"]
    header = [f"| slice | {labels['stock']} | {labels['repaired']} | Δ |",
              "|---|---|---|---|"]

    if stock.get("olmocr", {}).get("status") == "ok":
        s, r = stock["olmocr"], repaired["olmocr"]
        d = delta.get("olmocr") or {}
        out += ["## olmOCR-bench — official scorer, 1,403 pages (pass rate %)", "", *header,
                _row("**overall** (macro over jsonls)", s["overall"], r["overall"],
                     d.get("overall"), 1)]
        for k in sorted(set(s["test_types"]) | set(r["test_types"])):
            out.append(_row(f"{k} (n={s['test_types'].get(k, {}).get('n_tests', '?')})",
                            s["test_types"].get(k, {}).get("score"),
                            r["test_types"].get(k, {}).get("score"),
                            ((d.get("test_types") or {}).get(k) or {}).get("score"), 1))
        for k in sorted(set(s["by_file"]) | set(r["by_file"])):
            out.append(_row(k, s["by_file"].get(k, {}).get("score"),
                            r["by_file"].get(k, {}).get("score"),
                            ((d.get("by_file") or {}).get(k) or {}).get("score"), 1))
        out.append("")
    if stock.get("omnidoc", {}).get("status") == "ok":
        s, r = stock["omnidoc"], repaired["omnidoc"]
        d = delta.get("omnidoc") or {}
        out += ["## OmniDocBench v1.6 — official repro container, 1,651 pages", "", *header]
        for k in ("overall", "text_block_edit", "table_teds", "table_teds_structure_only",
                  "table_edit", "display_formula_cdm", "display_formula_edit",
                  "reading_order_edit"):
            out.append(_row(k, s.get(k), r.get(k), d.get(k)))
        out.append("")
    if stock.get("pulse", {}).get("status") == "ok":
        s, r = stock["pulse"], repaired["pulse"]
        d = delta.get("pulse") or {}
        out += ["## PulseBench-Tab — official T-LAG scorer, 1,820 tables", "", *header]
        for k in ("mean", "median", "coverage_pct", "n_scored", "n_missing", "perfect_count"):
            out.append(_row(k, s["summary"].get(k), r["summary"].get(k),
                            (d.get("summary") or {}).get(k)))
        for k in sorted(set(s["per_language"]) | set(r["per_language"])):
            out.append(_row(f"lang: {k}", s["per_language"].get(k), r["per_language"].get(k),
                            (d.get("per_language") or {}).get(k)))
        out.append("")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# item-level forensics (pure; unit-tested)
# --------------------------------------------------------------------------- #

def olmocr_universe(jsonl_rows: dict[str, list[dict]]) -> dict[str, dict]:
    """{test id: {type, source_file, pdf}} for every test the official scorer runs.

    The universe is the 7 category jsonls PLUS one auto-generated baseline test per
    pdf that no jsonl already covers with a baseline of its own. That union is what
    the scorer's "over N tests" line counts and what its by-file/by-type tables
    partition, so a reconstruction is checkable against the summary rather than
    trusted (see confusion_matches_summary).
    """
    universe: dict[str, dict] = {}
    pdfs: set[str] = set()
    covered: set[str] = set()
    for name, rows in jsonl_rows.items():
        for row in rows:
            universe[row["id"]] = {"type": row["type"], "source_file": name,
                                   "pdf": row["pdf"]}
            pdfs.add(row["pdf"])
            if row["type"] == "baseline":
                covered.add(row["pdf"])
    for pdf in sorted(pdfs - covered):
        universe[f"{pdf}_baseline"] = {"type": "baseline", "source_file": BASELINE_FILE,
                                       "pdf": pdf}
    return universe


_OLMOCR_FAIL = re.compile(
    r"^\s+\[FAIL\] Test (?P<id>\S+) on \S+ page \d+ average pass ratio: [\d.]+"
    r"[^\n]*?(?: Ex: (?P<reason>[^\n]*))?$", re.M)


def olmocr_failure_reasons(text: str) -> dict[str, str]:
    """{test id: the scorer's own one-line explanation} from its [FAIL] log.

    Read from the section ABOVE "Final Summary" (the summary block has no [FAIL]
    lines, so no split is needed); an id logged more than once keeps the first.
    """
    out: dict[str, str] = {}
    for m in _OLMOCR_FAIL.finditer(text):
        out.setdefault(m["id"], (m["reason"] or "").strip())
    return out


def _cell(ids, stock_failed, repaired_failed) -> dict:
    counts = Counter()
    for i in ids:
        counts[("F" if i in stock_failed else "P") +
               ("F" if i in repaired_failed else "P")] += 1
    n = len(ids)
    out = {"n": n, "pass_pass": counts["PP"], "pass_fail": counts["PF"],
           "fail_pass": counts["FP"], "fail_fail": counts["FF"],
           "net": counts["FP"] - counts["PF"]}
    if n:
        out["stock_pass_pct"] = round(100.0 * (counts["PP"] + counts["PF"]) / n, 1)
        out["repaired_pass_pct"] = round(100.0 * (counts["PP"] + counts["FP"]) / n, 1)
    return out


def item_confusion(universe: dict[str, dict], stock_failed, repaired_failed) -> dict:
    """pass/fail x pass/fail counts overall, per test_type and per source file.

    Raises when a scored failure names a test outside the reconstructed universe —
    that would silently shrink every cell.
    """
    stock_failed, repaired_failed = set(stock_failed), set(repaired_failed)
    stray = sorted((stock_failed | repaired_failed) - set(universe))
    if stray:
        raise RuntimeError(f"{len(stray)} failed tests outside the universe: {stray[:5]}")
    groups: dict[str, dict[str, list]] = {"by_test_type": defaultdict(list),
                                          "by_source_file": defaultdict(list)}
    for test_id, meta in universe.items():
        groups["by_test_type"][meta["type"]].append(test_id)
        groups["by_source_file"][meta["source_file"]].append(test_id)
    return {
        "overall": _cell(list(universe), stock_failed, repaired_failed),
        **{key: {k: _cell(v, stock_failed, repaired_failed)
                 for k, v in sorted(group.items())}
           for key, group in groups.items()},
    }


def confusion_matches_summary(confusion: dict, summary: dict) -> dict:
    """Per-slice check that the reconstructed pass counts ARE the scorer's own.

    summary is parse_olmocr_summary() output for one arm; the by_file totals and the
    by-type pass rates it printed must both fall out of the confusion, or the
    universe reconstruction is wrong.
    """
    out = {}
    for name, node in summary["by_file"].items():
        cell = confusion["by_source_file"].get(name)
        out[f"by_file/{name}"] = bool(
            cell and cell["n"] == node["total"]
            and cell["pass_pass"] + cell["fail_pass"] == node["passed"])
    for name, node in summary["test_types"].items():
        cell = confusion["by_test_type"].get(name)
        out[f"by_type/{name}"] = bool(
            cell and cell["n"] == node["n_tests"]
            and cell["repaired_pass_pct"] == round(node["score"], 1))
    return out


def repetition_fraction(text: str, n: int = 10) -> tuple[float, float]:
    """(duplicate n-gram share, single most frequent n-gram's share) of the text.

    The first is the degeneration measure: 0 when every n-gram is unique, ->1 for a
    generation stuck in a loop of ANY period. The most-frequent-gram share reads
    1/period instead (a 9-word loop scores .11 under a 10-gram window), so it is
    reported beside it rather than used as the flag. Whitespace tokens, falling back
    to n*3-character grams for scripts that do not space-separate (a CJK page is one
    huge "token"); text too short to hold an n-gram scores 0.
    """
    units = text.split()
    if len(units) < 4 * n and len(text) >= 4 * n:
        units, n = list(text), n * 3
    total = len(units) - n + 1
    if total < 1:
        return 0.0, 0.0
    grams = Counter(tuple(units[i:i + n]) for i in range(total))
    return 1.0 - len(grams) / total, max(grams.values()) / total


_PIPE_ROW = re.compile(r"^\s*\|.*\|\s*$", re.M)


def has_table_markup(text: str) -> bool:
    """Did this prediction emit a table at all — an HTML <table> or a pipe row?

    Both forms count because the benches keep different ones: bench_omnidoc converts
    pipe tables to HTML before writing, bench_olmocr leaves the model's markdown as
    it came, and bench_pulse writes ONLY the extracted <table> (so an empty pulse
    prediction is a page whose generation carried no table markup, not a page the
    model was silent on — that text is not persisted anywhere).
    """
    return "<table" in text.lower() or bool(_PIPE_ROW.search(text))


def _quantiles(values, points=(0.1, 0.5, 0.9)) -> dict:
    if not values:
        return {f"p{int(p * 100)}": None for p in points}
    ordered = sorted(values)
    return {f"p{int(p * 100)}": ordered[min(len(ordered) - 1, int(p * len(ordered)))]
            for p in points}


def degeneration_stats(records: list[dict], cap: int) -> dict:
    """Aggregate one arm's predictions: length, emptiness, cap hits, repetition.

    `at_cap` is a lower bound — post-processing strips think tags and code fences
    off the served text, so a run cut off at max_tokens can land just under it.
    """
    n = len(records)
    chars = [r["chars"] for r in records]
    tokens = [r["tokens"] for r in records]
    reps = [r["repetition"] for r in records]
    tops = [r["top_gram"] for r in records]
    empty = sum(1 for r in records if r["chars"] == 0)
    at_cap = sum(1 for t in tokens if t >= CAP_MARGIN * cap)
    looping = sum(1 for r in reps if r >= REPETITION_FLOOR)
    tables = sum(1 for r in records if r["table_markup"])
    emphasis = [r["emphasis_per_1k"] for r in records]
    return {
        "mean_emphasis_per_1k": round(sum(emphasis) / n, 2) if n else None,
        "n": n,
        "gen_cap_tokens": cap,
        "empty": empty,
        "with_table_markup": tables,
        "empty_pct": round(100.0 * empty / n, 2) if n else None,
        "mean_chars": round(sum(chars) / n, 1) if n else None,
        "mean_tokens": round(sum(tokens) / n, 1) if n else None,
        "chars": _quantiles(chars),
        "tokens": _quantiles(tokens),
        "at_cap": at_cap,
        "at_cap_pct": round(100.0 * at_cap / n, 2) if n else None,
        "repetition_ge_floor": looping,
        "repetition_ge_floor_pct": round(100.0 * looping / n, 2) if n else None,
        "repetition_floor": REPETITION_FLOOR,
        # the floor is a choice — carry the sweep so it can be re-read, not re-run
        "repetition_ge": {str(t): sum(1 for r in reps if r >= t)
                          for t in (0.05, 0.1, 0.25, 0.5, 0.9)},
        "mean_repetition": round(sum(reps) / n, 4) if n else None,
        "mean_top_gram": round(sum(tops) / n, 4) if n else None,
        "repetition": {k: (None if v is None else round(v, 4))
                       for k, v in _quantiles(reps).items()},
    }


_REFUSAL = re.compile(r"^\s*(i'?m sorry|i am sorry|i cannot|i can'?t|sorry,|as an ai)", re.I)
_BEST_RATIO = re.compile(r"best match ratio was ([\d.]+)")
_REASON_KINDS = (
    ("No tables found", "table_dropped"),
    ("No cell matching", "table_cell_missing"),
    ("but relationships were not satisfied", "table_structure"),
    ("Expected absence of", "absent_violation"),
    ("not found with max_l_dist", "order_anchor_missing"),
    ("Could not find a location where", "order_anchor_missing"),
    ("No match found for", "math_not_found"),
    ("Text contains disallowed characters", "disallowed_characters"),
    ("repeating", "repetition"),
)


def failure_kind(reason: str, pred: str, repetition: float, at_cap: bool) -> str:
    """One label per failed item.

    Page-level generation pathology wins over the scorer's reason: an empty, looping
    or cap-truncated page explains every test on it at once, and the reason string
    ("No match found for ...") would otherwise scatter one cause across many labels.
    Below that, the label is the scorer's own reason for what it could not find,
    with a mostly-read text (fuzzy ratio >= PARTIAL_FLOOR) split off from a miss.
    """
    if not pred.strip():
        return "empty_output"
    if repetition >= REPETITION_FLOOR:
        return "repetition"
    if at_cap:
        return "truncated_at_cap"
    if _REFUSAL.match(pred):
        return "refusal"
    ratio = _BEST_RATIO.search(reason or "")
    if ratio:
        return ("text_partial" if float(ratio[1]) >= PARTIAL_FLOOR else "text_not_found")
    for needle, kind in _REASON_KINDS:
        if needle in (reason or ""):
            return kind
    return "other"


def contains_ratio(needle: str, haystack: str) -> float:
    """Closest match of `needle` anywhere in `haystack`, 0-1 (rapidfuzz partial_ratio).

    NOT a re-implementation of olmOCR's absent check (which normalizes its own way and
    is the authority on pass/fail) — a direct reading of how close a copy of the
    forbidden string the prediction still holds, so "passed by not emitting it" and
    "passed by emitting it garbled" separate.
    """
    from rapidfuzz import fuzz

    if not needle or not haystack:
        return 0.0
    return fuzz.partial_ratio(needle.lower(), haystack.lower()) / 100.0


_EMPHASIS = re.compile(r"[*_~`]+")
_THRESHOLD = re.compile(r"with threshold ([\d.]+)")


def strip_emphasis(text: str) -> str:
    """The text under markdown emphasis / strike / code decoration."""
    return _EMPHASIS.sub("", text)


def emphasis_rate(text: str) -> float:
    """Markdown decoration characters per 1,000 characters of prediction."""
    return 1000.0 * len(_EMPHASIS.findall(text)) / len(text) if text else 0.0


def scorer_ratio_and_threshold(reason: str) -> tuple[float, float] | None:
    """(threshold, best match ratio) the scorer printed for a fuzzy text test.

    None when the reason is not one of the fuzzy-match families — the pair is what
    makes a failure re-checkable against the scorer's OWN bar rather than a bar of
    our choosing.
    """
    threshold = _THRESHOLD.search(reason or "")
    ratio = _BEST_RATIO.search(reason or "")
    return (float(threshold[1]), float(ratio[1])) if threshold and ratio else None


def transition_ids(universe, stock_failed, repaired_failed, cell: str) -> list[str]:
    """Sorted test ids in one confusion cell ('pass_fail' | 'fail_pass' | ...)."""
    want_stock, want_repaired = cell.split("_")
    stock_failed, repaired_failed = set(stock_failed), set(repaired_failed)
    return sorted(
        i for i in universe
        if ((i in stock_failed) == (want_stock == "fail"))
        and ((i in repaired_failed) == (want_repaired == "fail")))


def stratified_sample(ids, universe, k: int, seed: int = 0) -> list[str]:
    """k ids spread over test types in proportion to their share, deterministically."""
    by_type: dict[str, list[str]] = defaultdict(list)
    for i in ids:
        by_type[universe[i]["type"]].append(i)
    rng = random.Random(seed)
    picked: list[str] = []
    for name in sorted(by_type):
        pool = sorted(by_type[name])
        take = max(1, round(k * len(pool) / len(ids))) if ids else 0
        picked += rng.sample(pool, min(take, len(pool)))
    return sorted(picked)[:k] if len(picked) > k else sorted(picked)


def item_markdown_tables(bundle: dict) -> str:
    """Confusion / failure-mode / degeneration / absent tables for docs/results.md."""
    olmocr, out = bundle["olmocr"], []
    conf = olmocr["confusion"]

    def conf_row(name, cell):
        return (f"| {name} | {cell['n']} | {cell['pass_pass']} | {cell['pass_fail']} | "
                f"{cell['fail_pass']} | {cell['fail_fail']} | {cell['net']:+d} | "
                f"{cell['stock_pass_pct']} | {cell['repaired_pass_pct']} |")

    out += [f"## olmOCR-bench item-level confusion ({conf['overall']['n']:,} tests)", "",
            "| slice | n | P→P | P→F | F→P | F→F | net | stock % | repaired % |",
            "|---|---|---|---|---|---|---|---|---|",
            conf_row("**overall**", conf["overall"])]
    for key, label in (("by_test_type", "type"), ("by_source_file", "file")):
        for name, cell in conf[key].items():
            out.append(conf_row(f"{label}: {name}", cell))
    out.append("")

    kinds = olmocr["failure_kinds"]["overall"]
    total = sum(kinds.values()) or 1
    out += [f"## Failure modes over the {total:,} pass→fail items", "",
            "| mode | n | % of pass→fail | stock arm, all failures |", "|---|---|---|---|"]
    stock_kinds = olmocr["stock_failure_kinds"]
    for name, count in kinds.items():
        out.append(f"| {name} | {count} | {100.0 * count / total:.1f} | "
                   f"{stock_kinds.get(name, 0)} |")
    out.append("")

    out += ["## Degeneration over every prediction (both arms, all three benches)", "",
            "| bench | arm | n | mean chars | mean tokens | empty | at cap | "
            "repetition ≥ floor | pages with table markup | markdown marks /1k chars |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for bench, arms in bundle["degeneration"].items():
        for arm, s in arms.items():
            out.append(f"| {bench} | {arm} | {s['n']} | {s['mean_chars']} | "
                       f"{s['mean_tokens']} | {s['empty']} ({s['empty_pct']}%) | "
                       f"{s['at_cap']} ({s['at_cap_pct']}%) | "
                       f"{s['repetition_ge_floor']} ({s['repetition_ge_floor_pct']}%) | "
                       f"{s['with_table_markup']} | {s['mean_emphasis_per_1k']} |")
    pulse = bundle["pulse"]
    moves = ", ".join(f"{k.replace('->', '→')} {v}"
                      for k, v in pulse["transitions"].items())
    out += ["", f"PulseBench-Tab per-sample transitions over all "
            f"{pulse['n_samples']:,} samples: {moves}.", ""]

    out += ["## Format-artifact check — the scorer's own threshold, decoration removed",
            "",
            "| test family | n | our ratio vs scorer's | mean scorer ratio | "
            "mean ratio, decoration stripped | recovered |",
            "|---|---|---|---|---|---|"]
    for kind, node in olmocr["format_artifacts"].items():
        out.append(f"| {kind} | {node['n']} | ±{node['mean_abs_diff_vs_scorer']} | "
                   f"{node['mean_scorer_ratio']} | {node['mean_bare_ratio']} | "
                   f"{node['recovered_by_stripping_emphasis']} |")
    out.append("")

    out += ["## `absent` slice — the one family that rose", "",
            "| cell | items | pages | stock mean chars | repaired mean chars | "
            "repaired shorter | repaired empty | repaired looping | stock holds the "
            "forbidden string | repaired holds it |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for cell, node in olmocr["absent"]["cells"].items():
        out.append(f"| {cell} | {node['n_items']} | {node['n_pages']} | "
                   f"{node['stock_mean_chars']} | {node['repaired_mean_chars']} | "
                   f"{node['repaired_shorter']} | {node['repaired_empty']} | "
                   f"{node['repaired_repetition_ge_floor']} | "
                   f"{node['stock_mean_contains_ratio']} | "
                   f"{node['repaired_mean_contains_ratio']} |")
    return "\n".join([*out, ""])


def clip(text: str, head: int = 900, tail: int = 300) -> str:
    """Readable excerpt: the head, the tail, and how much was dropped between."""
    text = text or ""
    if len(text) <= head + tail:
        return text
    return f"{text[:head]}\n[... {len(text) - head - tail} chars omitted ...]\n{text[-tail:]}"


# --------------------------------------------------------------------------- #
# modal app
# --------------------------------------------------------------------------- #

app = modal.App(APP_NAME)

pilot_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
models_volume = modal.Volume.from_name("ocr-rl-trainer-models-0", create_if_missing=False)
bench_data_volume = modal.Volume.from_name("ocr-rl-trainer-data-0", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "numpy", "safetensors", "huggingface_hub")  # numpy: safetensors.torch
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("modal_extbench_bridge")
)

_MODEL_VOLUMES = {VOL_PATH: pilot_volume, MODELS_PATH: models_volume,
                  HF_CACHE_PATH: hf_cache_volume}


def _shard_header(path) -> tuple[dict, int]:
    """safetensors header dict + the offset its data_offsets are relative to."""
    with open(path, "rb") as fh:
        n = int.from_bytes(fh.read(8), "little")
        header = json.loads(fh.read(n))
    return header, 8 + n


def _tensor_digests(path) -> dict[str, dict]:
    """{key: {dtype, shape, sha256}} over the file's raw tensor byte ranges."""
    import hashlib

    header, base = _shard_header(path)
    out = {}
    with open(path, "rb") as fh:
        for key, info in header.items():
            if key == "__metadata__":
                continue
            start, end = info["data_offsets"]
            fh.seek(base + start)
            digest, remaining = hashlib.sha256(), end - start
            while remaining > 0:
                chunk = fh.read(min(1 << 22, remaining))
                if not chunk:
                    raise RuntimeError(f"{path}: truncated tensor {key}")
                digest.update(chunk)
                remaining -= len(chunk)
            out[key] = {"dtype": info["dtype"], "shape": info["shape"],
                        "sha256": digest.hexdigest()}
    return out


def _file_sha256(path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 22), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _checkpoint_files(root) -> list:
    return sorted(p for p in root.iterdir() if p.is_file() and not p.name.startswith("."))


@app.function(image=image, cpu=8.0, memory=65536, timeout=3 * 3600, volumes=_MODEL_VOLUMES)
def materialize_arms(bridge_path: str = DEFAULT_BRIDGE_PATH,
                     repaired_dir: str = DEFAULT_REPAIRED_DIR,
                     stock_dir: str = DEFAULT_STOCK_DIR,
                     overwrite: bool = False) -> dict:
    """Two vLLM-servable checkpoint dirs differing only in the merger tensors.

    The stock arm is served from the same kind of local directory as the
    repaired one (not from the hub) so directory-vs-hub loading is not a second
    difference between the arms. Every non-merger shard is copied byte-for-byte;
    only the shard(s) that hold merger tensors are rewritten, with the fp32
    bridge cast to the checkpoint's own dtype.
    """
    import shutil

    from huggingface_hub import snapshot_download
    from safetensors import safe_open
    from safetensors.torch import load_file, save_file

    stock = Path(EXPORTS) / stock_dir
    if not (stock / "config.json").exists():
        snapshot_download(CHECKPOINT, local_dir=str(stock))
        shutil.rmtree(stock / ".cache", ignore_errors=True)  # hub bookkeeping, not served
        models_volume.commit()
        print(f"[extbench-bridge] downloaded {CHECKPOINT} -> {stock}")

    out = Path(EXPORTS) / repaired_dir
    if out.exists():
        if not overwrite:
            raise RuntimeError(f"{out} exists — pass --overwrite, or use a new "
                               "--repaired-dir (an already-scored arm must not move)")
        shutil.rmtree(out)
    out.mkdir(parents=True)

    index = json.loads((stock / "model.safetensors.index.json").read_text())["weight_map"]
    bridge = load_file(bridge_path)
    key_map = merger_key_map(index, bridge)
    merger_shards = {index[k] for k in key_map}
    print(f"[extbench-bridge] {len(key_map)} merger tensors "
          f"({sum(t.numel() for t in bridge.values()):,} params) in {sorted(merger_shards)}")

    for src in _checkpoint_files(stock):
        dst = out / src.name
        if src.name not in merger_shards:
            shutil.copy2(src, dst)
            continue
        tensors, metadata = {}, None
        with safe_open(src, framework="pt") as fh:
            metadata = fh.metadata()
            for key in fh.keys():
                tensor = fh.get_tensor(key)
                if key in key_map:
                    new = bridge[key_map[key]]
                    if tuple(new.shape) != tuple(tensor.shape):
                        raise RuntimeError(f"{key}: bridge shape {tuple(new.shape)} != "
                                           f"checkpoint {tuple(tensor.shape)}")
                    tensor = new.to(tensor.dtype)
                tensors[key] = tensor
        save_file(tensors, str(dst), metadata=metadata or {"format": "pt"})
        del tensors
        print(f"[extbench-bridge] rewrote {src.name}")
    models_volume.commit()
    return verify_pair(stock, out, bridge_path, sorted(merger_shards))


@app.function(image=image, cpu=8.0, memory=32768, timeout=2 * 3600, volumes=_MODEL_VOLUMES)
def verify_arms(bridge_path: str = DEFAULT_BRIDGE_PATH,
                repaired_dir: str = DEFAULT_REPAIRED_DIR,
                stock_dir: str = DEFAULT_STOCK_DIR) -> dict:
    from safetensors.torch import load_file

    stock, out = Path(EXPORTS) / stock_dir, Path(EXPORTS) / repaired_dir
    index = json.loads((stock / "model.safetensors.index.json").read_text())["weight_map"]
    key_map = merger_key_map(index, load_file(bridge_path))
    return verify_pair(stock, out, bridge_path, sorted({index[k] for k in key_map}))


def verify_pair(stock: Path, out: Path, bridge_path: str, merger_shards: list) -> dict:
    """Hard check: nothing outside the merger moved, and the merger IS the bridge.

    Non-merger tensors are compared by sha256 over their safetensors byte
    ranges (a rewritten shard's file hash legitimately differs — its tensor
    bytes must not), non-shard files by whole-file sha256, and each repaired
    merger tensor must equal the bridge tensor cast to the checkpoint dtype.
    A merger tensor whose trained value rounds back onto the stock bf16 bytes
    is DATA, not a failure (per-tensor bytes_equal plus the fp32-space delta
    that the cast swallowed are both reported); a repair where NO merger tensor
    survives the cast is a no-op and raises.
    """
    import torch
    from safetensors.torch import load_file

    stock_files = {p.name for p in _checkpoint_files(stock)}
    out_files = {p.name for p in _checkpoint_files(out)}
    if stock_files != out_files:
        raise RuntimeError(f"file sets differ: only-stock={sorted(stock_files - out_files)} "
                           f"only-repaired={sorted(out_files - stock_files)}")

    index = json.loads((stock / "model.safetensors.index.json").read_text())["weight_map"]
    bridge = load_file(bridge_path)
    key_map = merger_key_map(index, bridge)

    identical_files, rewritten_files, differing_files = [], [], []
    for name in sorted(stock_files):
        if name in merger_shards:
            rewritten_files.append(name)
            continue
        if _file_sha256(stock / name) == _file_sha256(out / name):
            identical_files.append(name)
        else:
            differing_files.append(name)
    if differing_files:
        raise RuntimeError(f"non-merger files differ: {differing_files}")

    n_identical, differing_tensors = 0, []
    for shard in sorted({v for v in index.values()}):
        left, right = _tensor_digests(stock / shard), _tensor_digests(out / shard)
        if set(left) != set(right):
            raise RuntimeError(f"{shard}: tensor key sets differ")
        for key, meta in left.items():
            if meta == right[key]:
                n_identical += 1
            else:
                differing_tensors.append(key)
    outside = sorted(set(differing_tensors) - set(key_map))
    if outside:
        raise RuntimeError(f"tensors outside the merger changed: {outside}")
    unchanged_merger = sorted(set(key_map) - set(differing_tensors))
    if not differing_tensors:
        raise RuntimeError("no merger tensor differs from stock — the repair is a no-op")

    # the repaired merger must BE the bridge (cast), not merely something else
    merger_stats = []
    for shard in sorted(merger_shards):
        shard_keys = [k for k in key_map if index[k] == shard]
        stock_t = load_file(stock / shard)
        out_t = load_file(out / shard)
        for key in sorted(shard_keys):
            want = bridge[key_map[key]].to(stock_t[key].dtype)
            if not torch.equal(out_t[key], want):
                raise RuntimeError(f"{key}: repaired tensor != bridge tensor cast to "
                                   f"{stock_t[key].dtype}")
            served = out_t[key].float() - stock_t[key].float()
            trained = bridge[key_map[key]].float() - stock_t[key].float()
            norm = float(stock_t[key].float().norm())
            merger_stats.append({
                "key": key,
                "shape": list(stock_t[key].shape),
                "dtype": str(stock_t[key].dtype),
                "params": int(stock_t[key].numel()),
                "bytes_equal": key not in differing_tensors,
                "max_abs_diff": round(float(served.abs().max()), 6),
                "rel_fro": round(float(served.norm()) / norm, 6),
                # what the fp32 bridge actually learned, before the serving cast
                "max_abs_diff_fp32": round(float(trained.abs().max()), 6),
                "rel_fro_fp32": round(float(trained.norm()) / norm, 6),
            })
        del stock_t, out_t
    return {
        "stock_dir": str(stock),
        "repaired_dir": str(out),
        "bridge_weights": bridge_path,
        "bridge_sha256": _file_sha256(bridge_path),
        # the training run rewrites this path at every val improvement — pin WHICH
        # checkpoint was served, not just its path
        "bridge_mtime_utc": datetime.fromtimestamp(
            Path(bridge_path).stat().st_mtime, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "bridge_bytes": Path(bridge_path).stat().st_size,
        "n_tensors_total": n_identical + len(differing_tensors),
        "n_tensors_byte_identical": n_identical,
        "n_tensors_changed": len(differing_tensors),
        "merger_tensors_unchanged_after_cast": unchanged_merger,
        "merger_params": sum(s["params"] for s in merger_stats),
        "changed_params": sum(s["params"] for s in merger_stats if not s["bytes_equal"]),
        "files_byte_identical": identical_files,
        "files_rewritten": rewritten_files,
        "merger": merger_stats,
    }


@app.function(image=image, cpu=2.0, timeout=1800, volumes={DATA_PATH: bench_data_volume})
def collect_reports(candidates: dict, benches: list) -> dict:
    """{arm: candidate} -> {arm: {bench: {found, path, payload, n_predictions}}} from
    the benchmarks' OWN report files on ocr-rl-trainer-data-0."""
    bench_data_volume.reload()
    root = Path(DATA_PATH) / "extbench"
    out: dict[str, dict] = {}
    for arm, candidate in candidates.items():
        out[arm] = {}
        for bench in benches:
            if bench == "olmocr":
                path = root / "olmocr" / "reports" / candidate / "summary.txt"
                preds = list((root / "olmocr" / "bench_data" / candidate).rglob("*.md"))
                payload = None
                if path.exists():
                    text = path.read_text()
                    marker = text.rfind("Final Summary")
                    payload = text[marker:] if marker >= 0 else text[-8000:]
            elif bench == "omnidoc":
                results = root / "omnidoc" / "results" / candidate
                path = results / f"{candidate}_quick_match_metric_result.json"
                if not path.exists():
                    found = sorted(results.glob("*_quick_match_metric_result.json")) \
                        if results.is_dir() else []
                    path = found[-1] if found else path
                preds = list((root / "omnidoc" / "preds" / candidate).glob("*.md"))
                payload = json.loads(path.read_text()) if path.exists() else None
            else:
                path = root / "pulse" / "results" / candidate / "summary_with_langs.json"
                preds = list((root / "pulse" / "preds" / candidate).glob("*.html"))
                payload = json.loads(path.read_text()) if path.exists() else None
            out[arm][bench] = {"found": payload is not None, "path": str(path),
                               "payload": payload, "n_predictions": len(preds)}
    return out


items_image = (
    modal.Image.debian_slim(python_version="3.12")
    # tokenizers: exact output-token counts against the served vocab
    # rapidfuzz: how much of a forbidden string an `absent`-test page still holds
    .pip_install("tokenizers", "rapidfuzz")
    .add_local_python_source("modal_extbench_bridge")
)


def _pred_paths(root: Path, candidate: str) -> dict[str, dict[str, Path]]:
    """{bench: {key: prediction path}} in each bench app's own output layout.

    Keys are the join keys used elsewhere: the olmOCR test's `pdf` field, the
    OmniDocBench page stem, the PulseBench sample id.
    """
    olmocr = root / "olmocr" / "bench_data"
    return {
        "olmocr": {str(p.relative_to(olmocr / "pdfs")):
                   olmocr / candidate / p.parent.relative_to(olmocr / "pdfs")
                   / f"{p.stem}_pg1_repeat1.md"
                   for p in sorted((olmocr / "pdfs").rglob("*.pdf"))},
        "omnidoc": {p.stem: p
                    for p in sorted((root / "omnidoc" / "preds" / candidate).glob("*.md"))},
        "pulse": {p.stem: p
                  for p in sorted((root / "pulse" / "preds" / candidate).glob("*.html"))},
    }


@app.function(image=items_image, cpu=8.0, memory=32768, timeout=3600,
              volumes={DATA_PATH: bench_data_volume, MODELS_PATH: models_volume})
def collect_items(candidates: dict, repaired_arm: str = DEFAULT_REPAIRED_ARM,
                  n_samples: int = 60, seed: int = 0) -> dict:
    """Item-level olmOCR confusion + per-prediction degeneration, both arms.

    Everything is read from the benches' OWN artifacts on ocr-rl-trainer-data-0:
    the category jsonls and each arm's failed.jsonl/summary.txt give exact per-test
    pass/fail (checked against the scorer's printed tables), and the generated
    markdown/HTML gives length, cap hits and repetition per page.
    """
    from tokenizers import Tokenizer

    bench_data_volume.reload()
    root = Path(DATA_PATH) / "extbench"
    stock_cand, repaired_cand = candidates[ARM_STOCK], candidates[repaired_arm]
    tokenizer = Tokenizer.from_file(f"{EXPORTS}/{stock_cand}/tokenizer.json")

    jsonl_rows = {name: [json.loads(line) for line in
                         (root / "olmocr" / "bench_data" / name).read_text().splitlines()
                         if line.strip()]
                  for name in OLMOCR_JSONLS}
    universe = olmocr_universe(jsonl_rows)
    # the jsonls carry every test's full spec; failed.jsonl only carries the arm's own
    # failures, so a test both arms passed has no gold there
    spec_by_id = {row["id"]: row for rows in jsonl_rows.values() for row in rows}
    failed, reasons, summaries = {}, {}, {}
    for arm, cand in ((ARM_STOCK, stock_cand), (repaired_arm, repaired_cand)):
        rep_dir = root / "olmocr" / "reports" / cand
        rows = [json.loads(line)
                for line in (rep_dir / "failed.jsonl").read_text().splitlines()
                if line.strip()]
        failed[arm] = {r["id"]: r for r in rows}
        text = (rep_dir / "summary.txt").read_text(errors="replace")
        reasons[arm] = olmocr_failure_reasons(text)
        summaries[arm] = parse_olmocr_summary(text)
    confusion = item_confusion(universe, failed[ARM_STOCK], failed[repaired_arm])

    preds = {arm: _pred_paths(root, cand)
             for arm, cand in ((ARM_STOCK, stock_cand), (repaired_arm, repaired_cand))}
    texts: dict[str, dict[str, dict[str, str]]] = {}
    stats: dict[str, dict[str, dict[str, dict]]] = {}
    for arm, benches in preds.items():
        texts[arm], stats[arm] = {}, {}
        for bench, paths in benches.items():
            texts[arm][bench], stats[arm][bench] = {}, {}
            for key, path in paths.items():
                body = path.read_text(errors="replace") if path.exists() else ""
                repetition, top_gram = repetition_fraction(body)
                texts[arm][bench][key] = body
                stats[arm][bench][key] = {
                    "chars": len(body),
                    "tokens": len(tokenizer.encode(body, add_special_tokens=False).ids),
                    "repetition": round(repetition, 4),
                    "top_gram": round(top_gram, 4),
                    "table_markup": has_table_markup(body),
                    "emphasis_per_1k": round(emphasis_rate(body), 3),
                    "exists": path.exists(),
                }
            print(f"[items] {arm}/{bench}: {len(paths)} predictions read", flush=True)

    def item_pathology(arm: str, test_id: str) -> dict:
        rec = stats[arm]["olmocr"][universe[test_id]["pdf"]]
        return {"pred": texts[arm]["olmocr"][universe[test_id]["pdf"]],
                "repetition": rec["repetition"],
                "at_cap": rec["tokens"] >= CAP_MARGIN * GEN_CAP["olmocr"],
                "chars": rec["chars"], "tokens": rec["tokens"]}

    pass_fail = transition_ids(universe, failed[ARM_STOCK], failed[repaired_arm],
                               "pass_fail")
    fail_pass = transition_ids(universe, failed[ARM_STOCK], failed[repaired_arm],
                               "fail_pass")
    kinds: dict[str, str] = {}
    for test_id in pass_fail:
        path = item_pathology(repaired_arm, test_id)
        kinds[test_id] = failure_kind(reasons[repaired_arm].get(test_id, ""),
                                      path["pred"], path["repetition"], path["at_cap"])
    kind_counts = {
        "overall": dict(Counter(kinds.values()).most_common()),
        "by_test_type": {t: dict(Counter(k for i, k in kinds.items()
                                         if universe[i]["type"] == t).most_common())
                         for t in sorted({universe[i]["type"] for i in pass_fail})},
        "by_source_file": {f: dict(Counter(k for i, k in kinds.items()
                                           if universe[i]["source_file"] == f).most_common())
                           for f in sorted({universe[i]["source_file"] for i in pass_fail})},
    }
    # the same labels over the stock arm's failures: the split is the model's, not the
    # scorer's, only if stock does NOT fail the same way
    stock_kinds = Counter()
    for test_id in failed[ARM_STOCK]:
        path = item_pathology(ARM_STOCK, test_id)
        stock_kinds[failure_kind(reasons[ARM_STOCK].get(test_id, ""), path["pred"],
                                 path["repetition"], path["at_cap"])] += 1

    # Silico's "25 paisa" check: a fuzzy text failure re-scored against the scorer's OWN
    # threshold after markdown decoration is removed from both sides. Only `present`
    # tests qualify — an `absent` failure means the string WAS found, which stripping
    # can only make more true.
    artifacts: dict[str, list] = {}
    for test_id in pass_fail:
        probe = scorer_ratio_and_threshold(reasons[repaired_arm].get(test_id, ""))
        gold = str(spec_by_id.get(test_id, {}).get("text") or "")
        if probe is None or not gold:
            continue
        threshold, scored = probe
        pred = texts[repaired_arm]["olmocr"][universe[test_id]["pdf"]]
        raw = contains_ratio(gold, pred)
        artifacts.setdefault(universe[test_id]["type"], []).append({
            "id": test_id, "threshold": threshold, "scorer_ratio": scored,
            "our_ratio": round(raw, 4),
            "bare_ratio": round(contains_ratio(strip_emphasis(gold),
                                               strip_emphasis(pred)), 4),
        })
    artifact_summary = {}
    for kind, rows in sorted(artifacts.items()):
        n = len(rows)
        artifact_summary[kind] = {
            "n": n,
            # our instrument vs the scorer's on the same items — the bare_ratio below is
            # only comparable to `threshold` if these agree
            "mean_abs_diff_vs_scorer": round(
                sum(abs(r["our_ratio"] - r["scorer_ratio"]) for r in rows) / n, 4),
            "recovered_by_stripping_emphasis": sum(
                1 for r in rows if r["our_ratio"] < r["threshold"]
                and r["bare_ratio"] >= r["threshold"]),
            "mean_scorer_ratio": round(sum(r["scorer_ratio"] for r in rows) / n, 4),
            "mean_bare_ratio": round(sum(r["bare_ratio"] for r in rows) / n, 4),
        }

    samples = []
    for test_id in stratified_sample(pass_fail, universe, n_samples, seed):
        meta = universe[test_id]
        spec = failed[repaired_arm][test_id]
        s_path, r_path = item_pathology(ARM_STOCK, test_id), item_pathology(repaired_arm,
                                                                           test_id)
        samples.append({
            "id": test_id, "type": meta["type"], "source_file": meta["source_file"],
            "pdf": meta["pdf"], "auto_kind": kinds[test_id],
            "scorer_reason": reasons[repaired_arm].get(test_id, ""),
            "gold": {k: spec.get(k) for k in GOLD_FIELDS
                     if spec.get(k) not in (None, "")},
            "stock": {"chars": s_path["chars"], "tokens": s_path["tokens"],
                      "repetition": s_path["repetition"], "at_cap": s_path["at_cap"],
                      "pred": clip(s_path["pred"])},
            "repaired": {"chars": r_path["chars"], "tokens": r_path["tokens"],
                         "repetition": r_path["repetition"], "at_cap": r_path["at_cap"],
                         "pred": clip(r_path["pred"])},
        })

    absent = {"cells": {}, "fail_pass_pages": []}
    baseline_by_pdf = {m["pdf"]: i for i, m in universe.items() if m["type"] == "baseline"}
    for cell in ("pass_pass", "pass_fail", "fail_pass", "fail_fail"):
        ids = [i for i in transition_ids(universe, failed[ARM_STOCK], failed[repaired_arm],
                                         cell) if universe[i]["type"] == "absent"]
        rows = [(stats[ARM_STOCK]["olmocr"][universe[i]["pdf"]],
                 stats[repaired_arm]["olmocr"][universe[i]["pdf"]]) for i in ids]
        n = len(rows) or 1
        ratios = {arm: [contains_ratio(str(spec_by_id[i].get("text", "")),
                                       texts[arm]["olmocr"][universe[i]["pdf"]])
                        for i in ids]
                  for arm in (ARM_STOCK, repaired_arm)}
        absent["cells"][cell] = {
            "n_items": len(ids),
            "n_pages": len({universe[i]["pdf"] for i in ids}),
            "stock_mean_chars": round(sum(s["chars"] for s, _ in rows) / n, 1),
            "repaired_mean_chars": round(sum(r["chars"] for _, r in rows) / n, 1),
            "repaired_empty": sum(1 for _, r in rows if r["chars"] == 0),
            "repaired_shorter": sum(1 for s, r in rows if r["chars"] < s["chars"]),
            "repaired_repetition_ge_floor": sum(1 for _, r in rows
                                                if r["repetition"] >= REPETITION_FLOOR),
            "repaired_at_cap": sum(1 for _, r in rows
                                   if r["tokens"] >= CAP_MARGIN * GEN_CAP["olmocr"]),
            "repaired_baseline_failed": sum(
                1 for i in ids if baseline_by_pdf.get(universe[i]["pdf"])
                in failed[repaired_arm]),
            # how close a copy of the forbidden string each arm's page still holds:
            # a high ratio under a passed test = emitted but garbled, not omitted
            "stock_mean_contains_ratio": round(sum(ratios[ARM_STOCK]) / n, 3),
            "repaired_mean_contains_ratio": round(sum(ratios[repaired_arm]) / n, 3),
            "repaired_contains_ge": {str(t): sum(1 for r in ratios[repaired_arm]
                                                 if r >= t)
                                     for t in (0.5, 0.7, 0.9)},
        }
    for test_id in fail_pass:
        if universe[test_id]["type"] != "absent":
            continue
        meta = universe[test_id]
        gold = str(spec_by_id[test_id].get("text", ""))
        s_rec = stats[ARM_STOCK]["olmocr"][meta["pdf"]]
        r_rec = stats[repaired_arm]["olmocr"][meta["pdf"]]
        absent["fail_pass_pages"].append({
            "id": test_id, "pdf": meta["pdf"],
            "gold_absent_text": clip(gold, 120, 0),
            "stock_chars": s_rec["chars"], "repaired_chars": r_rec["chars"],
            "repaired_repetition": r_rec["repetition"],
            "stock_contains_ratio": round(
                contains_ratio(gold, texts[ARM_STOCK]["olmocr"][meta["pdf"]]), 3),
            "repaired_contains_ratio": round(
                contains_ratio(gold, texts[repaired_arm]["olmocr"][meta["pdf"]]), 3),
            "repaired_baseline_failed": baseline_by_pdf.get(meta["pdf"])
            in failed[repaired_arm],
        })

    pulse_scores = {}
    for arm, cand in ((ARM_STOCK, stock_cand), (repaired_arm, repaired_cand)):
        path = root / "pulse" / "results" / cand / "scores.json"
        pulse_scores[arm] = (json.loads(path.read_text())["per_sample"]
                             if path.exists() else {})
    # the scorer's per_sample holds only the samples it SCORED; a sample it dropped is
    # absent from that dict, so the universe has to come from the sample set itself
    pulse_ids = sorted(set(stats[ARM_STOCK]["pulse"]) | set(stats[repaired_arm]["pulse"]))

    def pulse_state(arm: str, sid: str) -> str:
        return "missing" if pulse_scores[arm].get(sid) is None else "scored"

    pulse_lang: dict[str, dict] = {}
    for sid in pulse_ids:
        node = pulse_lang.setdefault(sid.split("_")[0],
                                     {"n": 0, "stock_missing": 0, "repaired_missing": 0,
                                      "stock_chars": 0, "repaired_chars": 0})
        node["n"] += 1
        for arm, key in ((ARM_STOCK, "stock"), (repaired_arm, "repaired")):
            node[f"{key}_missing"] += int(pulse_state(arm, sid) == "missing")
            node[f"{key}_chars"] += stats[arm]["pulse"].get(sid, {}).get("chars", 0)
    for node in pulse_lang.values():
        node["stock_mean_chars"] = round(node.pop("stock_chars") / node["n"], 1)
        node["repaired_mean_chars"] = round(node.pop("repaired_chars") / node["n"], 1)

    return {
        "olmocr": {
            "universe": {"n_tests": len(universe),
                         "n_pdfs": len({m["pdf"] for m in universe.values()})},
            "confusion": confusion,
            # each arm against its OWN printed tables (both sides of the confusion set
            # to that arm, so pass_pass is exactly its pass count)
            "confusion_checks": {
                arm: confusion_matches_summary(
                    item_confusion(universe, failed[arm], failed[arm]), summaries[arm])
                for arm in summaries},
            "failure_kinds": kind_counts,
            "stock_failure_kinds": dict(stock_kinds.most_common()),
            "n_pass_fail": len(pass_fail), "n_fail_pass": len(fail_pass),
            "format_artifacts": artifact_summary,
            "samples": samples,
            "absent": absent,
        },
        "degeneration": {
            bench: {arm: degeneration_stats(list(stats[arm][bench].values()),
                                            GEN_CAP[bench])
                    for arm in stats}
            for bench in BENCHES
        },
        "pulse": {"n_samples": len(pulse_ids), "per_language": pulse_lang,
                  "transitions": dict(Counter(
                      f"{pulse_state(ARM_STOCK, s)}->{pulse_state(repaired_arm, s)}"
                      for s in pulse_ids).most_common())},
        "candidates": candidates,
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.local_entrypoint()
def main(materialize: bool = False, verify: bool = False, launch: bool = False,
         collect: bool = False, items: bool = False,
         n_samples: int = 60, seed: int = 0, bridge_path: str = DEFAULT_BRIDGE_PATH,
         repaired_dir: str = DEFAULT_REPAIRED_DIR, stock_dir: str = DEFAULT_STOCK_DIR,
         repaired_arm: str = DEFAULT_REPAIRED_ARM, benches: str = ",".join(BENCHES),
         overwrite: bool = False, out_name: str = ""):
    import hashlib

    bench_list = [b for b in benches.split(",") if b]
    unknown = set(bench_list) - set(BENCHES)
    if unknown:
        raise SystemExit(f"unknown benches {sorted(unknown)}")
    if not any((materialize, verify, launch, collect, items)):
        raise SystemExit("pass one of --materialize / --verify / --launch / --collect "
                         "/ --items")

    if materialize or verify:
        fn = materialize_arms if materialize else verify_arms
        kwargs = {"bridge_path": bridge_path, "repaired_dir": repaired_dir,
                  "stock_dir": stock_dir}
        if materialize:
            kwargs["overwrite"] = overwrite
        report = fn.remote(**kwargs)
        VERIFY_PATH.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=1))
        print(f"[extbench-bridge] wrote {VERIFY_PATH}")
        print(f"[extbench-bridge] {report['n_tensors_byte_identical']}/"
              f"{report['n_tensors_total']} tensors byte-identical, "
              f"{report['n_tensors_changed']} changed "
              f"({report['changed_params']:,} params)")

    if launch:
        for cmd in launch_commands(stock_dir, repaired_dir, bench_list):
            print(cmd)

    if collect:
        candidates = {ARM_STOCK: stock_dir, repaired_arm: repaired_dir}
        prompt = EXTBENCH_DIR / "prompt_cost_effective.json"
        config = {
            "checkpoint": CHECKPOINT,
            "bridge_weights": bridge_path,
            "candidates": candidates,
            "serving": "extbench bench_*.py infer (vLLM, greedy, enable_thinking=false)",
            "prompt_sha256": (hashlib.sha256(prompt.read_bytes()).hexdigest()
                              if prompt.exists() else None),
            "commands": launch_commands(stock_dir, repaired_dir, bench_list),
            "tensor_verification": (json.loads(VERIFY_PATH.read_text())
                                    if VERIFY_PATH.exists() else None),
        }
        bundle = assemble_bundle(collect_reports.remote(candidates, bench_list), config,
                                 repaired_arm=repaired_arm)
        out_path = LOCAL_OUT_PATH if not out_name else LOCAL_OUT_PATH.parent / out_name
        out_path.write_text(json.dumps(bundle, indent=2) + "\n")
        print(f"[extbench-bridge] wrote {out_path}")
        print(markdown_tables(bundle))

    if items:
        candidates = {ARM_STOCK: stock_dir, repaired_arm: repaired_dir}
        bundle = collect_items.remote(candidates, repaired_arm, n_samples, seed)
        out_path = ITEM_OUT_PATH if not out_name else ITEM_OUT_PATH.parent / out_name
        out_path.write_text(json.dumps(bundle, indent=2) + "\n")
        print(f"[extbench-bridge] wrote {out_path}")
        checks = bundle["olmocr"]["confusion_checks"]
        bad = {arm: [k for k, ok in slices.items() if not ok]
               for arm, slices in checks.items()}
        print(f"[extbench-bridge] confusion vs scorer tables: "
              f"{ {arm: (not v) for arm, v in bad.items()} } {bad if any(bad.values()) else ''}")
        print(item_markdown_tables(bundle))
