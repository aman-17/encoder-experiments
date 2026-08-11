# encoder-experiments — Exp 1 probe pass

Difficulty taxonomy for probe data (easy/medium/hard + multi-as-flag, versioned
rules): see [Data.md](Data.md).

Frozen-encoder feature extraction for the encoder-anatomy paper. No training
happens here: each tower runs forward once per image, features are cached to
disk, and the probe harness (next step) fits linear / 2-layer-MLP heads on the
cache.

## Encoders

| registry key         | arm  | checkpoint                              | random-init |
|----------------------|------|-----------------------------------------|-------------|
| `clip_vit_l_336`     | P1   | openai/clip-vit-large-patch14-336       | yes         |
| `siglip2_so400m_384` | A1   | google/siglip2-so400m-patch14-384       | yes         |
| `siglip2_naflex`     | A2   | google/siglip2-so400m-patch16-naflex    | yes         |
| `qwen35_vit`         | A3   | Qwen/Qwen3.5-4B (vision tower)          | no          |
| `sam_vit_b`          | A4/5 | facebook/sam-vit-base (pre-neck)        | yes         |
| `deepseek_ocr`       | P2   | deepseek-ai/DeepSeek-OCR                | no          |

Notes:
- **A5 has no separate tower here** — its global stage (Qwen2-0.5B) is a text
  LM; at Exp 1 its vision side *is* `sam_vit_b`. A4/A5 results at this stage
  read as "does the raw backbone carry the info", not a verdict on the
  (not-yet-built) hybrids.
- **`deepseek_ocr` needs one-time wiring** on the box with the checkpoint: the
  adapter auto-probes known encode entry points and fails loudly with the
  module list if the release moved them. It's a probe-only reference; nothing
  blocks on it.
- **Random-init floor control**: `--random-init` rebuilds the architecture from
  config with fresh weights. Supported for the four public towers only.

## Manifest contract (data side)

JSONL, one image per line:

```json
{"image_id": "charts/series_bind/000123", "image_path": "/abs/path/000123.png", "task": "series_id", "difficulty_bin": 3, "point_xy": [0.41, 0.62], "label": 2}
```

Extraction uses only `image_id` + `image_path`; everything else rides along
for the probe harness, which joins on `image_id`.

**Marked-point convention:** `(x, y)` normalized to `[0, 1]` over the original
image, x rightward, y downward. Patch centers are `((j+0.5)/W, (i+0.5)/H)` —
`sites.features_at` maps a point at a patch center exactly onto that patch's
token (pinned by tests). For padded/letterboxed towers (SAM pads to square),
emit square renders so normalized coords survive preprocessing.

**Layout sidecar (v2):** each page may also ship `<id>.layout.json` — the page's
layout ground truth as a list of items with Canonical17 `class` labels and
`bbox = [x, y, w, h]` as **integers on the 0–1000 page scale** (Qwen-VL grounding
convention; divide by 1000 to recover the normalized frame used everywhere else).
It is not part of the manifest row; the probe harness joins it on `image_id`.
`src/data/degrade.py` auto-detects v1 (normalized float) vs v2 (int 0–1000) and
passes either through with bboxes transformed by `scan_geom_matrix`,
classes/text untouched.

## Probe suite

Content probes (labels ride in the manifest row, marked points per the
convention above):

| probe | input site | label |
|---|---|---|
| series-ID at marked point | site feature | series identity (charts) |
| point-coordinate regression | site feature | data-space value (charts) |
| cell (row,col) at marked point | site feature | logical grid cell (tables) |
| glyph identity vs font size | site feature | char + `size_pt` (text) |

Layout probes (labels come from `<id>.layout.json`, joined on `image_id` —
bboxes are first-class in the experiments; modern doc models ground everything):

| probe | input site | label |
|---|---|---|
| **P-L1** patch-class | each patch token | Canonical17 class ∪ background (sidecar rasterized to the encoder's own patch grid; majority-at-center, smallest-area-wins on overlap) |
| **P-L2** extent regression | site feature at a point inside an element | the element's `[x, y, w, h]` /1000 (metric: mean IoU, IoU@0.5) |
| **P-L3** layout summary | pooled | per-class presence + count bins (ties to Data.md bbox difficulty tags) |
| **P-L4** (stretch) reading order | two element-site features | which precedes |

All probes fit linear + 2-layer-MLP heads with shuffled-label and random-init
controls, and slice by token budget, difficulty tags, and `scan_severity` —
the localization-vs-degradation curves (does noise destroy *where* before
*what*?) come free from the degraded variants.

## Usage

```bash
uv sync
uv run pytest                    # no downloads; pins the site-sampling math

uv run python -m encoder_experiments.extract \
    --manifest data/probe_v1/manifest.jsonl \
    --encoder siglip2_naflex --adapter-arg max_num_patches=1024 \
    --out features/

# floor control for the same tower
uv run python -m encoder_experiments.extract \
    --manifest data/probe_v1/manifest.jsonl \
    --encoder siglip2_naflex --random-init --out features/
```

Output: `features/<encoder>[__rand]/<image_id>.safetensors` with `tokens`
[N, D] + `pooled` [D] in fp16, grid shape and provenance in the metadata.
Re-runs skip existing files; per-image failures go to `errors.jsonl` and never
kill the run.

## Disk sizing

fp16 full-grid features: ~1.5–2 MB/image for the 384–1024px towers (SAM is the
heavy one: 4096 tokens × 768) → hundreds of GB at the full 15–20k-page ×
7-tower scale. The planned fix is a `--sites-from-manifest` extraction mode:
since marked points are known up front, store pre-sampled site features +
pooled (~50 KB/image) instead of full grids. The layout probes stay compatible
by sampling **K ≈ 64–128 labeled patches per page** into the manifest (patch
center + Canonical17 label) — P-L1 never needs the full grid at scale. Full-grid
extraction remains the exploratory default at small N.

## Adding an encoder

Subclass `EncoderAdapter` in `adapters/`, set `name/checkpoint/pooled_kind`,
implement `load()` + `encode()` (return final-hidden tokens, padding stripped,
row-major), register it in `registry.py`. Transformers imports go inside
`load()` so the CLI stays importable without heavy deps.
