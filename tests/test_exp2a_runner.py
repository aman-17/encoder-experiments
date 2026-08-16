"""Exp 2a / validation-refit launchers: pre-registered threshold evaluator
(incl. the clamp-at-0 yardstick), sandwich assembly, --check missing-image
accounting, job matrices, and importability without Modal."""

from __future__ import annotations

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

import run_exp2a  # noqa: E402
import run_validation_refits  # noqa: E402


def _cell(linear, half_width, mlp):
    return {"linear": {"metric": linear, "half_width": half_width}, "mlp": {"metric": mlp}}


class TestThresholdEvaluator:
    def test_counts_when_gap_clears_both_bars(self):
        res = run_exp2a.evaluate_gap(_cell(0.60, 0.02, 0.63), _cell(0.40, 0.02, 0.45))
        assert res["gap"] == pytest.approx(0.20)
        assert res["yardstick"] == pytest.approx(0.05)  # smaller (downstream) arm's lift
        assert res["counts"] is True

    def test_gap_within_ci_half_width_does_not_count(self):
        res = run_exp2a.evaluate_gap(_cell(0.44, 0.06, 0.46), _cell(0.40, 0.02, 0.41))
        assert res["gap"] == pytest.approx(0.04)
        assert res["ci_half_width"] == pytest.approx(0.06)  # max over the two arms
        assert res["counts"] is False

    def test_gap_within_accessibility_yardstick_does_not_count(self):
        res = run_exp2a.evaluate_gap(_cell(0.50, 0.01, 0.52), _cell(0.44, 0.01, 0.54))
        assert res["gap"] == pytest.approx(0.06)
        assert res["yardstick"] == pytest.approx(0.10)
        assert res["counts"] is False

    def test_negative_lift_yardstick_clamps_at_zero(self):
        # smaller arm's MLP scores BELOW its linear head: the pre-registered
        # clamp reads the yardstick as 0, so the gap only has to clear the CI
        res = run_exp2a.evaluate_gap(_cell(0.50, 0.01, 0.55), _cell(0.40, 0.01, 0.35))
        assert res["yardstick"] == 0.0
        assert res["counts"] is True

    def test_gap_equal_to_yardstick_does_not_count(self):
        res = run_exp2a.evaluate_gap(_cell(0.50, 0.01, 0.50), _cell(0.45, 0.01, 0.50))
        assert res["gap"] == pytest.approx(res["yardstick"])
        assert res["counts"] is False

    def test_negative_gap_never_counts(self):
        res = run_exp2a.evaluate_gap(_cell(0.40, 0.01, 0.45), _cell(0.50, 0.01, 0.30))
        assert res["gap"] < 0
        assert res["counts"] is False


class TestSandwichAssembly:
    def test_flags_increases_along_the_chain(self):
        cells = {
            ("glyph_id", "144", "S1", "concat4"): _cell(0.50, 0.01, 0.55),
            ("glyph_id", "144", "S2", "point"): _cell(0.40, 0.01, 0.42),
            ("glyph_id", "144", "S3", "point"): _cell(0.45, 0.01, 0.41),
        }
        rows = run_exp2a.assemble_sandwich(cells)
        assert len(rows) == 1
        row = rows[0]
        assert (row["family"], row["budget"], row["s1_readout"]) == ("glyph_id", "144", "concat4")
        assert row["values"] == {
            "S1": {"linear": 0.50, "mlp": 0.55},
            "S2": {"linear": 0.40, "mlp": 0.42},
            "S3": {"linear": 0.45, "mlp": 0.41},
        }
        assert len(row["violations"]) == 1
        v = row["violations"][0]
        assert (v["from"], v["to"], v["head"]) == ("S2", "S3", "linear")
        assert v["increase"] == pytest.approx(0.05)

    def test_one_row_per_s1_readout(self):
        cells = {
            ("cell_row", "400", "S1", "concat4"): _cell(0.30, 0.01, 0.31),
            ("cell_row", "400", "S1", "mean4"): _cell(0.28, 0.01, 0.29),
            ("cell_row", "400", "S2", "point"): _cell(0.25, 0.01, 0.26),
        }
        rows = run_exp2a.assemble_sandwich(cells)
        assert [r["s1_readout"] for r in rows] == ["concat4", "mean4"]
        assert all(set(r["values"]) == {"S1", "S2"} for r in rows)
        assert all(r["violations"] == [] for r in rows)

    def test_absent_s1_still_yields_s2_s3_row(self):
        cells = {
            ("pl1_class", "native", "S2", "point"): _cell(0.80, 0.01, 0.82),
            ("pl1_class", "native", "S3", "point"): _cell(0.70, 0.01, 0.72),
        }
        rows = run_exp2a.assemble_sandwich(cells)
        assert len(rows) == 1
        assert rows[0]["s1_readout"] is None
        assert set(rows[0]["values"]) == {"S2", "S3"}


