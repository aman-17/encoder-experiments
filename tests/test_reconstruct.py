"""Reconstruction probe on synthetic caches — the discriminant the method
exists for:

- an INVERTIBLE rotation S1 -> S2 must reconstruct (~1.0 feature R^2) with no
  functional gap: the bridge re-encoded, nothing destroyed;
- a LOSSY projection (label-carrying dims killed) must show low feature R^2
  AND a functional gap: the bridge destroyed information.

Also pins the matched-pair mechanics: dedup across families, images missing
from one cache dropped and counted, doc-level split shared by inverse map and
heads, CLI round trip.
"""

from __future__ import annotations

import json

import numpy as np
import pytest
import torch
from safetensors.torch import save_file

from encoder_experiments.probe_fit import FitConfig, load_probes
from encoder_experiments.reconstruct import (
    InverseConfig,
    assemble_matched,
    fit_inverse,
    main,
    pair_rows,
    run,
)
from encoder_experiments.site_store import SITES_SUFFIX, round6

N_DOCS = 60
K = 6  # points per image
D1 = 12
POINTS = [[round6((k + 0.5) / K), 0.5] for k in range(K)]


def _write_sites(enc_dir, image_id, sites):
    enc_dir.mkdir(parents=True, exist_ok=True)
    save_file(
        {
            "sites": torch.from_numpy(sites).to(torch.float16),
            "points": torch.tensor(POINTS, dtype=torch.float32),
            "pooled": torch.from_numpy(sites.mean(axis=0)).to(torch.float16),
        },
        enc_dir / f"{image_id}{SITES_SUFFIX}",
        metadata={"encoder": enc_dir.name, "budget_tokens": str(K)},
    )


@pytest.fixture(scope="module")
def caches(tmp_path_factory):
    """S1 gaussian features; S2 = rotation (invertible) and lossy projection
    (dims 0-7 killed before the same rotation — the label lives in dim 0)."""
    root = tmp_path_factory.mktemp("recon")
    rng = np.random.default_rng(0)
    rot, _ = np.linalg.qr(rng.normal(size=(D1, D1)))
    keep = np.zeros(D1)
    keep[8:] = 1.0

    probe_lines = []
    for d in range(N_DOCS):
        image_id = f"doc{d:03d}"
        s1 = rng.normal(size=(K, D1))
        s1[:, 0] += np.where(s1[:, 0] > 0, 0.5, -0.5)  # margin: fp16-safe signs
        _write_sites(root / "s1", image_id, s1.astype(np.float32))
        _write_sites(root / "s2_rot", image_id, (s1 @ rot).astype(np.float32))
        _write_sites(root / "s2_lossy", image_id, ((s1 * keep) @ rot).astype(np.float32))
        for k in range(K):
            probe_lines.append({
                "probe": "glyph_id", "image_id": image_id, "point_xy": POINTS[k],
                "label": "a" if s1[k, 0] > 0 else "b",
            })
    probes = root / "probes.jsonl"
    probes.write_text("".join(json.dumps(r) + "\n" for r in probe_lines))
    return {
        "root": root, "probes": probes, "s1": root / "s1",
        "rot": root / "s2_rot", "lossy": root / "s2_lossy",
    }


def _cfgs():
    invs = {
        "linear": InverseConfig(kind="linear", seed=0),
        "mlp": InverseConfig(kind="mlp", hidden=128, epochs=300, lr=3e-3, batch=64, seed=0),
    }
    fit = FitConfig(heads=["linear"], n_boot=50, min_samples=10)
    return invs, fit


def test_invertible_rotation_reconstructs_with_no_functional_gap(caches):
    invs, fit = _cfgs()
    res = run(caches["probes"], caches["s1"], caches["rot"], ["glyph_id"], invs, fit)
    assert res["pairs"]["d_s1"] == res["pairs"]["d_s2"] == D1
    assert res["pairs"]["n_missing"] == {"s1": 0, "s2": 0}
    # ridge inverts an orthogonal map essentially exactly; the MLP close behind
    assert res["inverses"]["linear"]["feature_r2"]["uniform"] > 0.99
    assert res["inverses"]["linear"]["feature_r2"]["variance_weighted"] > 0.99
    assert res["inverses"]["mlp"]["feature_r2"]["uniform"] > 0.9
    assert res["inverses"]["mlp"]["feature_r2"]["variance_weighted"] > 0.9
    fam = res["families"]["glyph_id"]
    assert "error" not in fam
    head = fam["heads"]["linear"]
    assert head["true_s1"]["metrics"]["accuracy"] > 0.9
    for kind in ("linear", "mlp"):
        rec = head["recon_s1"][kind]
        assert rec["inverse_kind"] == kind
        assert abs(rec["gap"]) < 0.1
        lo, hi = rec["gap_ci95"]
        assert lo <= rec["gap"] <= hi


