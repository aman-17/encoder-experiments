"""R5 (pin-vs-scale 2x2) pure parts: R5 checkpoint dirs are disjoint from
every A_/B_/R4 dir; the joint trainable-set certification admits exactly
merger + decoder-LoRA and demands both; and the r5-corpus manifest reader
is deterministic with build_manifests' seeded val slice."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

import modal_phaseb_train as pb  # noqa: E402


# --------------------------------------------------------------------------- #
# arm registry: R5 dirs never collide with B2's or R4's
# --------------------------------------------------------------------------- #

def test_r5_arm_dirs_disjoint_across_all_grids():
    for smoke in (False, True):
        b2 = [pb.arm_dir(a, lr, smoke=smoke) for a, grid in pb.LR_GRID.items() for lr in grid]
        r4 = [pb.arm_dir(a, l, smoke=smoke) for a in pb.R4_ARMS for l in pb.LAM_GRID]
        r5 = [pb.arm_dir(a, t, smoke=smoke)
              for a in pb.R5_ARMS for t in pb.CORPUS_TAGS.values()]
        combined = b2 + r4 + r5
        assert len(set(combined)) == len(combined)
        root = "phaseb/smoke" if smoke else "phaseb"
        assert all(d.startswith(f"{root}/R5") for d in r5)
        assert not any(d.startswith((f"{root}/A_", f"{root}/B_", f"{root}/R4")) for d in r5)
    assert pb.arm_dir("R5j", "5k") == "phaseb/R5j_5k"
    assert pb.arm_dir("R5b", "700") == "phaseb/R5b_700"
    assert sorted(pb.CORPUS_TAGS.values()) == ["5k", "700"]


def test_r5_labels_and_stats_labels():
    assert pb.arm_label("R5j", "700") == "R5j_700"
    assert pb.arm_label("R5b", "5k") == "R5b_5k"
    # R5 stats carry the corpus tag; R4/A/B records keep their old shape
    assert pb.stats_label({"arm": "R5j", "lr": pb.R5_LR, "lam": 1.0,
                           "corpus_tag": "5k"}) == "R5j_5k"
    assert pb.stats_label({"arm": "A", "lr": 1e-4}) == "A"
    assert pb.stats_label({"arm": "R4a", "lr": pb.R4_LR, "lam": 0.1}) == "R4a_0.1"


# --------------------------------------------------------------------------- #
# joint trainable-set accounting
# --------------------------------------------------------------------------- #

def _named(*triples):
    """[(name, numel, requires_grad)] -> [(name, Parameter)]"""
    return [(n, torch.nn.Parameter(torch.zeros(k), requires_grad=rg))
            for n, k, rg in triples]


def test_joint_certification_counts_halves_separately():
    named = _named(
        ("model.visual.merger.mlp.0.weight", 16, True),
        ("model.visual.merger.mlp.2.weight", 8, True),
        ("model.layers.0.q_proj.lora_A.default.weight", 12, True),
        ("model.layers.0.q_proj.lora_B.default.weight", 4, True),
        ("model.visual.blocks.0.attn.qkv.weight", 100, False),  # frozen encoder
        ("model.layers.0.q_proj.weight", 100, False),  # frozen decoder body
    )
    merger_ids = {id(p) for n, p in named if ".merger." in n}
    counts = pb.certify_joint_trainable(named, merger_ids)
    assert counts == {"merger_params": 24, "lora_params": 16}


def test_joint_certification_rejects_stray_trainable():
    named = _named(
        ("model.visual.merger.mlp.0.weight", 16, True),
        ("model.layers.0.q_proj.lora_A.default.weight", 12, True),
        ("model.visual.blocks.0.attn.qkv.weight", 100, True),  # encoder leak!
    )
    merger_ids = {id(named[0][1])}
    with pytest.raises(ValueError, match="stray.*blocks.0.attn"):
        pb.certify_joint_trainable(named, merger_ids)


def test_joint_certification_demands_both_halves():
    merger_only = _named(("model.visual.merger.mlp.0.weight", 16, True))
    with pytest.raises(ValueError, match="both halves"):
        pb.certify_joint_trainable(merger_only, {id(merger_only[0][1])})
    lora_only = _named(("model.layers.0.q_proj.lora_A.default.weight", 12, True))
    with pytest.raises(ValueError, match="both halves"):
        pb.certify_joint_trainable(lora_only, set())


# --------------------------------------------------------------------------- #
# r5-corpus manifest reader
# --------------------------------------------------------------------------- #

def _r5_corpus(tmp_path: Path, n_inline: int = 8) -> Path:
    root = tmp_path / "corpus_r5"
    (root / "gold").mkdir(parents=True)
    rows = [{"image_id": f"r5text__d{i:03d}_0001", "image_path": f"images/d{i:03d}.png",
             "doc_id": f"r5text__d{i:03d}", "generator": "r5text",
             "gold_markdown": f"# doc {i}"} for i in range(n_inline)]
    # sidecar-gold row (gold_path relative to the corpus root)
    (root / "gold" / "d900.md").write_text("$x^2$", encoding="utf-8")
    rows.append({"image_id": "r5math__d900_0001", "image_path": "images/d900.png",
                 "doc_id": "r5math__d900", "generator": "r5math",
                 "gold_path": "gold/d900.md"})
    # goldless rows drop-and-count: no field at all / empty inline / dangling path
    rows.append({"image_id": "r5math__d901_0001", "image_path": "images/d901.png",
                 "doc_id": "r5math__d901"})
    rows.append({"image_id": "r5math__d902_0001", "image_path": "images/d902.png",
                 "doc_id": "r5math__d902", "gold_markdown": ""})
    rows.append({"image_id": "r5math__d903_0001", "image_path": "images/d903.png",
                 "doc_id": "r5math__d903", "gold_path": "gold/missing.md"})
    (root / pb.R5_IMAGES).write_text(
        "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8"
    )
    return root


def test_r5_manifest_content_and_split(tmp_path):
    root = _r5_corpus(tmp_path)
    m = pb.build_r5_manifest(root, n_val_docs=3, val_seed=0)
    rows, counts = m["train_rows"], m["counts"]
    assert counts["n_docs"] == 12
    assert counts["n_no_gold"] == 3
    assert counts["no_gold_docs"] == ["r5math__d901", "r5math__d902", "r5math__d903"]
    assert counts["n_train_usable"] == 6 and counts["n_val"] == 3
    by_id = {r["doc_id"]: r for r in rows}
    assert by_id["r5math__d900"]["gold_markdown"] == "$x^2$"  # sidecar resolved
    assert by_id["r5text__d000"]["gold_markdown"] == "# doc 0"
    assert all(r["split"] in ("train", "val") and r["gold_markdown"] for r in rows)


def test_r5_manifest_val_slice_deterministic(tmp_path):
    root = _r5_corpus(tmp_path)
    m1 = pb.build_r5_manifest(root, n_val_docs=3, val_seed=0)
    m2 = pb.build_r5_manifest(root, n_val_docs=3, val_seed=0)
    assert m1 == m2  # byte-identical rebuild, val slice included
    val = {r["doc_id"] for r in m1["train_rows"] if r["split"] == "val"}
    # the slice is build_manifests' sampler verbatim: seeded over sorted docs
    import random
    usable = sorted(r["doc_id"] for r in m1["train_rows"])
    assert val == set(random.Random(0).sample(usable, 3))


def test_r5_manifest_rejects_duplicate_pages(tmp_path):
    root = _r5_corpus(tmp_path, n_inline=3)
    dup = {"image_id": "r5text__d000_0002", "image_path": "images/x.png",
           "doc_id": "r5text__d000", "gold_markdown": "# dup"}
    with open(root / pb.R5_IMAGES, "a") as f:
        f.write(json.dumps(dup) + "\n")
    with pytest.raises(AssertionError, match="1 page/doc"):
        pb.build_r5_manifest(root, n_val_docs=1, val_seed=0)
