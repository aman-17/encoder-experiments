"""Exp 2a bridge-localization grid (exp2a_v1): the pre-registered probe fan-out
over the production tower's three sites, the S2->S1 reconstruction test, and
the sandwich/threshold assembler (pre-registration:
exp2a-bridge-localization.md; deliverables are raw JSONs, no conclusions).

Arms {S1 concat4, S1 mean4, S2 point, S3 point} x budgets {144, 400, 1024,
native} x families {glyph_id, cell_row, cell_col, pl1_class, pl2_extent as an
append-coords + coords-only twin} x heads linear+MLP (MLP config read from
validation/mlp_calibration.json — hard error if absent), capacity-match 512,
shuffled controls from probe_fit itself. Caches per site:

    S1  /vol/features_sweep/qwen35_vit__premerge@<b>/    /vol/features/qwen35_vit__premerge/
    S2  /vol/features_sweep/qwen35_vit@<b>/              /vol/features/qwen35_vit/
    S3  /vol/features_sweep/qwen35_decoder_mid@<b>/      /vol/features/qwen35_decoder_mid/

    uv run modal run run_exp2a.py::exp2a --plan          # print the job matrix
    uv run modal run run_exp2a.py::exp2a --check         # cache completeness only; nonzero exit if incomplete
    uv run modal run --detach run_exp2a.py::exp2a        # check -> fits -> reconstruction -> assemble
    uv run modal run run_exp2a.py::exp2a --assemble-only # re-run the assembler on existing results

The runner refuses to fit unless every needed cache dir holds all 1,420 corpus
images (--allow-partial overrides; --check names the missing). Fit jobs write
/vol/results/exp2a_v1/<site>_<readout>@<budget>__<variant>/ — one dir per job,
so the pl2 twin arms never clobber. Reconstruction (encoder_experiments.
reconstruct: S2->S1 per budget, headline families; each result JSON carries
both inverse kinds in its "inverses" map) writes
/vol/results/exp2a_v1/recon@<budget>/. The assembler folds every
per-pair JSON into /vol/results/exp2a_v1/exp2a_summary.json (cells, pl2 delta
cells, sandwich table, threshold evaluation, reconstruction, errors) and a
local copy lands at validation/exp2a_summary.json.

Pre-registered decision rule (evaluate_gap): a site gap COUNTS iff it exceeds
BOTH the bootstrap CI half-width (max over the two arms' linear-head 95% CIs)
and the smaller arm's own linear->MLP lift, with a negative lift CLAMPED AT 0.
pl2_extent enters the sandwich/gap tables only as
delta((features + coords) - coords_only) on mean_iou, never as absolute mIoU.

Importable without Modal: matrix, evaluator, and assembler are pure; the Modal
plumbing activates only when `modal` resolves.
"""

from __future__ import annotations

import json
from itertools import pairwise
from pathlib import Path
from typing import Iterable

try:
    import modal_extract
except ImportError:
    modal_extract = None

REPO_ROOT = Path(__file__).resolve().parent
MLP_CALIBRATION_PATH = REPO_ROOT / "validation" / "mlp_calibration.json"
LOCAL_SUMMARY_PATH = REPO_ROOT / "validation" / "exp2a_summary.json"

RUN = "exp2a_v1"
PROBES_SUBPATH = "probes.jsonl"
VOL_ROOT = "/vol"
N_CORPUS_IMAGES = 1420

S1_TOWER = "qwen35_vit__premerge"
S2_TOWER = "qwen35_vit"
S3_TOWER = "qwen35_decoder_mid"

SITE_ORDER = ("S1", "S2", "S3")
S1_READOUTS = ("concat4", "mean4")
SITES: tuple[tuple[str, str, str], ...] = (
    ("S1", S1_TOWER, "concat4"),
    ("S1", S1_TOWER, "mean4"),
    ("S2", S2_TOWER, "point"),
    ("S3", S3_TOWER, "point"),
)
BUDGETS: tuple[int | None, ...] = (144, 400, 1024, None)  # None = native

