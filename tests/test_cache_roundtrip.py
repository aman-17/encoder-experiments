"""Extraction cache round-trip, no model downloads: what save_features writes,
the probe harness must be able to read back — tensors, metadata, and the
resume/skip behavior."""

import json

import pytest
import torch
from safetensors import safe_open

from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import main, safe_image_id, save_features


def test_roundtrip_tensors_and_metadata(tmp_path):
    feats = EncoderFeatures(
        tokens=torch.randn(12, 16), grid_hw=(3, 4), pooled=torch.randn(16)
    )
    path = tmp_path / "img1.safetensors"
    save_features(path, feats, {"encoder": "fake", "pooled_kind": "mean"})

    with safe_open(path, framework="pt") as f:
        meta = f.metadata()
        tokens = f.get_tensor("tokens")
        pooled = f.get_tensor("pooled")

    assert tokens.dtype == torch.float16 and pooled.dtype == torch.float16
    assert (int(meta["grid_h"]), int(meta["grid_w"])) == (3, 4)
    assert int(meta["num_tokens"]) == 12 and int(meta["feat_dim"]) == 16
    assert meta["encoder"] == "fake"
    assert torch.allclose(tokens.float(), feats.tokens, atol=1e-2)  # fp16 storage


def test_gridless_encoder_marks_grid_minus_one(tmp_path):
    feats = EncoderFeatures(tokens=torch.randn(7, 8), grid_hw=None, pooled=torch.randn(8))
    path = tmp_path / "img2.safetensors"
    save_features(path, feats, {})
    with safe_open(path, framework="pt") as f:
        assert f.metadata()["grid_h"] == "-1"


def test_safe_image_id():
    assert safe_image_id("chart/foo (1)_p27") == "chart__foo (1)_p27"


def test_manifest_validation(tmp_path):
    bad = tmp_path / "manifest.jsonl"
    bad.write_text(json.dumps({"image_path": "/x.png"}) + "\n")  # missing image_id
    rc = None
    try:
        main(["--manifest", str(bad), "--encoder", "clip_vit_l_336", "--out", str(tmp_path)])
    except ValueError as e:
        rc = str(e)
    assert rc and "image_id" in rc


# ---------------------------------------------------------------------------
# finiteness guard: non-finite / fp16-overflowing features must never cache
# ---------------------------------------------------------------------------

def test_nan_tokens_refuse_to_cache(tmp_path):
    from encoder_experiments.extract import NonFiniteFeaturesError

    tokens = torch.randn(12, 16)
    tokens[3, 5] = float("nan")
    tokens[7, 1] = float("inf")
    feats = EncoderFeatures(tokens=tokens, grid_hw=(3, 4), pooled=torch.randn(16))
    path = tmp_path / "bad.safetensors"
    try:
        save_features(path, feats, {"encoder": "fake"})
        raise AssertionError("save_features cached non-finite features")
    except NonFiniteFeaturesError as e:
        assert e.details["tokens"]["nan"] == 1
        assert e.details["tokens"]["inf"] == 1
        assert e.details["pooled"]["nan"] == 0
        assert "absmax" in e.details["tokens"]
    # file NOT written — no half-cached corruption, no .tmp leftover
    assert not path.exists()
    assert not path.with_suffix(".tmp").exists()


def test_fp16_overflow_is_caught_at_storage_cast(tmp_path):
    # finite in fp32, inf after the fp16 cast (the absmax-at-65504 signature)
    from encoder_experiments.extract import NonFiniteFeaturesError

    pooled = torch.randn(16)
    pooled[0] = 1.0e6
    feats = EncoderFeatures(tokens=torch.randn(12, 16), grid_hw=(3, 4), pooled=pooled)
    path = tmp_path / "overflow.safetensors"
    try:
        save_features(path, feats, {})
        raise AssertionError("fp16 overflow slipped through the guard")
    except NonFiniteFeaturesError as e:
        # overflow is checked against the SOURCE (backends like MPS saturate
        # the fp16 cast to +-65504 instead of producing Inf)
        assert e.details["pooled"]["overflow"] == 1
        assert e.details["pooled"]["inf"] >= 0
        assert e.details["pooled"]["absmax"] == 1.0e6
    assert not path.exists()


def test_saturating_cast_overflow_still_caught():
    """MPS saturates fp32->fp16 to +-65504 (no Inf, no NaN): a clamped cast
    with a huge source absmax must STILL refuse to cache."""
    from encoder_experiments.extract import NonFiniteFeaturesError, _check_finite

    tokens = torch.randn(4, 8)
    tokens[0, 0] = 4.5e9
    feats = EncoderFeatures(tokens=tokens, grid_hw=(2, 2), pooled=torch.randn(8))
    saturated = {
        "tokens": tokens.clamp(-65504.0, 65504.0).to(torch.float16),
        "pooled": feats.pooled.to(torch.float16),
    }
    try:
        _check_finite(saturated, feats)
        raise AssertionError("saturated overflow slipped through the guard")
    except NonFiniteFeaturesError as e:
        assert e.details["tokens"]["overflow"] == 1
        assert e.details["tokens"]["nan"] == 0 and e.details["tokens"]["inf"] == 0
        assert e.details["tokens"]["absmax"] == pytest.approx(4.5e9, rel=1e-6)


def test_extract_main_logs_nonfinite_to_errors_jsonl(tmp_path, monkeypatch):
    """End-to-end main(): an encoder emitting NaN features must land the image
    in errors.jsonl WITH nan/inf/absmax counts, cache no file, and exit 1."""
    import numpy as np
    from PIL import Image as PILImage

    import encoder_experiments.extract as ex

    img_path = tmp_path / "page.png"
    PILImage.fromarray(np.full((8, 8, 3), 255, np.uint8)).save(img_path)
    manifest = tmp_path / "manifest.jsonl"
    manifest.write_text(json.dumps({"image_id": "page1", "image_path": str(img_path)}) + "\n")

    class NaNAdapter:
        name = "clip_vit_l_336"
        cache_tag = "clip_vit_l_336"
        checkpoint = "fake"
        pooled_kind = "cls"
        extra_meta: dict[str, str] = {}

        def load(self):
            pass

        def encode(self, image):
            tokens = torch.randn(9, 8)
            tokens[0, 0] = float("nan")
            return EncoderFeatures(tokens=tokens, grid_hw=(3, 3), pooled=torch.randn(8))

    monkeypatch.setattr(ex, "build", lambda *a, **k: NaNAdapter())
    monkeypatch.setattr(ex, "resolve_device", lambda d: torch.device("cpu"))
    monkeypatch.setattr(ex, "resolve_dtype", lambda d, dev: torch.float32)

    rc = ex.main([
        "--manifest", str(manifest),
        "--encoder", "clip_vit_l_336",
        "--out", str(tmp_path / "features"),
    ])
    assert rc == 1  # failed and nothing done
    out_dir = tmp_path / "features" / "clip_vit_l_336"
    assert not (out_dir / "page1.safetensors").exists()
    errors = [json.loads(line) for line in (out_dir / "errors.jsonl").read_text().splitlines()]
    assert len(errors) == 1
    assert errors[0]["image_id"] == "page1"
    assert "NonFiniteFeatures" in errors[0]["error"]
    assert errors[0]["counts"]["tokens"]["nan"] == 1
    assert errors[0]["counts"]["tokens"]["inf"] == 0
    assert errors[0]["counts"]["pooled"]["nan"] == 0
