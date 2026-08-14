"""Exp-3 frontier scorer: generated markdown vs the pilot_1k gold corpus.

Scores a directory of predicted markdown files (one ``<image_id>.md`` per page
image) against the pilot corpus gold at ``data/pilot_1k`` (``docs/<gen>/<id>.test.json``
plus gold ``.md`` sidecars; ``images.jsonl`` maps ``image_id`` -> doc).

Per-family metrics
------------------
- **tables / replicator** — content-TEDS on the extracted ``<table>`` HTML vs
  ``test.json``'s ``expected_markdown``, computed by the *vendored benchmark
  implementation* (``parse_rl_utils/pb_table``, imported unmodified — see
  ``_pb_table()``). When either side has no ``<table`` tag the score falls back
  to the normalized edit-distance similarity below (recorded as
  ``metric="edit_sim_fallback"``).
- **text / math** — normalized character edit-distance similarity
  ``1 - levenshtein / max(len)`` vs the gold markdown, after the light
  normalization documented in :func:`normalize_text`.
- **charts** — ``chart_data_point`` rule **recall**: the fraction of the
  ``test.json`` rules whose ``(labels..., value)`` tuple appears in the
  prediction. A rule passes when every label appears as a (whitespace-collapsed)
  substring of the prediction AND the rule's value matches one of the numbers
  parsed from the prediction under ``normalize_numbers`` semantics (strip
  ``$``/``%``/commas, compare with 1e-6 relative tolerance; non-numeric values
  fall back to substring containment). **This is a RECALL proxy, not the full
  benchmark chart matcher** — it does not check label/value adjacency, series
  disambiguation, or ``max_diffs`` counting, so it can over-credit predictions
  that scatter the right numbers next to the wrong labels.

Text normalization (:func:`normalize_text`), applied to BOTH sides of every
edit-distance comparison:
  1. strip HTML emphasis tags (``<b> <i> <u> <s> <em> <strong> <del> <ins>
     <mark> <sub> <sup>``, open and close),
  2. strip markdown emphasis markers: ``**``, ``__``, ``*`` and backtick runs
     (single ``_`` is deliberately KEPT — it is a math subscript in the math
     family, not emphasis),
  3. collapse every whitespace run to a single space and strip the ends.
Case, punctuation and digits are untouched.

Outputs
-------
``score_pred_dir`` writes, deterministically (docs sorted by image_id, floats
rounded to 6 places):
  - ``scores.jsonl`` — one line per doc: image_id, doc_id, family/generator,
    metric name and score (+ per-family detail fields),
  - ``summary.json`` — per-family n / mean / 95% CI over docs (normal
    approximation, sample std) plus the overall mean.
``write_runs_table`` renders one line per (stack, budget) run — a markdown
table of per-family means for multiple prediction dirs.

CLI
---
    python -m encoder_experiments.frontier_score score \
        --pred-dir PREDS --images data/pilot_1k/images.jsonl --out-dir OUT \
        [--only-preds] [--limit N]
    python -m encoder_experiments.frontier_score table \
        --images data/pilot_1k/images.jsonl --out-dir OUT \
        --run STACK:BUDGET:PRED_DIR [--run ...] [--only-preds]

Missing prediction files score 0.0 (``metric="missing_pred"``) unless
``--only-preds`` restricts scoring to image_ids that have a prediction file.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import math
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz.distance import Levenshtein

# --------------------------------------------------------------------------- #
# Vendored benchmark table metric (pb_table) — imported, never modified.      #
# --------------------------------------------------------------------------- #

_DEFAULT_PB_TABLE_PARENT = (
    Path(__file__).resolve().parents[3]
    / "ocr_postraining"
    / "training"
    / "training_pipeline"
    / "parse_rl_utils"
)

_pb_table_mod = None


def _pb_table():
    """Import the vendored ``pb_table`` package (GriTS/TEDS) lazily.

    The package lives in the sibling ``ocr_postraining`` tree; override the
    location with ``FRONTIER_PB_TABLE_DIR`` (path of the directory that
    CONTAINS ``pb_table/``).
    """
    global _pb_table_mod
    if _pb_table_mod is None:
        parent = Path(os.environ.get("FRONTIER_PB_TABLE_DIR", _DEFAULT_PB_TABLE_PARENT))
        if str(parent) not in sys.path:
            sys.path.insert(0, str(parent))
        import pb_table  # noqa: PLC0415

        _pb_table_mod = pb_table
    return _pb_table_mod


def teds_content_score(pred_markdown: str, gold_markdown: str) -> float:
    """Content-TEDS via the vendored eval implementation (stdout suppressed —
    the vendored metric prints progress unconditionally)."""
    pb = _pb_table()
    with contextlib.redirect_stdout(io.StringIO()):
        return float(pb.teds_score(pred_markdown, gold_markdown))


# --------------------------------------------------------------------------- #
# Text normalization + edit-distance similarity                               #
# --------------------------------------------------------------------------- #

_HTML_EMPH_RE = re.compile(
    r"</?(?:b|i|u|s|em|strong|del|ins|mark|sub|sup)\s*>", re.IGNORECASE
)
_MD_EMPH_RE = re.compile(r"\*\*|__|\*|`+")
_WS_RE = re.compile(r"\s+")


def normalize_text(s: str) -> str:
    """Light normalization for edit-distance scoring (see module docstring)."""
    s = _HTML_EMPH_RE.sub("", s or "")
    s = _MD_EMPH_RE.sub("", s)
    return _WS_RE.sub(" ", s).strip()


def edit_similarity(pred: str, gold: str) -> float:
    """``1 - levenshtein/maxlen`` on :func:`normalize_text`-normalized strings.

    Both-empty compares equal (1.0); one-side-empty scores 0.0.
    """
    a, b = normalize_text(pred), normalize_text(gold)
    if not a and not b:
        return 1.0
    denom = max(len(a), len(b))
    return 1.0 - Levenshtein.distance(a, b) / denom


# --------------------------------------------------------------------------- #
# Charts: chart_data_point rule recall (proxy)                                #
# --------------------------------------------------------------------------- #

_NUM_TOKEN_RE = re.compile(r"[-+]?[$]?\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?%?")


def _normalize_number(tok: str) -> float | None:
    """``normalize_numbers`` semantics: strip ``$``, ``%``, commas and spaces,
    then parse as float. Returns None when the remainder is not a number."""
    cleaned = tok.strip().replace("$", "").replace("%", "").replace(",", "").replace(" ", "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _numbers_in(text: str) -> list[float]:
    out = []
    for m in _NUM_TOKEN_RE.finditer(text):
        v = _normalize_number(m.group(0))
        if v is not None:
            out.append(v)
    return out


def chart_rule_recall(pred_markdown: str, rules: list[dict]) -> tuple[float, int, int]:
    """Fraction of ``chart_data_point`` rules recalled by the prediction.

    RECALL PROXY (see module docstring): labels are matched as substrings of the
    whitespace-collapsed prediction; the value must match some number in the
    prediction within 1e-6 relative tolerance (abs 1e-9 for zeros). Returns
    ``(recall, passed, total)``; ``total == 0`` yields recall 0.0.
    """
    cdp_rules = [r for r in rules if r.get("type") == "chart_data_point"]
    if not cdp_rules:
        return 0.0, 0, 0
    norm_pred = _WS_RE.sub(" ", pred_markdown or "")
    pred_numbers = _numbers_in(norm_pred)
    passed = 0
    for rule in cdp_rules:
        labels = [_WS_RE.sub(" ", str(lbl)).strip() for lbl in rule.get("labels", [])]
        if not all(lbl in norm_pred for lbl in labels if lbl):
            continue
        raw_value = str(rule.get("value", ""))
        gold_v = _normalize_number(raw_value)
        if gold_v is None:
            ok = _WS_RE.sub(" ", raw_value).strip() in norm_pred
        else:
            ok = any(
                math.isclose(p, gold_v, rel_tol=1e-6, abs_tol=1e-9) for p in pred_numbers
            )
        if ok:
            passed += 1
    return passed / len(cdp_rules), passed, len(cdp_rules)


# --------------------------------------------------------------------------- #
# Gold corpus access                                                          #
# --------------------------------------------------------------------------- #

TABLE_FAMILIES = {"tables", "replicator"}
TEXT_FAMILIES = {"text", "math"}
CHART_FAMILIES = {"charts"}
FAMILY_ORDER = ["tables", "replicator", "text", "math", "charts"]


@dataclass(frozen=True)
class GoldDoc:
    generator: str
    doc_id: str
    markdown: str | None  # expected_markdown, or the gold .md sidecar
    rules: list  # test_rules (charts)


def load_images_jsonl(path: Path) -> list[dict]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    rows.sort(key=lambda r: r["image_id"])
    return rows


def load_gold(dataset_root: Path, generator: str, doc_id: str) -> GoldDoc:
    """Gold for one doc. ``expected_markdown`` from ``<id>.test.json`` when
    present; otherwise the ``<id>.gold.md`` / ``<id>.md`` sidecar (charts store
    gold markdown only in ``.gold.md``; math duplicates it in both)."""
    doc_dir = dataset_root / "docs" / generator
    test = json.loads((doc_dir / f"{doc_id}.test.json").read_text())
    markdown = test.get("expected_markdown")
    if markdown is None:
        for cand in (doc_dir / f"{doc_id}.gold.md", doc_dir / f"{doc_id}.md"):
            if cand.exists():
                markdown = cand.read_text()
                break
    return GoldDoc(generator, doc_id, markdown, test.get("test_rules") or [])


# --------------------------------------------------------------------------- #
# Per-doc scoring                                                             #
# --------------------------------------------------------------------------- #

def _has_table(md: str | None) -> bool:
    return "<table" in (md or "").lower()


def score_doc(pred_markdown: str | None, gold: GoldDoc) -> dict:
    """Route one doc to its family metric. Returns the scores.jsonl record body
    (without image ids)."""
    gen = gold.generator
    if pred_markdown is None:
        return {"family": gen, "metric": "missing_pred", "score": 0.0}

    if gen in CHART_FAMILIES:
        recall, passed, total = chart_rule_recall(pred_markdown, gold.rules)
        return {
            "family": gen,
            "metric": "chart_rule_recall",
            "score": recall,
            "rules_passed": passed,
            "rules_total": total,
        }

    gold_md = gold.markdown or ""
    if gen in TABLE_FAMILIES:
        if _has_table(gold_md) and _has_table(pred_markdown):
            return {
                "family": gen,
                "metric": "teds_content",
                "score": teds_content_score(pred_markdown, gold_md),
            }
        return {
            "family": gen,
            "metric": "edit_sim_fallback",
            "score": edit_similarity(pred_markdown, gold_md),
        }

    # text / math / any unknown generator: edit-distance similarity.
    return {
        "family": gen,
        "metric": "edit_sim",
        "score": edit_similarity(pred_markdown, gold_md),
    }


# --------------------------------------------------------------------------- #
# Directory scoring + summaries                                               #
# --------------------------------------------------------------------------- #

def _mean_ci(values: list[float]) -> dict:
    n = len(values)
    mean = sum(values) / n if n else 0.0
    if n > 1:
        var = sum((v - mean) ** 2 for v in values) / (n - 1)
        half = 1.96 * math.sqrt(var / n)
    else:
        half = 0.0
    return {
        "n": n,
        "mean": round(mean, 6),
        "ci95_lo": round(mean - half, 6),
        "ci95_hi": round(mean + half, 6),
    }


def score_pred_dir(
    pred_dir: Path,
    images_jsonl: Path,
    out_dir: Path,
    *,
    only_preds: bool = False,
    limit: int | None = None,
) -> dict:
    """Score every image in ``images_jsonl`` against ``pred_dir/<image_id>.md``.

    Writes ``out_dir/scores.jsonl`` and ``out_dir/summary.json``; returns the
    summary dict. Deterministic: docs sorted by image_id.
    """
    dataset_root = images_jsonl.resolve().parent
    rows = load_images_jsonl(images_jsonl)
    if only_preds:
        rows = [r for r in rows if (pred_dir / f"{r['image_id']}.md").exists()]
    if limit is not None:
        rows = rows[:limit]

    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for row in rows:
        pred_path = pred_dir / f"{row['image_id']}.md"
        pred_md = pred_path.read_text() if pred_path.exists() else None
        gold = load_gold(dataset_root, row["generator"], row["doc_id"])
        rec = {
            "image_id": row["image_id"],
            "doc_id": row["doc_id"],
            "generator": row["generator"],
            **score_doc(pred_md, gold),
        }
        rec["score"] = round(float(rec["score"]), 6)
        records.append(rec)

    with (out_dir / "scores.jsonl").open("w") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    by_family: dict[str, list[float]] = {}
    for rec in records:
        by_family.setdefault(rec["family"], []).append(rec["score"])
    families = sorted(by_family, key=lambda g: (FAMILY_ORDER.index(g) if g in FAMILY_ORDER else 99, g))
    summary = {
        "pred_dir": str(pred_dir),
        "n_docs": len(records),
        "n_missing_pred": sum(1 for r in records if r["metric"] == "missing_pred"),
        "overall": _mean_ci([r["score"] for r in records]) if records else _mean_ci([]),
        "families": {g: _mean_ci(by_family[g]) for g in families},
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    return summary


def write_runs_table(runs: list[tuple[str, str, dict]], out_path: Path) -> str:
    """One line per (stack, budget): markdown table of per-family means.

    ``runs`` is ``[(stack, budget, summary_dict), ...]`` where the summary is
    what :func:`score_pred_dir` returns. Writes ``out_path`` and returns the
    rendered table.
    """
    fams = FAMILY_ORDER + sorted(
        {f for _, _, s in runs for f in s["families"]} - set(FAMILY_ORDER)
    )
    header = ["stack", "budget", "n", "overall"] + fams
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    for stack, budget, s in runs:
        cells = [stack, budget, str(s["n_docs"]), f"{s['overall']['mean']:.4f}"]
        for fam in fams:
            fs = s["families"].get(fam)
            cells.append(f"{fs['mean']:.4f}" if fs else "-")
        lines.append("| " + " | ".join(cells) + " |")
    table = "\n".join(lines) + "\n"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(table)
    return table


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("score", help="score one prediction dir")
    sp.add_argument("--pred-dir", type=Path, required=True)
    sp.add_argument("--images", type=Path, required=True, help="pilot images.jsonl")
    sp.add_argument("--out-dir", type=Path, required=True)
    sp.add_argument("--only-preds", action="store_true",
                    help="score only image_ids that have a prediction file")
    sp.add_argument("--limit", type=int, default=None)

    tp = sub.add_parser("table", help="score several runs, write one-line-per-run table")
    tp.add_argument("--images", type=Path, required=True)
    tp.add_argument("--out-dir", type=Path, required=True)
    tp.add_argument("--run", action="append", required=True, metavar="STACK:BUDGET:PRED_DIR",
                    help="repeatable; pred dir of one (stack,budget) run")
    tp.add_argument("--only-preds", action="store_true")

    args = ap.parse_args(argv)

    if args.cmd == "score":
        summary = score_pred_dir(
            args.pred_dir, args.images, args.out_dir,
            only_preds=args.only_preds, limit=args.limit,
        )
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0

    runs = []
    for spec in args.run:
        stack, budget, pred_dir = spec.split(":", 2)
        run_out = args.out_dir / f"{stack}__{budget}"
        summary = score_pred_dir(Path(pred_dir), args.images, run_out, only_preds=args.only_preds)
        runs.append((stack, budget, summary))
    table = write_runs_table(runs, args.out_dir / "runs_table.md")
    print(table, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