# variant -> (--probe filter, extra fit_kwargs); variant names must not
# contain "__" (the job dir <site>_<readout>@<budget>__<variant> is split on
# "__" when parsed back)
FAMILY_JOBS: tuple[tuple[str, str, dict], ...] = (
    ("base", "glyph_id,cell_row,cell_col,pl1_class", {}),
    ("pl2_coords", "pl2_extent", {"append_coords": True}),
    ("pl2_coordsonly", "pl2_extent", {"coords_only": True}),
)
CAPACITY_MATCH = 512
HEADLINE_FAMILIES = ("glyph_id", "pl2_extent")

MLP_CALIBRATION_KEYS = ("mlp_epochs", "mlp_lr", "mlp_early_stop", "mlp_hidden", "mlp_batch")


def load_mlp_calibration(path: Path = MLP_CALIBRATION_PATH) -> dict:
    """The measurement-validation MLP config, as probe_fit mlp_* fit_kwargs.
    The file's `config` block holds bare head kwargs ({epochs, lr,
    early_stop, ...}, alongside `evidence`/`notes`); flat mlp_*-keyed files
    are accepted too. Hard error if absent, empty, or carrying unknown knobs
    — the grid must never run on uncalibrated defaults by accident."""
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found — exp2a's MLP head config comes from the "
            "measurement-validation calibration; write it before launching"
        )
    cfg = json.loads(path.read_text())
    if isinstance(cfg, dict) and isinstance(cfg.get("config"), dict):
        cfg = {f"mlp_{k}": v for k, v in cfg["config"].items()}
    if not isinstance(cfg, dict) or not cfg:
        raise ValueError(f"{path}: expected a non-empty dict of mlp_* fit_kwargs, got {cfg!r}")
    unknown = set(cfg) - set(MLP_CALIBRATION_KEYS)
    if unknown:
        raise ValueError(
            f"{path}: unknown keys {sorted(unknown)}; allowed: {list(MLP_CALIBRATION_KEYS)}"
        )
    return cfg


def budget_label(budget: int | None) -> str:
    return "native" if budget is None else str(budget)


def cache_dir(tower: str, budget: int | None) -> str:
    if budget is None:
        return f"{VOL_ROOT}/features/{tower}"
    return f"{VOL_ROOT}/features_sweep/{tower}@{budget}"


def fit_features_args(tower: str, budget: int | None) -> tuple[str, dict]:
    """(--encoders value, extra fit_kwargs) addressing the right cache root.
    fit_probes always passes --features /vol/features first and appends
    fit_kwargs after, so a 'features' kwarg overrides it (argparse last-wins)
    — that is how sweep caches are reached without touching modal_extract."""
    if budget is None:
        return tower, {}
    return f"{tower}@{budget}", {"features": f"{VOL_ROOT}/features_sweep"}


def needed_cache_dirs() -> list[str]:
    towers = list(dict.fromkeys(tower for _, tower, _ in SITES))
    return [cache_dir(tower, budget) for tower in towers for budget in BUDGETS]


def build_fit_jobs(mlp_cfg: dict, run: str = RUN) -> list[dict]:
    jobs = []
    for site, tower, readout in SITES:
        for budget in BUDGETS:
            encoders, extra = fit_features_args(tower, budget)
            for variant, probe, flags in FAMILY_JOBS:
                fit_kwargs = {
                    "probe": probe,
                    "readout": readout,
                    "capacity_match": CAPACITY_MATCH,
                    **extra,
                    **flags,
                    **mlp_cfg,
                }
                if flags.get("coords_only"):
                    # coords-only X is 2-dim; an orthonormal projection cannot
                    # widen to 512, and the baseline is not a cross-arm
                    # capacity comparison in the first place
                    fit_kwargs.pop("capacity_match")
                jobs.append({
                    "site": site,
                    "tower": tower,
                    "readout": readout,
                    "budget": budget_label(budget),
                    "variant": variant,
                    "encoders": encoders,
                    "run": f"{run}/{site}_{readout}@{budget_label(budget)}__{variant}",
                    "fit_kwargs": fit_kwargs,
                })
    return jobs


def build_recon_jobs() -> list[str]:
    return [budget_label(b) for b in BUDGETS]


def parse_run_dir(name: str) -> dict | None:
    """'<site>_<readout>@<budget>__<variant>' -> job fields, else None."""
    left, sep, right = name.partition("@")
    if not sep or "__" not in right or "_" not in left:
        return None
    budget, _, variant = right.partition("__")
    site, _, readout = left.partition("_")
    known = (
        site in SITE_ORDER
        and readout in ("point", *S1_READOUTS)
        and variant in {v for v, _, _ in FAMILY_JOBS}
        and (budget == "native" or budget.isdigit())
    )
    if not known:
        return None
    return {"site": site, "readout": readout, "budget": budget, "variant": variant}


