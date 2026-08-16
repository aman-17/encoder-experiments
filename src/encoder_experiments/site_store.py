"""SITE-MODE feature storage: pre-sampled site vectors instead of full grids.

Every probe row's read location is known up front (probes.jsonl carries
point_xy; pooled probes read the pooled vector), so extraction can pre-sample
exactly the needed site vectors: ~50 KB/image instead of the ~1.5-2 MB/image
a full grid costs — the difference that makes the budget sweep fit on disk.

This module owns the manifest that says WHICH sites each image needs:

    build_site_manifest(probes_jsonl) -> {
        "version": 1,
        "images": {
            "<image_id>": {
                "points":       [[x, y], ...],   # sorted unique, 6dp-rounded
                "point_probes": [["cell_col", "cell_row"], ...],  # parallel
                "pooled_probes": ["pl3_summary", ...],
            },
            ...
        },
    }

Determinism contract (the same probes.jsonl always produces the same
manifest, byte for byte, regardless of row order): image keys sorted,
points sorted by (x, y) after rounding to 6 decimal places, probe-name
lists sorted, duplicates merged.

Pooled-only rows (probe name starting with "pl3", or "site": "pooled" —
the exact rule probe_fit.load_probes applies) contribute no points, only an
entry in pooled_probes: the pooled vector is stored once per image anyway.

Coordinate identity: points are matched between probes.jsonl and the stored
`points` tensor by EXACT equality after rounding to 6 decimal places. fp32
storage round-trips 6dp decimals in [0, 1] exactly (fp32 spacing there is
~6e-8, far below the 5e-7 rounding boundary), so round6 on the loaded
values recovers the manifest key.

The stored file (written by extract.py --sites-from, read transparently by
probe_fit.assemble_features) is <safe_image_id>.sites.safetensors with
    sites  [K, D] fp16   # features_at(fp16-roundtripped grid) -> fp16
    points [K, 2] fp32   # same order as the manifest's points list
    pooled [D]    fp16
plus the standard extraction metadata and the sweep contract fields
{budget_tokens (actual token count, not nominal), mechanism, knob}.
The fp16-parity rule for the sites tensor lives in extract.save_sites
(pinned by tests/test_site_store.py).
"""

from __future__ import annotations

import json
from pathlib import Path

SITES_SUFFIX = ".sites.safetensors"
MANIFEST_VERSION = 1

#: sweep contract fields every stored feature file carries (extract writes
#: them; probe_fit copies them into results JSONs).
SWEEP_META_FIELDS = ("budget_tokens", "mechanism", "knob")
MECHANISMS = ("resolution", "res-mode", "merge", "native")


def round6(v: float) -> float:
    """The one rounding used for point identity everywhere: 6 decimal places."""
    return round(float(v), 6)


def is_pooled_row(row: dict) -> bool:
    """Same rule as probe_fit.load_probes: pl3* families and explicit
    site == 'pooled' rows read the pooled vector and need no point."""
    return row.get("site") == "pooled" or str(row.get("probe", "")).startswith("pl3")


def build_site_manifest(probes_jsonl: Path) -> dict:
    """probes.jsonl -> deterministic per-image site manifest (schema above)."""
    points: dict[str, dict[tuple[float, float], set[str]]] = {}
    pooled: dict[str, set[str]] = {}
    with open(probes_jsonl) as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            for key in ("probe", "image_id"):
                if key not in row:
                    raise ValueError(f"{probes_jsonl}:{line_no}: probe row needs {key!r}")
            probe, image_id = row["probe"], row["image_id"]
            points.setdefault(image_id, {})
            pooled.setdefault(image_id, set())
            if is_pooled_row(row):
                pooled[image_id].add(probe)
                continue
            point_xy = row.get("point_xy")
            if point_xy is None:
                raise ValueError(
                    f"{probes_jsonl}:{line_no}: site probe {probe!r} needs point_xy "
                    "(or site: 'pooled')"
                )
            key = (round6(point_xy[0]), round6(point_xy[1]))
            points[image_id].setdefault(key, set()).add(probe)

    images: dict[str, dict] = {}
    for image_id in sorted(points):
        pts = sorted(points[image_id])
        images[image_id] = {
            "points": [[x, y] for x, y in pts],
            "point_probes": [sorted(points[image_id][pt]) for pt in pts],
            "pooled_probes": sorted(pooled[image_id]),
        }
    return {"version": MANIFEST_VERSION, "images": images}


def load_site_manifest(path: Path) -> dict:
    """Accept either a precomputed sites manifest (one JSON object with an
    'images' key) or a raw probes.jsonl (built on the fly). Content-sniffed,
    not extension-sniffed, so `extract --sites-from` takes both."""
    try:
        obj = json.loads(path.read_text())
    except json.JSONDecodeError:
        return build_site_manifest(path)
    if isinstance(obj, dict) and "images" in obj:
        version = obj.get("version")
        if version != MANIFEST_VERSION:
            raise ValueError(
                f"{path}: sites manifest version {version!r}, expected {MANIFEST_VERSION}"
            )
        return obj
    # a single-line probes.jsonl parses as one JSON object without 'images'
    return build_site_manifest(path)


def write_site_manifest(manifest: dict, path: Path) -> None:
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