class TestCheckAccounting:
    def test_names_missing_images(self, tmp_path):
        ids = ["docs/a1", "b2", "c3"]
        cache = tmp_path / "cache"
        cache.mkdir()
        (cache / "docs__a1.sites.safetensors").touch()
        (cache / "b2.safetensors").touch()
        assert run_exp2a.missing_images(cache, ids) == ["c3"]
        report = run_exp2a.cache_report(cache, ids)
        assert report == {
            "dir": str(cache),
            "exists": True,
            "n_expected": 3,
            "n_present": 2,
            "missing": ["c3"],
        }

    def test_absent_dir_reports_everything_missing(self, tmp_path):
        ids = ["a", "b"]
        report = run_exp2a.cache_report(tmp_path / "nope", ids)
        assert report["exists"] is False
        assert report["n_present"] == 0
        assert report["missing"] == ids


class TestExp2aJobMatrix:
    def test_grid_shape_and_flags(self):
        jobs = run_exp2a.build_fit_jobs({"mlp_epochs": 40, "mlp_early_stop": True})
        assert len(jobs) == 48  # 4 site arms x 4 budgets x 3 family jobs
        runs = [j["run"] for j in jobs]
        assert len(set(runs)) == len(runs)
        assert all(j["fit_kwargs"]["mlp_epochs"] == 40 for j in jobs)
        base = [j for j in jobs if j["variant"] == "base"]
        assert all(j["fit_kwargs"]["capacity_match"] == 512 for j in base)
        assert all(j["fit_kwargs"]["probe"] == "glyph_id,cell_row,cell_col,pl1_class" for j in base)
        coords = [j for j in jobs if j["variant"] == "pl2_coords"]
        assert all(j["fit_kwargs"]["append_coords"] is True for j in coords)
        coordsonly = [j for j in jobs if j["variant"] == "pl2_coordsonly"]
        assert all(j["fit_kwargs"]["coords_only"] is True for j in coordsonly)
        assert all("capacity_match" not in j["fit_kwargs"] for j in coordsonly)
        sweep = [j for j in jobs if j["budget"] != "native"]
        assert all(j["fit_kwargs"]["features"] == "/vol/features_sweep" for j in sweep)
        assert all(j["encoders"] == f"{j['tower']}@{j['budget']}" for j in sweep)
        native = [j for j in jobs if j["budget"] == "native"]
        assert all("features" not in j["fit_kwargs"] for j in native)
        assert all(j["encoders"] == j["tower"] for j in native)

    def test_run_dir_round_trips_through_parser(self):
        jobs = run_exp2a.build_fit_jobs({"mlp_epochs": 1})
        for job in jobs:
            parsed = run_exp2a.parse_run_dir(job["run"].split("/", 1)[1])
            assert parsed == {
                "site": job["site"],
                "readout": job["readout"],
                "budget": job["budget"],
                "variant": job["variant"],
            }
        assert run_exp2a.parse_run_dir("recon@144") is None
        assert run_exp2a.parse_recon_dir("recon@144") == {"budget": "144"}
        assert run_exp2a.parse_recon_dir("recon@144__mlp") is None
        assert run_exp2a.parse_recon_dir("S1_concat4@144__base") is None

    def test_needed_cache_dirs(self):
        dirs = run_exp2a.needed_cache_dirs()
        assert len(dirs) == 12  # 3 towers x 4 budgets
        assert "/vol/features_sweep/qwen35_vit__premerge@144" in dirs
        assert "/vol/features/qwen35_decoder_mid" in dirs

    def test_mlp_calibration_hard_errors(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            run_exp2a.load_mlp_calibration(tmp_path / "absent.json")
        empty = tmp_path / "empty.json"
        empty.write_text("{}")
        with pytest.raises(ValueError):
            run_exp2a.load_mlp_calibration(empty)
        bad = tmp_path / "bad.json"
        bad.write_text(json.dumps({"epochs": 5}))
        with pytest.raises(ValueError):
            run_exp2a.load_mlp_calibration(bad)
        good = tmp_path / "good.json"
        cfg = {"mlp_epochs": 60, "mlp_lr": 5e-4, "mlp_early_stop": True}
        good.write_text(json.dumps(cfg))
        assert run_exp2a.load_mlp_calibration(good) == cfg


def _fake_result(probe, lin, mlp, primary="accuracy", encoder="t"):
    def head(m):
        return {
            "real": {"metrics": {primary: m}, "ci95": {primary: [m - 0.02, m + 0.02]}},
            "shuffled": {"metrics": {primary: 0.1}},
            "slices": {},
        }

    return {
        "probe": probe,
        "encoder": encoder,
        "arm": f"{encoder}@na#default/point",
        "primary_metric": primary,
        "n_test": 100,
        "capacity_match": 512,
        "raw_dim": 1024,
        "heads": {"linear": head(lin), "mlp": head(mlp)},
    }


class TestAssembleSummary:
    def test_pl2_delta_gaps_and_errors(self):
        records = []
        for site, readout, lin, mlp in (
            ("S1", "concat4", 0.60, 0.65),
            ("S2", "point", 0.40, 0.45),
            ("S3", "point", 0.35, 0.36),
        ):
            job = {"site": site, "readout": readout, "budget": "144", "variant": "base"}
            records.append({"job": job, "result": _fake_result("glyph_id", lin, mlp)})
        for variant, lin, mlp in (("pl2_coords", 0.30, 0.32), ("pl2_coordsonly", 0.24, 0.25)):
            job = {"site": "S2", "readout": "point", "budget": "144", "variant": variant}
            records.append({"job": job, "result": _fake_result("pl2_extent", lin, mlp, primary="mean_iou")})
        records.append({
            "job": {"site": "S3", "readout": "point", "budget": "144", "variant": "base"},
            "result": {"probe": "cell_row", "encoder": "t", "error": "RuntimeError: boom"},
        })

        summary = run_exp2a.assemble_summary(records, recons=[{"budget": "144", "inverses": {"ridge": {}, "mlp": {}}}])

        assert len(summary["cells"]) == 5
        assert summary["errors"] == [{
            "site": "S3", "readout": "point", "budget": "144", "variant": "base",
            "probe": "cell_row", "error": "RuntimeError: boom",
        }]
        [delta] = summary["pl2_delta_cells"]
        assert (delta["budget"], delta["site"], delta["readout"]) == ("144", "S2", "point")
        assert delta["heads"]["linear"]["metric"] == pytest.approx(0.06)
        assert delta["heads"]["linear"]["half_width"] == pytest.approx(0.02)
        assert delta["heads"]["mlp"]["metric"] == pytest.approx(0.07)

        gap = next(g for g in summary["gap_evaluation"]
                   if g["family"] == "glyph_id" and g["upstream"] == "S1/concat4"
                   and g["downstream"] == "S2/point")
        assert gap["gap"] == pytest.approx(0.20)
        assert gap["counts"] is True
        # pl2 delta cell exists only at S2 -> no cross-site pl2 pair
        assert not any(g["family"] == "pl2_extent" for g in summary["gap_evaluation"])

        fams = {r["family"] for r in summary["sandwich"]}
        assert fams == {"glyph_id", "pl2_extent"}
        assert summary["reconstruction"] == [{"budget": "144", "inverses": {"ridge": {}, "mlp": {}}}]


class TestValidationRunner:
    def test_job_matrix(self):
        jobs = run_validation_refits.build_jobs()
        assert len(jobs) == 32  # 4 configs x 8 towers
        assert len({j["run"] for j in jobs}) == 32
        assert all(j["run"].startswith("validation_v1/") for j in jobs)
        pick = {(j["config"], j["tower"]): j for j in jobs}
        assert pick[("pl2_coords", "qwen35_vit")]["fit_kwargs"] == {
            "probe": "pl2_extent", "append_coords": True,
        }
        assert pick[("pl2_coordsonly", "sam_vit_b")]["fit_kwargs"] == {
            "probe": "pl2_extent", "coords_only": True,
        }
        assert pick[("series_multi", "deepseek_ocr")]["fit_kwargs"] == {
            "probe": "series_id", "meta_filter": "n_series > 1",
        }
        assert pick[("glyph_fontsplit", "clip_vit_l_336__rand")]["fit_kwargs"] == {
            "probe": "glyph_id", "split_by": "font",
        }
        extra = run_validation_refits.build_jobs({"mlp_early_stop": True})
        assert all(j["fit_kwargs"]["mlp_early_stop"] is True for j in extra)

    def test_majority_floor_uses_test_side_of_the_doc_split(self):
        from encoder_experiments.probe_fit import doc_is_train

        rows = [
            {"image_id": f"doc{i:03d}", "doc_id": f"doc{i:03d}", "label": i % 3,
             "meta": {"n_series": 2}}
            for i in range(60)
        ]
        res = run_validation_refits.majority_floor(rows)
        test_labels = [str(r["label"]) for r in rows if not doc_is_train(r["doc_id"], 0.8, 0)]
        label, n = Counter(test_labels).most_common(1)[0]
        assert res == {"n_test": len(test_labels), "floor": n / len(test_labels),
                       "majority_label": label}
        assert run_validation_refits.majority_floor([]) == {
            "n_test": 0, "floor": None, "majority_label": None,
        }

    def test_build_summary_delta_and_floor(self):
        coords = _fake_result("pl2_extent", 0.30, 0.31, primary="mean_iou", encoder="qwen35_vit")
        coordsonly = _fake_result("pl2_extent", 0.235, 0.24, primary="mean_iou", encoder="qwen35_vit")
        glyph = _fake_result("glyph_id", 0.40, 0.44, encoder="qwen35_vit")
        pilot = _fake_result("glyph_id", 0.466, 0.528, encoder="qwen35_vit")
        pair_results = {
            "pl2_coords__qwen35_vit/pl2_extent__qwen35_vit.json": coords,
            "pl2_coordsonly__qwen35_vit/pl2_extent__qwen35_vit.json": coordsonly,
            "glyph_fontsplit__qwen35_vit/glyph_id__qwen35_vit.json": glyph,
        }
        summary = run_validation_refits.build_summary(
            pair_results, series_rows=[], pilot_glyph={"qwen35_vit": pilot},
        )
        tower = summary["towers"]["qwen35_vit"]
        assert tower["pl2_extent"]["delta_mean_iou"]["linear"] == pytest.approx(0.065)
        assert tower["pl2_extent"]["features_plus_coords"][
            "pl2_extent__qwen35_vit"]["linear"]["mean_iou"] == pytest.approx(0.30)
        assert tower["glyph_id"]["font_held_out"][
            "glyph_id__qwen35_vit"]["linear"]["accuracy"] == pytest.approx(0.40)
        assert tower["glyph_id"]["pilot_in_distribution"]["linear"]["accuracy"] == pytest.approx(0.466)
        assert tower["series_id_multi"]["fit"] is None
        assert summary["towers"]["sam_vit_b"]["pl2_extent"]["delta_mean_iou"] is None


def _load_without_modal(name: str):
    spec = importlib.util.spec_from_file_location(f"{name}_nomodal", REPO_ROOT / "pipelines" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_runners_import_without_modal(monkeypatch):
    monkeypatch.setitem(sys.modules, "modal", None)
    monkeypatch.setitem(sys.modules, "modal_extract", None)
    exp2a = _load_without_modal("run_exp2a")
    assert exp2a.modal_extract is None
    assert exp2a.evaluate_gap(_cell(0.6, 0.01, 0.6), _cell(0.4, 0.01, 0.4))["counts"] is True
    refits = _load_without_modal("run_validation_refits")
    assert refits.modal_extract is None
    assert len(refits.build_jobs()) == 32