def parse_recon_dir(name: str) -> dict | None:
    """'recon@<budget>' -> {budget}, else None (each recon JSON carries its
    own per-inverse blocks)."""
    if not name.startswith("recon@"):
        return None
    budget = name[len("recon@"):]
    if not (budget == "native" or budget.isdigit()):
        return None
    return {"budget": budget}


def missing_images(cache_dir: Path, image_ids: Iterable[str]) -> list[str]:
    """image_ids with neither feature layout present in cache_dir."""
    from encoder_experiments.extract import safe_image_id
    from encoder_experiments.site_store import SITES_SUFFIX

    missing = []
    for image_id in image_ids:
        stem = safe_image_id(image_id)
        if not (
            (cache_dir / f"{stem}.safetensors").exists()
            or (cache_dir / f"{stem}{SITES_SUFFIX}").exists()
        ):
            missing.append(image_id)
    return missing


def cache_report(cache_dir: Path, image_ids: list[str]) -> dict:
    exists = cache_dir.is_dir()
    missing = missing_images(cache_dir, image_ids) if exists else list(image_ids)
    return {
        "dir": str(cache_dir),
        "exists": exists,
        "n_expected": len(image_ids),
        "n_present": len(image_ids) - len(missing),
        "missing": missing,
    }


def print_cache_reports(reports: dict[str, dict]) -> bool:
    complete = True
    for d in sorted(reports):
        r = reports[d]
        if r["missing"]:
            complete = False
            shown = ", ".join(r["missing"][:50])
            more = len(r["missing"]) - 50
            print(f"[check] {d}: {r['n_present']}/{r['n_expected']} present; "
                  f"missing: {shown}" + (f" ... +{more} more" if more > 0 else ""))
        else:
            print(f"[check] {d}: complete ({r['n_present']}/{r['n_expected']})")
    return complete


def result_cell(res: dict) -> dict:
    """Per-head {metric, ci95, half_width, shuffled} on the primary metric,
    from one probe_fit results JSON."""
    primary = res["primary_metric"]
    cell = {}
    for head, h in res["heads"].items():
        lo, hi = h["real"]["ci95"][primary]
        cell[head] = {
            "metric": h["real"]["metrics"][primary],
            "ci95": [lo, hi],
            "half_width": (hi - lo) / 2,
            "shuffled": h["shuffled"]["metrics"][primary],
        }
    return cell


def pl2_delta_cell(coords: dict, coords_only: dict) -> dict:
    """The pl2 measurement: delta((features + coords) - coords_only) per head;
    half_width = max of the two arms' (pre-registered conservative choice)."""
    cell = {}
    for head in ("linear", "mlp"):
        if head in coords and head in coords_only:
            cell[head] = {
                "metric": coords[head]["metric"] - coords_only[head]["metric"],
                "half_width": max(coords[head]["half_width"], coords_only[head]["half_width"]),
            }
    return cell


def accessibility_yardstick(cell: dict) -> float:
    """The arm's linear->MLP lift; PRE-REGISTERED CLAMP: a negative lift reads
    as 0 (an MLP scoring below its linear head is fit noise, not evidence of
    higher accessibility)."""
    return max(0.0, cell["mlp"]["metric"] - cell["linear"]["metric"])


def evaluate_gap(upstream: dict, downstream: dict) -> dict:
    """Pre-registered threshold rule: the gap COUNTS iff it exceeds BOTH the
    CI half-width (max over the two arms' linear-head 95% CIs) and the smaller
    arm's accessibility yardstick. Cells: {'linear': {'metric', 'half_width'},
    'mlp': {'metric'}}."""
    gap = upstream["linear"]["metric"] - downstream["linear"]["metric"]
    half_width = max(upstream["linear"]["half_width"], downstream["linear"]["half_width"])
    smaller = min(upstream, downstream, key=lambda c: c["linear"]["metric"])
    yardstick = accessibility_yardstick(smaller)
    return {
        "gap": gap,
        "ci_half_width": half_width,
        "yardstick": yardstick,
        "counts": bool(gap > half_width and gap > yardstick),
    }


