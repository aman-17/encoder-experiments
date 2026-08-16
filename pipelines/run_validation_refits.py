"""Measurement-validation refits (validation_v1): Modal CPU fit_probes fan-out
over the 8 pilot towers' EXISTING native caches (/vol/features/<tower>).

Configs (docs/experiments.md §Exp 1b):

    pl2_coords       pl2_extent with [features + coords] heads   (--append-coords)
    pl2_coordsonly   pl2_extent coords-only baseline arm         (--coords-only)
    series_multi     series_id on multi-series rows only         (--meta-filter 'n_series > 1')
    glyph_fontsplit  glyph_id with font-family-held-out split    (--split-by font)

    uv run modal run run_validation_refits.py::validation --plan
    uv run modal run --detach run_validation_refits.py::validation
    uv run modal run run_validation_refits.py::validation --consolidate-only
    uv run modal run --detach run_validation_refits.py::validation \
        --fit-kwargs '{"mlp_epochs": 60, "mlp_early_stop": true}'

Each job gets its own results dir /vol/results/validation_v1/<config>__<tower>/
so the pl2 twin arms can never clobber each other's per-pair JSONs. --fit-kwargs
merges extra probe_fit flags (underscored) into every job. Consolidation (runs
after the fits, or alone with --consolidate-only) pulls the per-pair JSONs, the
series_id probe rows, and the pilot_v1 glyph_id results from the volume, writes
the raw JSONs under validation/validation_v1/ and the per-tower numbers to
validation/refits_summary.json — raw numbers only:

    pl2_extent      mean_iou for features+coords and coords-only + the delta
    series_id_multi accuracy + the majority floor on the test side of the
                    same deterministic doc split (computed from probe rows)
    glyph_id        font-held-out accuracy + the pilot in-distribution number

Importable without Modal: the job matrix and consolidation math are pure; the
Modal plumbing activates only when `modal` resolves.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

try:
    import modal
    import modal_extract
except ImportError:
    modal = None
    modal_extract = None

REPO_ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = REPO_ROOT / "validation" / "refits_summary.json"

RUN = "validation_v1"
PILOT_RUN = "pilot_v1"
PROBES_SUBPATH = "probes.jsonl"

PILOT_TOWERS = [
    "clip_vit_l_336",
    "clip_vit_l_336__rand",
    "siglip2_so400m_384",
    "siglip2_so400m_384__rand",
    "siglip2_naflex",
    "sam_vit_b",
    "qwen35_vit",
    "deepseek_ocr",
]

# config name -> probe_fit fit_kwargs (config names must not contain "__":
# the job dir <config>__<tower> is split on the first "__" at consolidation)
CONFIGS: dict[str, dict] = {
    "pl2_coords": {"probe": "pl2_extent", "append_coords": True},
    "pl2_coordsonly": {"probe": "pl2_extent", "coords_only": True},
    "series_multi": {"probe": "series_id", "meta_filter": "n_series > 1"},
    "glyph_fontsplit": {"probe": "glyph_id", "split_by": "font"},
}

# the fits run with probe_fit's own split defaults; the majority floor must
# use the same split to describe the same test population
TRAIN_FRAC = 0.8
SPLIT_SEED = 0


def build_jobs(extra_fit_kwargs: dict | None = None, run: str = RUN) -> list[dict]:
    """The (config x tower) job matrix; extra_fit_kwargs merges into every job."""
    return [
        {
            "config": config,
            "tower": tower,
            "encoders": tower,
            "run": f"{run}/{config}__{tower}",
            "fit_kwargs": {**kwargs, **(extra_fit_kwargs or {})},
        }
        for config, kwargs in CONFIGS.items()
        for tower in PILOT_TOWERS
    ]


def _head_numbers(res: dict) -> dict:
    """Primary-metric numbers (+ CI + shuffled control) per head from one
    probe_fit results JSON; error JSONs pass through as {"error": ...}."""
    if "error" in res:
        return {"error": res["error"]}
    primary = res["primary_metric"]
    out: dict = {"primary_metric": primary, "arm": res.get("arm"), "n_test": res.get("n_test")}
    for head, h in res.get("heads", {}).items():
        out[head] = {
            primary: h["real"]["metrics"][primary],
            "ci95": h["real"]["ci95"][primary],
            "shuffled": h["shuffled"]["metrics"][primary],
        }
    return out


def _single_result(files: dict[str, dict]) -> dict | None:
    """The job dir's one successful results JSON, or None if zero/ambiguous."""
    results = [r for r in files.values() if isinstance(r, dict) and "heads" in r]
    return results[0] if len(results) == 1 else None


