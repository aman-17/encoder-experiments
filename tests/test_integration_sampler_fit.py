"""Sampler -> fitter integration: probe_sampler's own output (on the shared
3-doc fixture corpus) must feed probe_fit end to end for EVERY probe family.

Guards the shared label contract — the sampler and fitter can each pass
their own unit tests while disagreeing on the label schema. The probes.jsonl
written by build_probes is consumed by load_probes + run_pair against
synthetic features, and every family must fit without error (no dict labels,
no task-type inference failures, doc-level split honored).

The fixture's 3 docs are each listed twice in the corpus (distinct
image_ids sharing one sidecar file) so every family has >= 2 documents and
the document-level split can put one on each side.
"""

import json
import math

import numpy as np
import pytest
import torch
from conftest import CORPUS_ROWS

from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import safe_image_id, save_features
from encoder_experiments.probe_fit import FitConfig, doc_is_train, load_probes, run_pair
from encoder_experiments.probe_sampler import PROBES, build_probes

GRID = 4
DIM = 16
ENCODER = "fake_enc"
TRAIN_FRAC = 0.5

EXPECTED_TASK_TYPE = {
    "series_id": "classification",
    "point_value": "regression",
    "cell_row": "classification",
    "cell_col": "classification",
    "glyph_id": "classification",
    "pl1_class": "classification",
    "pl2_extent": "bbox",
    "pl3_summary": "regression",
}

DOC_PAIRS = [
    ("charts/doc1", "charts/doc1b"),
    ("tables/doc2", "tables/doc2b"),
    ("text/doc3", "text/doc3b"),
]


def _split_seed_with_both_sides() -> int:
    """Deterministic seed where each doc pair straddles the split, so every
    probe family has train AND test documents."""
    for seed in range(500):
        if all(
            doc_is_train(a, TRAIN_FRAC, seed) != doc_is_train(b, TRAIN_FRAC, seed)
            for a, b in DOC_PAIRS
        ):
            return seed
    raise AssertionError("no split seed separates all doc pairs")


@pytest.fixture(scope="module")
def pipeline(corpus, tmp_path_factory):
    root = tmp_path_factory.mktemp("integration")

    # corpus: each fixture doc appears twice (same sidecars, distinct image_id)
    rows = []
    for row in CORPUS_ROWS:
        for suffix in ("", "b"):
            dup = dict(row)
            dup["image_id"] = row["image_id"] + suffix
            dup["sidecars"] = {k: str(corpus / v) for k, v in row["sidecars"].items()}
            rows.append(dup)
    images = root / "images.jsonl"
    images.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")

    probes_path = root / "probes.jsonl"
    counts = build_probes(images, probes_path)
    assert counts["images_failed"] == 0

    # synthetic features for every corpus image
    rng = np.random.default_rng(11)
    feat_dir = root / "features" / ENCODER
    feat_dir.mkdir(parents=True)
    for row in rows:
        feats = EncoderFeatures(
            tokens=torch.from_numpy(
                rng.normal(0.0, 1.0, size=(GRID * GRID, DIM))
            ).float(),
            grid_hw=(GRID, GRID),
            pooled=torch.from_numpy(rng.normal(0.0, 1.0, size=DIM)).float(),
        )
        save_features(
            feat_dir / f"{safe_image_id(row['image_id'])}.safetensors",
            feats,
            {"encoder": ENCODER},
        )
    return probes_path, feat_dir


def test_every_family_is_emitted_and_fits_end_to_end(pipeline):
    probes_path, feat_dir = pipeline
    families = load_probes(probes_path)
    assert set(families) == set(PROBES)

    cfg = FitConfig(
        heads=["linear", "mlp"],
        train_frac=TRAIN_FRAC,
        split_seed=_split_seed_with_both_sides(),
        n_boot=16,
        min_samples=2,
        mlp_epochs=2,
    )
    for probe in PROBES:
        res = run_pair(probe, families[probe], feat_dir, cfg)
        assert res is not None, f"{probe}: run_pair skipped the family"
        assert res["task_type"] == EXPECTED_TASK_TYPE[probe]
        assert res["n_missing_features"] == 0
        train, test = set(res["train_docs"]), set(res["test_docs"])
        assert train and test and not train & test
        primary = res["primary_metric"]
        for head in cfg.heads:
            value = res["heads"][head]["real"]["metrics"][primary]
            assert isinstance(value, float) and math.isfinite(value), (
                f"{probe}/{head}: non-finite {primary}"
            )
        json.dumps(res)  # result must be serializable exactly as main() writes it