def assemble_sandwich(cells: dict[tuple[str, str, str, str], dict]) -> list[dict]:
    """DPI sandwich rows per (family, budget, s1_readout): site values along
    S1 -> S2 -> S3 plus every metric INCREASE along the chain (the artifact
    detector — recoverable information cannot increase downstream). Cells are
    keyed (family, budget, site, readout); absent sites are skipped."""
    rows = []
    for family, budget in sorted({(f, b) for f, b, _, _ in cells}):
        s1_readouts = [r for r in S1_READOUTS if (family, budget, "S1", r) in cells] or [None]
        for s1_readout in s1_readouts:
            chain = []
            if s1_readout is not None:
                chain.append(("S1", cells[(family, budget, "S1", s1_readout)]))
            for site in ("S2", "S3"):
                cell = cells.get((family, budget, site, "point"))
                if cell is not None:
                    chain.append((site, cell))
            if not chain:
                continue
            row = {
                "family": family,
                "budget": budget,
                "s1_readout": s1_readout,
                "values": {
                    site: {h: c[h]["metric"] for h in ("linear", "mlp") if h in c}
                    for site, c in chain
                },
                "violations": [],
            }
            for (sa, ca), (sb, cb) in pairwise(chain):
                for head in ("linear", "mlp"):
                    if head in ca and head in cb and cb[head]["metric"] > ca[head]["metric"]:
                        row["violations"].append({
                            "from": sa,
                            "to": sb,
                            "head": head,
                            "increase": cb[head]["metric"] - ca[head]["metric"],
                        })
            rows.append(row)
    return rows


def evaluate_gaps(cells: dict[tuple[str, str, str, str], dict]) -> list[dict]:
    out = []
    for family, budget in sorted({(f, b) for f, b, _, _ in cells}):
        pairs = []
        for readout in S1_READOUTS:
            pairs.append((("S1", readout), ("S2", "point")))
            pairs.append((("S1", readout), ("S3", "point")))
        pairs.append((("S2", "point"), ("S3", "point")))
        for (sa, ra), (sb, rb) in pairs:
            up = cells.get((family, budget, sa, ra))
            down = cells.get((family, budget, sb, rb))
            if not up or not down or "mlp" not in up or "mlp" not in down:
                continue
            out.append({
                "family": family,
                "budget": budget,
                "upstream": f"{sa}/{ra}",
                "downstream": f"{sb}/{rb}",
                **evaluate_gap(up, down),
            })
    return out


def strip_tracebacks(obj):
    if isinstance(obj, dict):
        return {k: strip_tracebacks(v) for k, v in obj.items() if k != "traceback"}
    if isinstance(obj, list):
        return [strip_tracebacks(v) for v in obj]
    return obj


