"""B1 twin builder (src/data/make_b1_twins.py) + assembler (run_b1_patching.py):
selection, gold resolution, geometry-free degradation, restoration assembly."""

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


twins = _load("make_b1_twins", ROOT / "src" / "data" / "make_b1_twins.py")
assembler = _load("run_b1_patching", ROOT / "pipelines" / "run_b1_patching.py")


def _row(image_id, gen, sev=0, path=None):
    return {"image_id": image_id, "doc_id": image_id.split("__", 1)[-1],
            "generator": gen, "scan_severity": sev,
            "image_path": path or f"images/clean/{image_id}.png",
            "page_w_px": 220, "page_h_px": 160}


def test_select_twin_rows_filters_and_splits():
    rows = (
        [_row(f"text__t{i:02d}", "text") for i in range(6)]
        + [_row(f"math__m{i:02d}", "math") for i in range(6)]
        + [_row("charts__c1", "charts"), _row("tables__t1", "tables")]
        + [_row("text__deg", "text", sev=2), _row("math__deg", "math", sev=3)]
    )
    got = twins.select_twin_rows(rows, 6)
    gens = [r["generator"] for r in got]
    assert len(got) == 6 and gens.count("text") == 3 and gens.count("math") == 3
    assert all(r["scan_severity"] == 0 for r in got)
    assert got == sorted(got, key=lambda r: r["image_id"])
    assert got == twins.select_twin_rows(list(reversed(rows)), 6)  # order-invariant

    # odd n: text gets the extra slot
    got7 = twins.select_twin_rows(rows, 7)
    assert [r["generator"] for r in got7].count("text") == 4

    # short math pool tops up from text
    rows_short = [_row(f"text__t{i:02d}", "text") for i in range(8)] + [
        _row("math__m00", "math")]
    got6 = twins.select_twin_rows(rows_short, 6)
    gens6 = [r["generator"] for r in got6]
    assert len(got6) == 6 and gens6.count("math") == 1 and gens6.count("text") == 5


@pytest.fixture()
def dataset(tmp_path):
    """Tiny pilot_1k-shaped corpus: 2 text docs (gold in test.json) + 2 math
    docs (gold in the .md sidecar), small clean PNGs with real ink."""
    import cv2

    root = tmp_path / "pilot"
    (root / "images" / "clean").mkdir(parents=True)
    rows = []
    for gen, ids in (("text", ["t01", "t02"]), ("math", ["m01", "m02"])):
        doc_dir = root / "docs" / gen
        doc_dir.mkdir(parents=True)
        for doc_id in ids:
            image_id = f"{gen}__{doc_id}"
            img = np.full((160, 220, 3), 255, np.uint8)
            for k in range(6):
                cv2.putText(img, f"{doc_id} line {k}", (8, 22 + 22 * k),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (20, 20, 20), 1)
            cv2.imwrite(str(root / "images" / "clean" / f"{image_id}.png"), img)
            if gen == "text":
                (doc_dir / f"{doc_id}.test.json").write_text(
                    json.dumps({"expected_markdown": f"# {doc_id}\n\nbody"}))
            else:
                (doc_dir / f"{doc_id}.test.json").write_text(json.dumps({"seed": 1}))
                (doc_dir / f"{doc_id}.md").write_text(f"$${doc_id}$$")
            rows.append(_row(image_id, gen))
    # a text doc with NO resolvable gold: must be skipped, not selected
    (root / "docs" / "text" / "t99.test.json").write_text(json.dumps({"seed": 9}))
    img = np.full((160, 220, 3), 255, np.uint8)
    cv2.imwrite(str(root / "images" / "clean" / "text__t99.png"), img)
    rows.append(_row("text__t99", "text"))

    manifest = root / "images.jsonl"
    manifest.write_text("".join(json.dumps(r) + "\n" for r in rows))
    return root


def test_resolve_gold_path(dataset):
    p, src = twins.resolve_gold_path(dataset, "text", "t01")
    assert src == "test_json" and p.name == "t01.test.json"
    p, src = twins.resolve_gold_path(dataset, "math", "m01")
    assert src == "md_sidecar" and p.name == "m01.md"
    with pytest.raises(FileNotFoundError):
        twins.resolve_gold_path(dataset, "text", "t99")


def test_build_twins_end_to_end(dataset):
    local_rows, modal_rows = twins.build_twins(dataset / "images.jsonl", 4, 2, 0)
    assert len(local_rows) == len(modal_rows) == 4
    assert {r["image_id"] for r in local_rows} == {
        "text__t01", "text__t02", "math__m01", "math__m02"}  # t99: no gold

    import cv2

    for lr, mr in zip(local_rows, modal_rows):
        clean = cv2.imread(lr["clean_path"], cv2.IMREAD_COLOR)
        deg = cv2.imread(lr["degraded_path"], cv2.IMREAD_COLOR)
        assert deg.shape == clean.shape                     # identical pixel dims
        assert (deg != clean).any()                         # actually degraded
        assert Path(lr["gold_path"]).exists()
        assert not Path(mr["clean_path"]).is_absolute()
        assert mr["degraded_path"].startswith("images/degraded_b1/")
        meta = json.loads(Path(
            lr["degraded_path"].replace(".png", ".degrade.json")).read_text())
        assert meta["geom_disabled"] is True
        assert meta["scan_geom_matrix"] == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]

    # determinism: rebuilding produces byte-identical twins
    before = {r["image_id"]: Path(r["degraded_path"]).read_bytes() for r in local_rows}
    local2, _ = twins.build_twins(dataset / "images.jsonl", 4, 2, 0)
    after = {r["image_id"]: Path(r["degraded_path"]).read_bytes() for r in local2}
    assert before == after


