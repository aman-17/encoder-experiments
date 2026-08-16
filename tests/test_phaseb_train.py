"""B2 pilot launcher: split identity vs probe_fit, gold-token masking,
LoRA/bridge param-count matching, and the contrast bootstrap."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import modal_phaseb_train as pb  # noqa: E402
from encoder_experiments.probe_fit import doc_is_train  # noqa: E402

DATASET_ROOT = REPO_ROOT / "data" / "pilot_1k"


@pytest.fixture(scope="module")
def manifests():
    if not (DATASET_ROOT / "images_modal.jsonl").exists():
        pytest.skip("pilot_1k corpus not present")
    return pb.build_manifests(DATASET_ROOT)


def test_split_identity_with_probe_harness(manifests):
    counts = manifests["counts"]
    assert counts["n_train_docs"] == 789
    assert counts["n_eval_docs"] == 211

    train_docs = {r["doc_id"] for r in manifests["train_rows"]}
    eval_docs = {r["doc_id"] for r in manifests["eval_rows"]}
    assert not train_docs & eval_docs
    # every row's side matches probe_fit.doc_is_train(seed 0, 0.8) exactly
    assert all(doc_is_train(d, 0.8, 0) for d in train_docs)
    assert all(not doc_is_train(d, 0.8, 0) for d in eval_docs)
    # train side loses only the no-gold docs; eval side keeps all 211
    assert len(train_docs) + counts["n_train_no_gold"] == 789
    assert len(eval_docs) == 211
    assert set(counts["train_no_gold_docs"]).isdisjoint(train_docs)


def test_val_slice_fixed_and_inside_train(manifests):
    val = [r for r in manifests["train_rows"] if r["split"] == "val"]
    assert len(val) == pb.N_VAL_DOCS
    assert len({r["doc_id"] for r in val}) == pb.N_VAL_DOCS
    # deterministic: a rebuild picks the identical slice
    again = pb.build_manifests(DATASET_ROOT)
    assert {r["doc_id"] for r in val} == {
        r["doc_id"] for r in again["train_rows"] if r["split"] == "val"
    }
    for r in manifests["train_rows"]:
        assert r["split"] in ("train", "val")
        assert r["gold_markdown"]


def test_masking_covers_gold_and_eos_only():
    prefix, gold, eos = [7, 8, 9, 10], [21, 22, 23], 2
    input_ids, labels = pb.build_training_ids(prefix, gold, eos, cap=100)
    assert input_ids == prefix + gold + [eos]
    assert labels == [-100] * len(prefix) + gold + [eos]
    # cap counts prompt + gold + eos; one over drops
    assert pb.build_training_ids(prefix, gold, eos, cap=8) == (input_ids, labels)
    assert pb.build_training_ids(prefix, gold, eos, cap=7) is None


def test_lora_rank_matches_bridge_within_2x():
    shapes = [(2048, 2048)] * 100  # 4096 params/rank/target -> 409_600/rank
    for bridge in (500_000, 3_000_000, 40_000_000):
        rank, count = pb.pick_lora_rank(bridge, shapes)
        ratio = max(count / bridge, bridge / count)
        assert ratio <= pb.LORA_MATCH_MAX_RATIO
        assert count == pb.lora_param_count(shapes, rank) == rank * 4096 * 100
    # unmatchable: even rank 1 is >2x the target
    with pytest.raises(ValueError, match="within"):
        pb.pick_lora_rank(1_000, shapes)
    with pytest.raises(ValueError):
        pb.pick_lora_rank(0, shapes)


def test_bootstrap_contrast_paired():
    pairs = [(0.6, 0.5)] * 30  # constant diff -> degenerate CI at the mean
    c = pb.bootstrap_contrast(pairs)
    assert c["n_docs"] == 30
    assert c["mean_diff"] == pytest.approx(0.1)
    assert c["ci95_lo"] == pytest.approx(0.1) == c["ci95_hi"]
    # antisymmetric under arm swap, deterministic under the fixed seed
    flipped = pb.bootstrap_contrast([(b, a) for a, b in pairs])
    assert flipped["mean_diff"] == pytest.approx(-c["mean_diff"])
    assert pb.bootstrap_contrast(pairs) == c


def test_contrast_block_families():
    a = {f"d{i}": {"score": 0.8, "family": "text" if i < 5 else "math"} for i in range(10)}
    b = {f"d{i}": {"score": 0.6, "family": "text" if i < 5 else "math"} for i in range(12)}
    block = pb.contrast_block(a, b)
    assert block["overall"]["n_docs"] == 10  # only docs scored in BOTH arms pair
    assert set(block["families"]) == {"text", "math"}
    assert block["overall"]["mean_diff"] == pytest.approx(0.2)