def assemble_summary(records: list[dict], recons: list[dict] | None = None) -> dict:
    """records: [{'job': parse_run_dir fields, 'result': probe_fit JSON}];
    recons: raw reconstruct JSONs tagged with {budget, inverse}. Output is the
    exp2a_summary.json payload: raw cells + pl2 delta cells + sandwich +
    threshold evaluation + reconstruction + errors, no conclusions."""
    cells_raw: list[dict] = []
    errors: list[dict] = []
    keyed: dict[tuple[str, str, str, str], dict] = {}
    pl2_arms: dict[tuple[str, str, str], dict[str, dict]] = {}

    for rec in records:
        job, res = rec["job"], rec["result"]
        if "error" in res:
            errors.append({**job, "probe": res.get("probe"), "error": res["error"]})
            continue
        cell = result_cell(res)
        cells_raw.append({
            **job,
            "family": res["probe"],
            "tower": res.get("encoder"),
            "arm": res.get("arm"),
            "primary_metric": res["primary_metric"],
            "n_test": res.get("n_test"),
            "capacity_match": res.get("capacity_match"),
            "raw_dim": res.get("raw_dim"),
            "heads": cell,
        })
        if job["variant"] == "base":
            keyed[(res["probe"], job["budget"], job["site"], job["readout"])] = cell
        elif job["variant"] in ("pl2_coords", "pl2_coordsonly"):
            arm_key = "coords" if job["variant"] == "pl2_coords" else "coordsonly"
            pl2_arms.setdefault((job["budget"], job["site"], job["readout"]), {})[arm_key] = cell

    pl2_delta_cells = []
    for (budget, site, readout), arms in sorted(pl2_arms.items()):
        if "coords" in arms and "coordsonly" in arms:
            delta = pl2_delta_cell(arms["coords"], arms["coordsonly"])
            if delta:
                keyed[("pl2_extent", budget, site, readout)] = delta
                pl2_delta_cells.append({
                    "budget": budget, "site": site, "readout": readout, "heads": delta,
                })

    return {
        "run": RUN,
        "pre_registration": "exp2a-bridge-localization.md",
        "capacity_match": CAPACITY_MATCH,
        "sites": [{"site": s, "tower": t, "readout": r} for s, t, r in SITES],
        "budgets": [budget_label(b) for b in BUDGETS],
        "decision_rule": {
            "counts_iff_gap_exceeds": ["ci_half_width", "yardstick"],
            "ci_half_width": "max over the two arms' linear-head 95% CI half-widths",
            "yardstick": "max(0, smaller_arm_mlp - smaller_arm_linear)",
            "pl2_cells": "delta((features + coords) - coords_only) on mean_iou",
        },
        "cells": cells_raw,
        "pl2_delta_cells": pl2_delta_cells,
        "sandwich": assemble_sandwich(keyed),
        "gap_evaluation": evaluate_gaps(keyed),
        "reconstruction": strip_tracebacks(recons or []),
        "errors": errors,
    }