def test_twin_key_and_manifest_paths(tmp_path):
    assert twins.twin_key("degrade", 2, 2) == "sev2ng"
    assert twins.twin_key("degrade", 3, 2) == "sev3ng"
    assert twins.twin_key("resample", 2, 2) == "rs2x"
    assert twins.twin_key("resample", 2, 3) == "rs3x"
    with pytest.raises(ValueError):
        twins.twin_key("warp", 2, 2)
    # v1 config keeps the untagged v1 names; every other variant is tagged
    local, modal = twins.manifest_paths(tmp_path, "sev2ng")
    assert (local.name, modal.name) == (
        "images_twins_b1.jsonl", "images_twins_b1_modal.jsonl")
    local, modal = twins.manifest_paths(tmp_path, "rs2x")
    assert (local.name, modal.name) == (
        "images_twins_b1_rs2x.jsonl", "images_twins_b1_rs2x_modal.jsonl")


def test_build_twins_resample_mode(dataset):
    local_rows, modal_rows = twins.build_twins(
        dataset / "images.jsonl", 4, 2, 0,
        mode="resample", factor=2, out_name="degraded_b1_v2")
    assert len(local_rows) == len(modal_rows) == 4

    import cv2

    for lr, mr in zip(local_rows, modal_rows):
        clean = cv2.imread(lr["clean_path"], cv2.IMREAD_COLOR)
        deg = cv2.imread(lr["degraded_path"], cv2.IMREAD_COLOR)
        assert deg.shape == clean.shape                     # identical pixel dims
        assert (deg != clean).any()                         # actually degraded
        assert lr["severity_key"] == "rs2x"
        assert lr["degraded_path"].endswith("__rs2x.png")
        assert mr["degraded_path"].startswith("images/degraded_b1_v2/")
        meta = json.loads(Path(
            lr["degraded_path"].replace(".png", ".resample.json")).read_text())
        assert meta["mode"] == "resample" and meta["factor"] == 2

    # same-pages contract: every variant selects the identical page set
    degrade_rows, _ = twins.build_twins(dataset / "images.jsonl", 4, 3, 0,
                                        out_name="degraded_b1_v2")
    assert ([r["image_id"] for r in degrade_rows]
            == [r["image_id"] for r in local_rows])
    assert degrade_rows[0]["degraded_path"].endswith("__sev3ng.png")

    # determinism: rebuilding produces byte-identical twins
    before = {r["image_id"]: Path(r["degraded_path"]).read_bytes() for r in local_rows}
    local2, _ = twins.build_twins(dataset / "images.jsonl", 4, 2, 0,
                                  mode="resample", factor=2,
                                  out_name="degraded_b1_v2")
    after = {r["image_id"]: Path(r["degraded_path"]).read_bytes() for r in local2}
    assert before == after


def test_assembler_end_to_end(dataset, tmp_path):
    local_rows, _ = twins.build_twins(dataset / "images.jsonl", 4, 2, 0)
    manifest = dataset / "images_twins_b1.jsonl"
    manifest.write_text("".join(json.dumps(r) + "\n" for r in local_rows))

    golds = {"text__t01": "# t01\n\nbody", "text__t02": "# t02\n\nbody",
             "math__m01": "$$m01$$", "math__m02": "$$m02$$"}
    preds = {
        "anchor": golds,                                          # perfect
        "floor": {k: "zzz" for k in golds},                       # ruined
        "patch_s2": golds,                                        # full restore
        "patch_s3": {k: v[: len(v) // 2] for k, v in golds.items()},  # partial
        "control_mismatch": {k: "zzz" for k in golds},            # no restore
        "control_selfpatch": golds,                               # identical to anchor
    }
    pred_root = tmp_path / "patch_b1"
    for cond, docs in preds.items():
        (pred_root / cond).mkdir(parents=True)
        for image_id, md in docs.items():
            (pred_root / cond / f"{image_id}.md").write_text(md)

    out = tmp_path / "b1_patching.json"
    result = assembler.assemble(pred_root, manifest, out, n_boot=200, seed=0)
    assert out.exists() and json.loads(out.read_text()) == result

    assert result["conditions"]["anchor"]["mean"] == pytest.approx(1.0)
    assert result["restoration"]["patch_s2"]["fraction"] == pytest.approx(1.0)
    assert 0.0 < result["restoration"]["patch_s3"]["fraction"] < 1.0
    assert result["restoration"]["control_mismatch"]["fraction"] == pytest.approx(0.0)
    sp = result["controls"]["selfpatch"]
    assert sp["identical_output_fraction"] == 1.0
    assert sp["score_abs_delta_max"] == 0.0
    # paired restoration is deterministic under the seed
    again = assembler.assemble(pred_root, manifest, out, n_boot=200, seed=0)
    assert again["restoration"] == result["restoration"]