def _delta_mean_iou(coords: dict | None, coords_only: dict | None) -> dict | None:
    if not coords or not coords_only:
        return None
    out = {}
    for head in ("linear", "mlp"):
        a = coords["heads"].get(head)
        b = coords_only["heads"].get(head)
        if a and b:
            out[head] = a["real"]["metrics"]["mean_iou"] - b["real"]["metrics"]["mean_iou"]
    return out or None


def _is_multi_series(row: dict) -> bool:
    n = (row.get("meta") or {}).get("n_series")
    return isinstance(n, (int, float)) and n > 1


def majority_floor(rows: list[dict], train_frac: float = TRAIN_FRAC,
                   split_seed: int = SPLIT_SEED) -> dict:
    """Majority-class share among probe rows landing on the TEST side of the
    same deterministic doc split the fits use (probe_fit.doc_is_train)."""
    from encoder_experiments.probe_fit import derive_doc_id, doc_is_train

    labels = [
        str(r["label"])
        for r in rows
        if not doc_is_train(r.get("doc_id") or derive_doc_id(r["image_id"]), train_frac, split_seed)
    ]
    if not labels:
        return {"n_test": 0, "floor": None, "majority_label": None}
    label, n = Counter(labels).most_common(1)[0]
    return {"n_test": len(labels), "floor": n / len(labels), "majority_label": label}


def group_results(pair_results: dict[str, dict]) -> dict[tuple[str, str], dict[str, dict]]:
    """{'<config>__<tower>/<file>.json': res} -> {(config, tower): {stem: res}}."""
    grouped: dict[tuple[str, str], dict[str, dict]] = {}
    for relpath, res in pair_results.items():
        jobdir, _, fname = relpath.partition("/")
        if "__" not in jobdir or not fname.endswith(".json"):
            continue
        config, _, tower = jobdir.partition("__")
        grouped.setdefault((config, tower), {})[fname[:-5]] = res
    return grouped


def build_summary(pair_results: dict[str, dict], series_rows: list[dict],
                  pilot_glyph: dict[str, dict], run: str = RUN) -> dict:
    grouped = group_results(pair_results)
    floor = majority_floor([r for r in series_rows if _is_multi_series(r)])

    def numbers(config: str, tower: str) -> dict | None:
        files = grouped.get((config, tower))
        if not files:
            return None
        return {stem: _head_numbers(res) for stem, res in sorted(files.items())}

    towers = {}
    for tower in PILOT_TOWERS:
        towers[tower] = {
            "pl2_extent": {
                "features_plus_coords": numbers("pl2_coords", tower),
                "coords_only": numbers("pl2_coordsonly", tower),
                "delta_mean_iou": _delta_mean_iou(
                    _single_result(grouped.get(("pl2_coords", tower), {})),
                    _single_result(grouped.get(("pl2_coordsonly", tower), {})),
                ),
            },
            "series_id_multi": {
                "fit": numbers("series_multi", tower),
                "majority_floor": floor,
            },
            "glyph_id": {
                "font_held_out": numbers("glyph_fontsplit", tower),
                "pilot_in_distribution": (
                    _head_numbers(pilot_glyph[tower]) if tower in pilot_glyph else None
                ),
            },
        }
    return {
        "run": run,
        "pilot_run": PILOT_RUN,
        "split": {"by": "document", "train_frac": TRAIN_FRAC, "seed": SPLIT_SEED},
        "towers": towers,
    }