def test_lossy_projection_shows_low_r2_and_functional_gap(caches):
    invs, fit = _cfgs()
    res = run(caches["probes"], caches["s1"], caches["lossy"], ["glyph_id"], invs, fit)
    # 8 of 12 dims destroyed -> feature R^2 far below the rotation's, for BOTH
    # inverse kinds: no inverse can resurrect killed dims
    assert res["inverses"]["linear"]["feature_r2"]["uniform"] < 0.6
    assert res["inverses"]["mlp"]["feature_r2"]["uniform"] < 0.6
    head = res["families"]["glyph_id"]["heads"]["linear"]
    # the label direction is among the killed dims: probe on true S1 works,
    # on reconstructed S1 it cannot
    assert head["true_s1"]["metrics"]["accuracy"] > 0.9
    for kind in ("linear", "mlp"):
        rec = head["recon_s1"][kind]
        assert rec["metrics"]["accuracy"] < 0.75
        assert rec["gap"] > 0.2
        assert rec["gap_ci95"][0] > 0.0  # CI excludes zero — the gap counts


def test_pair_rows_dedupes_across_families(caches):
    fams = load_probes(caches["probes"])
    fams["second_family"] = list(fams["glyph_id"])  # same points, second family
    pairs = pair_rows(fams)
    assert len(pairs) == N_DOCS * K  # unique (image, 6dp point), not per-row
    keys = {(r.image_id, tuple(r.point_xy)) for r in pairs}
    assert len(keys) == len(pairs)


def test_assemble_matched_drops_and_counts_missing_images(caches, tmp_path):
    fams = load_probes(caches["probes"])
    rows = fams["glyph_id"]
    partial = tmp_path / "partial"
    partial.mkdir()
    for f in sorted(caches["rot"].glob(f"*{SITES_SUFFIX}"))[1:]:  # drop doc000
        (partial / f.name).write_bytes(f.read_bytes())
    X1, X2, kept, missing = assemble_matched(rows, caches["s1"], partial)
    assert missing == {"s1": 0, "s2": K}
    assert len(kept) == X1.shape[0] == X2.shape[0] == (N_DOCS - 1) * K
    assert all(r.image_id != "doc000" for r in kept)


def test_linear_inverse_recovers_rotation_exactly(caches):
    fams = load_probes(caches["probes"])
    rows = pair_rows(fams)
    X1, X2, kept, _ = assemble_matched(rows, caches["s1"], caches["rot"])
    predict = fit_inverse(X2, X1, InverseConfig(kind="linear"))
    resid = predict(X2) - X1
    assert float(np.abs(resid).max()) < 0.05  # ridge inverts an orthogonal map


def test_mlp_inverse_early_stop_deterministic(caches):
    fams = load_probes(caches["probes"])
    rows = pair_rows(fams)
    X1, X2, kept, _ = assemble_matched(rows, caches["s1"], caches["rot"])
    cfg = InverseConfig(kind="mlp", hidden=64, epochs=50, early_stop=True, patience=3, seed=1)
    a = fit_inverse(X2, X1, cfg)(X2)
    b = fit_inverse(X2, X1, cfg)(X2)
    assert a.tobytes() == b.tobytes()


def test_cli_round_trip(caches, tmp_path):
    out = tmp_path / "results"
    rc = main([
        "--probes", str(caches["probes"]),
        "--s1", str(caches["s1"]),
        "--s2", str(caches["rot"]),
        "--out", str(out),
        "--families", "glyph_id",
        "--heads", "linear",
        "--inv-hidden", "64",
        "--inv-epochs", "100",
        "--inv-early-stop",
        "--inv-patience", "5",
        "--bootstrap", "20",
    ])
    assert rc == 0
    path = out / "recon__s2_rot__to__s1.json"
    res = json.loads(path.read_text())
    assert set(res["inverses"]) == {"linear", "mlp"}
    assert res["inverses"]["linear"]["feature_r2"]["variance_weighted"] > 0.99  # exact
    assert res["inverses"]["linear"]["config"] == {"kind": "linear", "alpha": 1.0, "seed": 0}
    mlp_cfg = res["inverses"]["mlp"]["config"]
    assert (mlp_cfg["hidden"], mlp_cfg["epochs"], mlp_cfg["early_stop"], mlp_cfg["patience"]) \
        == (64, 100, True, 5)
    assert res["split"] == {"by": "document", "train_frac": 0.8, "seed": 0}
    fam = res["families"]["glyph_id"]
    recon = fam["heads"]["linear"]["recon_s1"]
    assert set(recon) == {"linear", "mlp"}
    assert abs(recon["linear"]["gap"]) < 0.05
