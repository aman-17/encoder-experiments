"""B2 additional readout (docs/experiments.md §B2): the exp2a glyph probe on
arm A's REPAIRED S2 features vs stock S2 under the IDENTICAL config.

Repaired S2 = qwen35_vit with arm A's trained merger loaded
(adapters/qwen_vit.py bridge_weights knob), native sites-mode cache at
/vol/features/qwen35_vit__bridgeA. Stock S2 = the existing
/vol/features/qwen35_vit native cache — REFIT here in the same run rather
than copied from exp2a_summary.json, so the comparison is same-config by
construction. Both arms: glyph_id, point readout, capacity_match 512, linear
+ calibrated MLP (validation/mlp_calibration.json), probe_fit defaults
otherwise — the exp2a S2 native cell's exact recipe.

    uv run modal run run_b2_probe_readout.py --plan           # job matrix
    uv run modal run run_b2_probe_readout.py --check          # cache completeness
    uv run modal run --detach run_b2_probe_readout.py         # check -> fits -> assemble
    uv run modal run run_b2_probe_readout.py --assemble-only  # re-assemble existing fits

Fit jobs write /vol/results/b2_probe_readout/<arm>/; the assembler writes
validation/b2_probe_readout.json {stock, repaired, delta, config} — raw
numbers, probe-space statement, no conclusions.
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    import modal_extract
except ImportError:
    modal_extract = None

from run_exp2a import load_mlp_calibration, result_cell

REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_OUT_PATH = REPO_ROOT / "validation" / "b2_probe_readout.json"

RUN = "b2_probe_readout"
PROBES_SUBPATH = "probes.jsonl"
PROBE = "glyph_id"
CAPACITY_MATCH = 512
STOCK_TOWER = "qwen35_vit"
DEFAULT_BRIDGE_TAG = "bridgeA"
DEFAULT_BRIDGE_WEIGHTS = "/vol/phaseb/A_0.0003/bridge.safetensors"


def arms_for(bridged_tower: str) -> tuple[tuple[str, str], ...]:
    return (("stock", STOCK_TOWER), ("repaired", bridged_tower))


def build_fit_jobs(mlp_cfg: dict, run: str = RUN,
                   bridged_tower: str = f"{STOCK_TOWER}__{DEFAULT_BRIDGE_TAG}") -> list[dict]:
    return [
        {
            "arm": arm,
            "encoders": tower,
            "run": f"{run}/{arm}",
            "fit_kwargs": {
                "probe": PROBE,
                "readout": "point",
                "capacity_match": CAPACITY_MATCH,
                **mlp_cfg,
            },
        }
        for arm, tower in arms_for(bridged_tower)
    ]


def assemble_bundle(results: dict[str, dict], mlp_cfg: dict,
                    bridged_tower: str = f"{STOCK_TOWER}__{DEFAULT_BRIDGE_TAG}",
                    bridge_weights: str = DEFAULT_BRIDGE_WEIGHTS) -> dict:
    """{arm: probe_fit results JSON} -> the b2_probe_readout.json payload."""
    from datetime import datetime, timezone

    arms: dict[str, dict] = {}
    for arm, res in results.items():
        if "error" in res:
            raise RuntimeError(f"arm {arm!r} fit errored: {res['error']}")
        arms[arm] = {
            "tower": res["encoder"],
            "arm": res["arm"],
            "primary_metric": res["primary_metric"],
            "n_test": res["n_test"],
            "capacity_match": res["capacity_match"],
            "raw_dim": res["raw_dim"],
            "heads": result_cell(res),
        }
    delta = {
        head: {
            "metric": arms["repaired"]["heads"][head]["metric"]
            - arms["stock"]["heads"][head]["metric"]
        }
        for head in ("linear", "mlp")
        if head in arms["repaired"]["heads"] and head in arms["stock"]["heads"]
    }
    return {
        "experiment": "B2 additional readout (probe-space; docs/experiments.md §B2)",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "stock": arms["stock"],
        "repaired": arms["repaired"],
        "delta": delta,
        "config": {
            "probe": PROBE,
            "readout": "point",
            "budget": "native",
            "capacity_match": CAPACITY_MATCH,
            "heads": ["linear", "mlp"],
            "mlp": mlp_cfg,
            "split": {"by": "document", "train_frac": 0.8, "seed": 0},
            "bootstrap": {"n_resamples": 1000, "unit": "document"},
            "bridge_weights": bridge_weights,
            "caches": {
                "stock": f"/vol/features/{STOCK_TOWER}",
                "repaired": f"/vol/features/{bridged_tower}",
            },
        },
    }


if modal_extract is not None:
    app = modal_extract.app

    _image = modal_extract.image.add_local_python_source(
        "modal_extract", "run_exp2a", "run_b2_probe_readout"
    )
    _volumes = {modal_extract.VOL_PATH: modal_extract.data_volume}

    @app.function(image=_image, cpu=2.0, timeout=1800, volumes=_volumes)
    def collect_fit_results(run: str = RUN,
                            bridged_tower: str = f"{STOCK_TOWER}__{DEFAULT_BRIDGE_TAG}") -> dict:
        """{arm: glyph_id results JSON} from /vol/results/<run>/<arm>/."""
        modal_extract.data_volume.reload()
        root = Path(modal_extract.VOL_PATH) / "results" / run
        out: dict[str, dict] = {}
        for arm, tower in arms_for(bridged_tower):
            path = root / arm / f"{PROBE}__{tower}.json"
            if not path.exists():
                raise FileNotFoundError(f"{path} not found — fit the {arm!r} arm first")
            out[arm] = json.loads(path.read_text())
        return out

    @app.local_entrypoint()
    def b2_probe_readout(
        plan: bool = False,
        check: bool = False,
        allow_partial: bool = False,
        assemble_only: bool = False,
        run: str = "",
        bridge_tag: str = DEFAULT_BRIDGE_TAG,
        bridge_weights: str = "",
        out_name: str = "",
    ):
        from run_exp2a import check_caches, print_cache_reports

        bridged_tower = f"{STOCK_TOWER}__{bridge_tag}"
        if not run:
            run = RUN if bridge_tag == DEFAULT_BRIDGE_TAG else f"{RUN}_{bridge_tag}"
        if not bridge_weights:
            bridge_weights = DEFAULT_BRIDGE_WEIGHTS
        out_path = (LOCAL_OUT_PATH if not out_name
                    else LOCAL_OUT_PATH.parent / out_name)
        mlp_cfg = load_mlp_calibration()
        jobs = build_fit_jobs(mlp_cfg, run=run, bridged_tower=bridged_tower)
        dirs = [f"{modal_extract.VOL_PATH}/features/{tower}"
                for _, tower in arms_for(bridged_tower)]

        if plan:
            for job in jobs:
                print(json.dumps(job))
            print(f"[b2_probe] 2 fit jobs over {dirs} -> /vol/results/{run}/")
            return
        if check:
            if not print_cache_reports(check_caches.remote(dirs)):
                raise SystemExit(1)
            return

        if not assemble_only:
            if not print_cache_reports(check_caches.remote(dirs)):
                if not allow_partial:
                    print("[b2_probe] partial caches — refusing to fit "
                          "(--allow-partial to override)")
                    raise SystemExit(1)
                print("[b2_probe] proceeding on partial caches (--allow-partial)")
            calls = [(PROBES_SUBPATH, j["encoders"], j["fit_kwargs"], j["run"]) for j in jobs]
            print(f"[b2_probe] launching {len(calls)} fit_probes jobs -> /vol/results/{run}/")
            results = list(modal_extract.fit_probes.starmap(calls, return_exceptions=True))
            for job, res in zip(jobs, results):
                if isinstance(res, Exception):
                    raise SystemExit(
                        f"[FAIL] {job['arm']}: {type(res).__name__}: {res}"
                    )
                print(f"[ok] {job['arm']} -> /vol/results/{job['run']}/")

        bundle = assemble_bundle(
            collect_fit_results.remote(run=run, bridged_tower=bridged_tower),
            mlp_cfg, bridged_tower=bridged_tower, bridge_weights=bridge_weights)
        out_path.write_text(json.dumps(bundle, indent=2) + "\n")
        print(f"[b2_probe] wrote {out_path}")
        for arm in ("stock", "repaired"):
            print(f"[b2_probe] {arm}: "
                  + " ".join(f"{h}={c['metric']:.4f}{c['ci95']}"
                             for h, c in bundle[arm]["heads"].items()))
        print(f"[b2_probe] delta: "
              + " ".join(f"{h}={c['metric']:+.4f}" for h, c in bundle["delta"].items()))