if modal_extract is not None:
    app = modal_extract.app

    _fetch_image = (
        modal.Image.debian_slim(python_version="3.13")
        .add_local_python_source("modal_extract", "run_validation_refits")
    )

    @app.function(
        image=_fetch_image,
        volumes={modal_extract.VOL_PATH: modal_extract.data_volume},
        timeout=1800,
    )
    def fetch_validation(
        run: str = RUN,
        pilot_run: str = PILOT_RUN,
        probes_subpath: str = PROBES_SUBPATH,
    ) -> dict:
        """Container-mount fetch of the per-pair JSONs under /vol/results/<run>/,
        the series_id probe rows, and the pilot glyph_id JSONs. A mount after
        reload() sees the latest committed state (the `modal volume` CLI serves
        stale views during concurrent commits — see fetch_frontier.py); doc
        lists and tracebacks are stripped to keep the payload small.
        """
        modal_extract.data_volume.reload()
        strip = ("train_docs", "test_docs", "traceback")

        results: dict[str, dict] = {}
        root = Path(modal_extract.VOL_PATH) / "results" / run
        if root.is_dir():
            for path in sorted(root.rglob("*.json")):
                res = json.loads(path.read_text())
                results[str(path.relative_to(root))] = {
                    k: v for k, v in res.items() if k not in strip
                }

        series_rows = []
        probes = Path(modal_extract.VOL_PATH) / "corpus" / probes_subpath
        with open(probes) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if row.get("probe") == "series_id":
                    series_rows.append({
                        "image_id": row["image_id"],
                        "doc_id": row.get("doc_id"),
                        "label": row["label"],
                        "meta": row.get("meta") or {},
                    })

        pilot: dict[str, dict] = {}
        for tower in PILOT_TOWERS:
            path = Path(modal_extract.VOL_PATH) / "results" / pilot_run / f"glyph_id__{tower}.json"
            if path.exists():
                res = json.loads(path.read_text())
                pilot[tower] = {k: v for k, v in res.items() if k not in strip}

        return {"results": results, "series_rows": series_rows, "pilot_glyph": pilot}

    @app.local_entrypoint()
    def validation(
        plan: bool = False,
        consolidate_only: bool = False,
        fit_kwargs: str = "",
        run: str = RUN,
    ):
        """Fan out fit_probes over the job matrix, then consolidate. --plan
        prints the matrix without launching; --consolidate-only skips the fits;
        --fit-kwargs merges extra probe_fit flags (JSON) into every job."""
        jobs = build_jobs(json.loads(fit_kwargs) if fit_kwargs else None, run=run)
        if plan:
            for job in jobs:
                print(json.dumps(job))
            print(f"[validation] {len(jobs)} jobs "
                  f"({len(CONFIGS)} configs x {len(PILOT_TOWERS)} towers) -> /vol/results/{run}/")
            return

        if not consolidate_only:
            calls = [(PROBES_SUBPATH, j["encoders"], j["fit_kwargs"], j["run"]) for j in jobs]
            print(f"[validation] launching {len(calls)} fit_probes jobs -> /vol/results/{run}/")
            results = list(modal_extract.fit_probes.starmap(calls, return_exceptions=True))
            ok = 0
            for job, res in zip(jobs, results):
                label = f"{job['config']} x {job['tower']}"
                if isinstance(res, Exception):
                    print(f"[FAIL] {label}: {type(res).__name__}: {res}")
                else:
                    ok += 1
                    print(f"[ok]   {label} -> /vol/results/{job['run']}/")
            print(f"[validation] {ok}/{len(calls)} jobs succeeded")

        got = fetch_validation.remote(run=run)
        raw_dir = SUMMARY_PATH.parent / run
        for relpath, res in got["results"].items():
            path = raw_dir / relpath
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(res, indent=2) + "\n")
        summary = build_summary(got["results"], got["series_rows"], got["pilot_glyph"], run=run)
        SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n")
        print(f"[validation] pulled {len(got['results'])} per-pair JSONs -> {raw_dir}")
        print(f"[validation] wrote {SUMMARY_PATH}")
