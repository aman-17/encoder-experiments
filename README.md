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

**Layout sidecar:** each page may also ship `<id>.layout.json` — the page's
layout ground truth as a list of items with Canonical17 `class` labels and
normalized `bbox = [x, y, w, h]` (same coordinate convention as above). It is
not part of the manifest row; the probe harness joins it on `image_id`, like
everything else. `src/data/degrade.py` passes it through with bboxes
transformed by `scan_geom_matrix` and classes/text untouched.

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

fp16 full-grid features: ~1.5–2 MB/image for the 384–1024px towers → **~100 GB
for 50k images x 7 encoder variants**. SAM is the heavy one (4096 tokens x 768);
if disk gets tight, run SAM last or cut its probe set — don't drop grids to
pooled-only, the localization probes need them.

## Adding an encoder

Subclass `EncoderAdapter` in `adapters/`, set `name/checkpoint/pooled_kind`,
implement `load()` + `encode()` (return final-hidden tokens, padding stripped,
row-major), register it in `registry.py`. Transformers imports go inside
`load()` so the CLI stays importable without heavy deps.