if modal_extract is not None:
    app = modal_extract.app
    assert modal_extract.VOL_PATH == VOL_ROOT

    _image = modal_extract.image.add_local_python_source("modal_extract", "run_exp2a")
    _volumes = {modal_extract.VOL_PATH: modal_extract.data_volume}

    @app.function(image=_image, cpu=2.0, timeout=1800, volumes=_volumes)
    def check_caches(
        dirs: list[str],
        images_subpath: str = "images.jsonl",
        expected: int = N_CORPUS_IMAGES,
    ) -> dict:
        """Per-dir completeness reports against the corpus manifest; a manifest
        that does not hold exactly `expected` images is a hard error (wrong
        corpus, not a partial cache)."""
        modal_extract.data_volume.reload()
        manifest = Path(modal_extract.VOL_PATH) / "corpus" / images_subpath
        rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
        ids = [r["image_id"] for r in rows]
        if len(ids) != expected:
            raise RuntimeError(f"{manifest}: {len(ids)} images, expected {expected}")
        return {d: cache_report(Path(d), ids) for d in dirs}

    @app.function(image=_image, cpu=16.0, memory=65536, timeout=3600 * 4, volumes=_volumes)
    def reconstruct_pair(budget: str, run: str = RUN) -> dict:
        """S2->S1 reconstruction (feature R^2 + functional residual on the
        headline families, both inverse kinds in one pass) for one budget,
        via the encoder_experiments.reconstruct pipeline — no forked logic
        here. --inv-early-stop per the calibration evidence (the un-stopped
        MLP inverse fails to generalize; the ridge inverse is unaffected)."""
        from encoder_experiments.reconstruct import main as reconstruct_main

        modal_extract.data_volume.reload()
        b = None if budget == "native" else int(budget)
        out = Path(modal_extract.VOL_PATH) / "results" / run / f"recon@{budget}"
        rc = reconstruct_main([
            "--probes", str(Path(modal_extract.VOL_PATH) / "corpus" / PROBES_SUBPATH),
            "--s1", cache_dir(S1_TOWER, b),
            "--s2", cache_dir(S2_TOWER, b),
            "--out", str(out),
            "--families", ",".join(HEADLINE_FAMILIES),
            "--inv-early-stop",
        ])
        modal_extract.data_volume.commit()
        return {"budget": budget, "rc": rc, "out": str(out)}

    @app.function(image=_image, cpu=4.0, memory=16384, timeout=1800, volumes=_volumes)
    def assemble_results(run: str = RUN) -> dict:
        """Fold /vol/results/<run>/ (fit dirs + recon dirs) into
        exp2a_summary.json on the volume; returns the summary."""
        modal_extract.data_volume.reload()
        root = Path(modal_extract.VOL_PATH) / "results" / run
        if not root.is_dir():
            raise FileNotFoundError(f"{root} not found — nothing to assemble")
        records: list[dict] = []
        recons: list[dict] = []
        for jobdir in sorted(p for p in root.iterdir() if p.is_dir()):
            recon = parse_recon_dir(jobdir.name)
            if recon is not None:
                for path in sorted(jobdir.glob("recon__*.json")):
                    recons.append({**recon, **json.loads(path.read_text())})
                continue
            job = parse_run_dir(jobdir.name)
            if job is None:
                continue
            for path in sorted(jobdir.glob("*.json")):
                records.append({"job": job, "result": json.loads(path.read_text())})
        summary = assemble_summary(records, recons)
        (root / "exp2a_summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        modal_extract.data_volume.commit()
        return summary

    @app.local_entrypoint()
    def exp2a(
        plan: bool = False,
        check: bool = False,
        allow_partial: bool = False,
        assemble_only: bool = False,
        run: str = RUN,
    ):
        """check -> fit fan-out -> reconstruction -> assembler. --plan prints
        the job matrix; --check reports cache completeness and exits (nonzero
        if incomplete); --allow-partial fits despite incomplete caches;
        --assemble-only re-runs only the assembler."""
        dirs = needed_cache_dirs()
        if check:
            if not print_cache_reports(check_caches.remote(dirs)):
                raise SystemExit(1)
            return

        mlp_cfg = load_mlp_calibration()
        jobs = build_fit_jobs(mlp_cfg, run=run)
        recon_jobs = build_recon_jobs()
        if plan:
            for job in jobs:
                print(json.dumps(job))
            for budget in recon_jobs:
                print(json.dumps({"recon": {"budget": budget,
                                            "s1": cache_dir(S1_TOWER, None if budget == "native" else int(budget)),
                                            "s2": cache_dir(S2_TOWER, None if budget == "native" else int(budget))}}))
            print(f"[exp2a] {len(jobs)} fit jobs + {len(recon_jobs)} recon jobs "
                  f"over {len(dirs)} cache dirs -> /vol/results/{run}/")
            return

        if not assemble_only:
            if not print_cache_reports(check_caches.remote(dirs)):
                if not allow_partial:
                    print("[exp2a] partial caches — refusing to fit (--allow-partial to override)")
                    raise SystemExit(1)
                print("[exp2a] proceeding on partial caches (--allow-partial)")

            calls = [(PROBES_SUBPATH, j["encoders"], j["fit_kwargs"], j["run"]) for j in jobs]
            print(f"[exp2a] launching {len(calls)} fit_probes jobs -> /vol/results/{run}/")
            results = list(modal_extract.fit_probes.starmap(calls, return_exceptions=True))
            ok = 0
            for job, res in zip(jobs, results):
                label = f"{job['site']}/{job['readout']}@{job['budget']} {job['variant']}"
                if isinstance(res, Exception):
                    print(f"[FAIL] {label}: {type(res).__name__}: {res}")
                else:
                    ok += 1
                    print(f"[ok]   {label} -> /vol/results/{job['run']}/")
            print(f"[exp2a] {ok}/{len(calls)} fit jobs succeeded")

            rcalls = [(budget, run) for budget in recon_jobs]
            print(f"[exp2a] launching {len(rcalls)} reconstruction jobs")
            rresults = list(reconstruct_pair.starmap(rcalls, return_exceptions=True))
            rok = 0
            for (budget, _), res in zip(rcalls, rresults):
                if isinstance(res, Exception):
                    print(f"[FAIL] recon@{budget}: {type(res).__name__}: {res}")
                else:
                    rok += 1
                    print(f"[ok]   recon@{budget}: rc={res['rc']} -> {res['out']}")
            print(f"[exp2a] {rok}/{len(rcalls)} recon jobs succeeded")

        summary = assemble_results.remote(run=run)
        LOCAL_SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        LOCAL_SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n")
        print(f"[exp2a] cells={len(summary['cells'])} "
              f"pl2_delta={len(summary['pl2_delta_cells'])} "
              f"gaps={len(summary['gap_evaluation'])} "
              f"recon={len(summary['reconstruction'])} errors={len(summary['errors'])}")
        print(f"[exp2a] wrote /vol/results/{run}/exp2a_summary.json + {LOCAL_SUMMARY_PATH}")
