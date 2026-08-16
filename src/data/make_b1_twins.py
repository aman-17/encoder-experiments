"""B1 twins: geometry-aligned clean/degraded pairs for the activation-patching
experiment (phase-b-causal.md §B1).

Selects ~100 glyph-heavy pilot pages (text + math generators, sev-0 clean
images from data/pilot_1k), renders each one's degraded twin with degrade.py's
scan-geometry component DISABLED (no_geom=True: identity affine, photometric
blur/noise/tint only, severity 2 by default) so the twin has IDENTICAL pixel
dimensions and pixel-aligned content — identical token grids under the Qwen
processor. Gold is resolved exactly the way frontier scoring does
(frontier_score.load_gold: expected_markdown in <id>.test.json, else the
.gold.md/.md sidecar); docs frontier_score would skip are skipped here too.

Outputs (all under the dataset root, so score_pred_dir works unchanged):
  images/degraded_b1/<image_id>__sev<S>ng.png   (+ .degrade.json provenance)
  images_twins_b1.jsonl        local manifest: clean_path/degraded_path
                               absolute, gold_path + gold_source per row
  images_twins_b1_modal.jsonl  same rows with /vol/corpus-relative paths
                               (clean images are already at /corpus/images/clean)

Upload for the Modal harness:
  uv run modal volume put encoder-anatomy-pilot \
      data/pilot_1k/images/degraded_b1 /corpus/images/degraded_b1
  uv run modal volume put encoder-anatomy-pilot \
      data/pilot_1k/images_twins_b1_modal.jsonl /corpus/images_twins_b1_modal.jsonl

Usage:
  uv run python src/data/make_b1_twins.py            # 100 pages, severity 2
  uv run python src/data/make_b1_twins.py --n 8 --limit-check
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
) -> tuple[list[dict], list[dict]]:
    """Render the degraded twins and return (local_rows, modal_rows)."""
    import cv2  # noqa: PLC0415 — heavy import kept out of the pure selection path

    dataset_root = images_jsonl.resolve().parent
    rows = [json.loads(ln) for ln in images_jsonl.read_text().splitlines() if ln.strip()]

    candidates = select_twin_rows(rows, len(rows))  # full ordered pool; cut after gold-check
    out_dir = dataset_root / "images" / "degraded_b1"
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
                          local_rows, modal_rows, cv2):
                per_gen[gen] += 1

    return local_rows, modal_rows


def _emit_twin(row, dataset_root, out_dir, severity, base_seed,
               local_rows, modal_rows, cv2) -> bool:
    gen = row["generator"]
    clean_path = Path(row["image_path"])
    if not clean_path.is_absolute():
        clean_path = dataset_root / clean_path
    img = cv2.imread(str(clean_path), cv2.IMREAD_COLOR)
    if img is None:
        print(f"! unreadable clean image, skipped: {clean_path}")
        return False
    twin, meta = degrade.degrade_image(
        img, row["image_id"], severity, base_seed, no_geom=True
    )
    assert twin.shape == img.shape, (
        f"{row['image_id']}: twin dims {twin.shape} != clean {img.shape}"
    )
    assert meta["scan_geom_matrix"] == degrade.IDENTITY_2X3.tolist()

    deg_path = out_dir / f"{row['image_id']}__sev{severity}ng.png"
    cv2.imwrite(str(deg_path), twin)
    (out_dir / f"{row['image_id']}__sev{severity}ng.degrade.json").write_text(
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
        "severity_key": f"{severity}ng",
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
    args = ap.parse_args()

    local_rows, modal_rows = build_twins(args.images, args.n, args.severity, args.seed)
    dataset_root = args.images.resolve().parent
    local_manifest = dataset_root / "images_twins_b1.jsonl"
    modal_manifest = dataset_root / "images_twins_b1_modal.jsonl"
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
