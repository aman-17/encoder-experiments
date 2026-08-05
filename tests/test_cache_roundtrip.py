"""Extraction cache round-trip, no model downloads: what save_features writes,
the probe harness must be able to read back — tensors, metadata, and the
resume/skip behavior."""

import json

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
