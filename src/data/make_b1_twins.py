"""B1 twins: geometry-aligned clean/degraded pairs for the activation-patching
experiment (docs/experiments.md §B1).

Selects ~100 glyph-heavy pilot pages (text + math generators, sev-0 clean
images from data/pilot_1k) and renders each one's twin at IDENTICAL pixel
dimensions and pixel-aligned content — identical token grids under the Qwen
processor. Two twin modes:

  --mode degrade   (default) degrade.py with the scan-geometry component
                   DISABLED (no_geom=True: identity affine, photometric
                   blur/noise/tint only), --severity 1/2/3
  --mode resample  resolution attack: bilinear downscale by --factor, Lanczos
                   upscale back to the exact original dims; deterministic,
                   seedless

Gold is resolved exactly the way frontier scoring does
(frontier_score.load_gold: expected_markdown in <id>.test.json, else the
.gold.md/.md sidecar); docs frontier_score would skip are skipped here too.
Selection ignores mode/severity/factor, so every variant covers the SAME pages.

Outputs (all under the dataset root, so score_pred_dir works unchanged), with
twin key K = sev<S>ng (degrade) or rs<F>x (resample) and manifest tag T = ""
for the original sev2ng config, else "_<K>" — new variants never clobber v1:
  images/<out-name>/<image_id>__<K>.png  (+ .degrade.json / .resample.json)
  images_twins_b1<T>.jsonl        local manifest: clean_path/degraded_path
                                  absolute, gold_path + gold_source per row
  images_twins_b1<T>_modal.jsonl  same rows with /vol/corpus-relative paths
                                  (clean images are already at /corpus/images/clean)

Upload for the Modal harness (mirror the local images/<out-name> subpath):
  uv run modal volume put encoder-anatomy-pilot \
      data/pilot_1k/images/<out-name> /corpus/images/<out-name>
  uv run modal volume put encoder-anatomy-pilot \
      data/pilot_1k/images_twins_b1<T>_modal.jsonl /corpus/images_twins_b1<T>_modal.jsonl

Usage:
  uv run python src/data/make_b1_twins.py            # 100 pages, severity 2
  uv run python src/data/make_b1_twins.py --severity 3 --out-name degraded_b1_v2
  uv run python src/data/make_b1_twins.py --mode resample --factor 2 \
      --out-name degraded_b1_v2
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location("degrade", _HERE / "degrade.py")
degrade = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("degrade", degrade)
_spec.loader.exec_module(degrade)

from encoder_experiments.frontier_score import gold_skip_reason, load_gold  # noqa: E402

TWIN_GENERATORS = ("text", "math")


def twin_key(mode: str, severity: int, factor: int) -> str:
    """Filename/manifest key naming one twin variant: sev<S>ng or rs<F>x."""
    if mode == "degrade":
        return f"sev{severity}ng"
    if mode == "resample":
        return f"rs{factor}x"
    raise ValueError(f"unknown mode {mode!r}")


def manifest_paths(dataset_root: Path, key: str) -> tuple[Path, Path]:
    """(local, modal) manifest paths: the untagged v1 names for the original
    sev2ng config, `_<key>`-tagged otherwise."""
    tag = "" if key == "sev2ng" else f"_{key}"
    return (dataset_root / f"images_twins_b1{tag}.jsonl",
            dataset_root / f"images_twins_b1{tag}_modal.jsonl")


def resample_twin(img, factor: int, cv2) -> tuple[Any, dict[str, Any]]:
    """Resolution attack: bilinear downscale by `factor`, Lanczos upscale back
    to the exact original dims. Deterministic (no RNG), dims-preserving."""
    if factor < 2:
        raise ValueError(f"resample factor must be >= 2, got {factor}")
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(1, w // factor), max(1, h // factor)),
                       interpolation=cv2.INTER_LINEAR)
    twin = cv2.resize(small, (w, h), interpolation=cv2.INTER_LANCZOS4)
    meta = {"mode": "resample", "factor": factor,
            "down_interp": "INTER_LINEAR", "up_interp": "INTER_LANCZOS4",
            "image_w_px": w, "image_h_px": h}
    return twin, meta


def select_twin_rows(rows: list[dict], n: int) -> list[dict]:
    """Deterministic pick: sev-0 text/math rows sorted by image_id, half the
    budget per generator (odd n gives text the extra), topped up from the
    other family when one runs short."""
    pools = {
        g: sorted(
            (r for r in rows if r.get("generator") == g and r.get("scan_severity") == 0),
            key=lambda r: r["image_id"],
        )
        for g in TWIN_GENERATORS
    }
    quota = {"text": n - n // 2, "math": n // 2}
    picked = {g: pools[g][: quota[g]] for g in TWIN_GENERATORS}
    for g, other in (("text", "math"), ("math", "text")):
        short = quota[g] - len(picked[g])
        if short > 0:
            extra = pools[other][len(picked[other]): len(picked[other]) + short]
            picked[other] = picked[other] + extra
    out = sorted(picked["text"] + picked["math"], key=lambda r: r["image_id"])
    return out[:n]


def resolve_gold_path(dataset_root: Path, generator: str, doc_id: str) -> tuple[Path, str]:
    """(path, source) of the gold frontier_score.load_gold would use:
    the <id>.test.json when it carries expected_markdown, else the
    .gold.md/.md sidecar. Mirrors load_gold's resolution order exactly."""
    doc_dir = dataset_root / "docs" / generator
    test_path = doc_dir / f"{doc_id}.test.json"
    test = json.loads(test_path.read_text())
    if test.get("expected_markdown") is not None:
        return test_path, "test_json"
    for cand in (doc_dir / f"{doc_id}.gold.md", doc_dir / f"{doc_id}.md"):
        if cand.exists():
            return cand, "md_sidecar"
    raise FileNotFoundError(f"no gold markdown for {generator}/{doc_id}")


def build_twins(
    images_jsonl: Path, n: int, severity: int, base_seed: int,
    *, mode: str = "degrade", factor: int = 2, out_name: str = "degraded_b1",
) -> tuple[list[dict], list[dict]]:
    """Render the degraded twins and return (local_rows, modal_rows)."""
    import cv2  # noqa: PLC0415 — heavy import kept out of the pure selection path

    dataset_root = images_jsonl.resolve().parent
    rows = [json.loads(ln) for ln in images_jsonl.read_text().splitlines() if ln.strip()]

    candidates = select_twin_rows(rows, len(rows))  # full ordered pool; cut after gold-check
    out_dir = dataset_root / "images" / out_name
    out_dir.mkdir(parents=True, exist_ok=True)

    local_rows: list[dict] = []
    modal_rows: list[dict] = []
    per_gen = {g: 0 for g in TWIN_GENERATORS}
    quota = {"text": n - n // 2, "math": n // 2}
    # Two passes over the ordered pool: quota-respecting first, then a top-up
    # ignoring quota when one family cannot fill its half.
    seen: set[str] = set()
    for enforce_quota in (True, False):
        for row in candidates:
            if len(local_rows) >= n:
                break
            gen = row["generator"]
            if row["image_id"] in seen or (enforce_quota and per_gen[gen] >= quota[gen]):
                continue
            seen.add(row["image_id"])
            try:
                gold = load_gold(dataset_root, gen, row["doc_id"])
            except FileNotFoundError:
                continue
            if gold_skip_reason(gold) is not None:
                continue
            if _emit_twin(row, dataset_root, out_dir, severity, base_seed,
                          local_rows, modal_rows, cv2, mode=mode, factor=factor):
                per_gen[gen] += 1

    return local_rows, modal_rows


def _emit_twin(row, dataset_root, out_dir, severity, base_seed,
               local_rows, modal_rows, cv2, *, mode="degrade", factor=2) -> bool:
    gen = row["generator"]
    clean_path = Path(row["image_path"])
    if not clean_path.is_absolute():
        clean_path = dataset_root / clean_path
    img = cv2.imread(str(clean_path), cv2.IMREAD_COLOR)
    if img is None:
        print(f"! unreadable clean image, skipped: {clean_path}")
        return False
    if mode == "resample":
        twin, meta = resample_twin(img, factor, cv2)
        prov_suffix = ".resample.json"
    else:
        twin, meta = degrade.degrade_image(
            img, row["image_id"], severity, base_seed, no_geom=True
        )
        assert meta["scan_geom_matrix"] == degrade.IDENTITY_2X3.tolist()
        prov_suffix = ".degrade.json"
    assert twin.shape == img.shape, (
        f"{row['image_id']}: twin dims {twin.shape} != clean {img.shape}"
    )

    key = twin_key(mode, severity, factor)
    deg_path = out_dir / f"{row['image_id']}__{key}.png"
    cv2.imwrite(str(deg_path), twin)
    (out_dir / f"{row['image_id']}__{key}{prov_suffix}").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1)
    )

    gold_path, gold_source = resolve_gold_path(dataset_root, gen, row["doc_id"])
    deg_rel = deg_path.relative_to(dataset_root).as_posix()
    base: dict[str, Any] = {
        "image_id": row["image_id"],
        "doc_id": row["doc_id"],
        "generator": gen,
        "page_w_px": row.get("page_w_px"),
        "page_h_px": row.get("page_h_px"),
        "severity_key": f"{severity}ng" if mode == "degrade" else key,
        "base_seed": base_seed,
    }
    local_rows.append({
        **base,
        "clean_path": str(clean_path),
        "degraded_path": str(deg_path),
        "gold_path": str(gold_path),
        "gold_source": gold_source,
    })
    modal_rows.append({
        **base,
        "clean_path": clean_path.relative_to(dataset_root).as_posix(),
        "degraded_path": deg_rel,
    })
    print(f"{row['image_id']}  {gen}  {img.shape[1]}x{img.shape[0]}  -> {deg_rel}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--images", type=Path,
                    default=_HERE.parents[1] / "data" / "pilot_1k" / "images.jsonl")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--severity", type=int, default=2, choices=(1, 2, 3),
                    help="photometric severity of the twin (geometry always disabled)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--mode", choices=("degrade", "resample"), default="degrade")
    ap.add_argument("--factor", type=int, default=2,
                    help="resample mode: down-up factor")
    ap.add_argument("--out-name", default="degraded_b1",
                    help="twin image dir under images/")
    args = ap.parse_args()

    local_rows, modal_rows = build_twins(
        args.images, args.n, args.severity, args.seed,
        mode=args.mode, factor=args.factor, out_name=args.out_name,
    )
    dataset_root = args.images.resolve().parent
    local_manifest, modal_manifest = manifest_paths(
        dataset_root, twin_key(args.mode, args.severity, args.factor))
    local_manifest.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in local_rows))
    modal_manifest.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in modal_rows))
    by_gen = {g: sum(1 for r in local_rows if r["generator"] == g) for g in TWIN_GENERATORS}
    print(f"done: {len(local_rows)} twins ({by_gen}) -> {local_manifest.name}, "
          f"{modal_manifest.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
