# encoder-experiments — Exp 1 probe pass

Difficulty taxonomy for probe data (easy/medium/hard + multi-as-flag, versioned
rules): see [Data.md](Data.md).

Frozen-encoder feature extraction + probe harness for the encoder-anatomy
paper. No training happens here: each tower runs forward once per image,
features are cached to disk, and `probe_fit` fits linear / 2-layer-MLP heads
on the cache. Results (pilot table, survival curves, task frontier, caveats):
[RESULTS.md](RESULTS.md); figures in `figures/`. Probe-validity program
(shortcut baselines, corrected floors, OOD plan):
[measurement-validation.md](measurement-validation.md), raw baselines in
`validation/`. Paper framing: [ideas.md](ideas.md).

## Encoders

| registry key         | arm  | checkpoint                              | random-init |
|----------------------|------|-----------------------------------------|-------------|
| `clip_vit_l_336`     | P1   | openai/clip-vit-large-patch14-336       | yes         |
| `siglip2_so400m_384` | A1   | google/siglip2-so400m-patch14-384       | yes         |
| `siglip2_naflex`     | A2   | google/siglip2-so400m-patch16-naflex    | yes         |
| `qwen35_vit`         | A3   | Qwen/Qwen3.5-4B (vision tower)          | no          |
| `qwen3_vl_vit`       | F1   | Qwen/Qwen3-VL-4B-Instruct (vision tower)| no          |
| `sam_vit_b`          | A4/5 | facebook/sam-vit-base (pre-neck)        | yes         |
| `deepseek_ocr`       | P2   | deepseek-ai/DeepSeek-OCR                | no          |

Notes:
- **A5 has no separate tower here** — its global stage (Qwen2-0.5B) is a text
  LM; at Exp 1 its vision side *is* `sam_vit_b`. A4/A5 results at this stage
  read as "does the raw backbone carry the info", not a verdict on the
  (not-yet-built) hybrids.
- **`deepseek_ocr` is wired directly against the checkpoint's `deepencoder.py`**
  (SAM→16×conv→CLIP→projector, weights prefix-filtered from the safetensors
  shard, strict-loud on mismatch) — the remote-code VLM path is bypassed
  entirely. GLOBAL 1024px view only, 256 tokens (16×16): production DeepSeek-OCR
  adds tiled crops, so its probe numbers read as "the global encoder alone",
  not the full serving stack.
- **Bridge topology differs between the Qwen towers** (checked in the configs):
  Qwen3.5-4B has a single bridge (`deepstack_visual_indexes: []` — just the
  2x2 merger), so encoder-output probes see everything its decoder receives.
  Qwen3-VL uses DeepStack (`[5, 11, 17]`): three mid-ViT feature paths inject
  at multiple decoder depths, so `qwen3_vl_vit` probe numbers describe the
  top-level path only — its full stack receives more than we probe.
- **Random-init floor control**: `--random-init` rebuilds the architecture from
  config with fresh weights. Supported for the four public towers only.
  **`sam_vit_b__rand` emits exactly-zero features** (a property of SAM's
  pre-neck at random init, verified) — it has no usable floor; use the CLIP
  and SigLIP2 rand floors instead.

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
classes/text untouched. Cells sidecars likewise get their `bbox` convention
sniffed **per file** (replicator corners `[x0,y0,x1,y1]` vs table-generator
`[x,y,w,h]` — the payloads are self-describing) and are transformed in, and
stay in, their own convention.

## Probe suite

Content probes (labels ride in the manifest row, marked points per the
convention above):

| probe | input site | label |
|---|---|---|
| series-ID at marked point (`series_id`) | site feature | series identity (charts) |
| point-coordinate regression (`point_value`) | site feature | data-space value (charts) |
| cell row at marked point (`cell_row`) | site feature | int row index (tables, classification) — shares its sampled cells with `cell_col`; the two sub-probes are fitted independently and reported side by side |
| cell column at marked point (`cell_col`) | site feature | int column index (tables, classification) |
| glyph identity vs font size (`glyph_id`) | site feature | char + `size_pt` (text) |

Layout probes (labels come from `<id>.layout.json`, joined on `image_id` —
bboxes are first-class in the experiments; modern doc models ground everything):

| probe | input site | label |
|---|---|---|
| **P-L1** patch-class | each patch token | Canonical17 class ∪ background (sidecar rasterized to the encoder's own patch grid; majority-at-center, smallest-area-wins on overlap) |
| **P-L2** extent regression | site feature at a point inside an element | the element's `[x, y, w, h]` /1000 (metric: mean IoU, IoU@0.5) |
| **P-L3** layout summary | pooled | flat float vector: per-class presence (0/1, Canonical17 order) + `n_boxes` as the last element (regression; ties to Data.md bbox difficulty tags) |
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

# probe harness: cached features + probes.jsonl -> results table
uv run python -m encoder_experiments.probe_fit \
    --features features/ --probes probes.jsonl \
    --encoders clip_vit_l_336,siglip2_so400m_384,siglip2_naflex \
    --out results/
```

`probe_fit` fits linear (LogisticRegression / Ridge) + 2-layer-MLP heads per
(probe family × encoder) on a fixed **document-level** train/test split (a doc
never straddles the split — hard-asserted after splitting; `doc_id` per row
[the sampler copies it from the manifest], or derived by stripping
`__sev<key>`/`__p<N>`/`_s<NNN>` suffixes), with a shuffled-train-label control
per head, 95% CIs from 1000 bootstrap resamples over test documents, and
slices by `meta.scan_severity` (the severity KEY string, e.g. `'2b'`, with
`meta.severity_level` the int base level), `meta.difficulty`, and per-class
for `pl1*`. A (probe × encoder) pair that raises records the error in its
results JSON and the run continues; `summary.md` is always written with the
successful families plus an errors section (`--min-samples` tunes the skip
threshold). Site probes
read `sites.features_at(tokens, grid, point_xy)`; `pl3*` (or `"site":
"pooled"`) reads the pooled vector. `pl2*` labels are `[x, y, w, h]` scored by
mean IoU / IoU@0.5. Feature files are opened lazily one image at a time (only
site vectors are kept in memory). Outputs `results/<probe>__<encoder>.json` +
consolidated `results/summary.md`. The probes.jsonl row schema is documented
in `probe_fit.py`'s module docstring.

Output: `features/<encoder>[__rand]/<image_id>.safetensors` with `tokens`
[N, D] + `pooled` [D] in fp16, grid shape and provenance in the metadata.
Re-runs skip existing files; per-image failures go to `errors.jsonl` and never
kill the run.

**Site mode (budget sweep):** `extract --sites-from <probes.jsonl | sites
manifest>` stores `<image_id>.sites.safetensors` with pre-sampled `sites`
[K, D] fp16 + `points` [K, 2] fp32 + `pooled` [D] fp16 (~50 KB/image instead
of full grids). The site vectors are computed by `sites.features_at` on the
fp16-roundtripped grid — bit-identical to what a full-grid cache read would
produce (pinned by `tests/test_site_store.py`). `site_store.build_site_manifest`
turns a probes.jsonl into the deterministic per-image point manifest (unique
6dp-rounded points; pl3/pooled rows need only the pooled vector). `probe_fit`
reads either layout transparently, matching each row's `point_xy` against the
stored points by exact 6dp equality — a miss is a hard error naming the
nearest stored point. Sweep metadata contract: every stored file carries
`budget_tokens` (the ACTUAL token count of that encode, never the nominal
knob), `mechanism` (`resolution|res-mode|merge|native`, `--mechanism`) and
`knob` (`--knob`, e.g. `"max_num_patches=1024"`); `probe_fit` copies them
into each results JSON.

## Modal (GPU extraction + fitting)

`modal_extract.py` runs the same extraction loop and the same `probe_fit`
pipeline on L40S GPUs (app `encoder-anatomy-pilot`, workspace
llamaindex-research; volume `encoder-anatomy-pilot` at `/vol`, HF cache =
`ocr-rl-trainer-hf-cache-0` shared with the RL trainers). Invoke via **this
repo's venv** (`uv run modal ...` — the module is mounted from the invoking
environment; the ocr_postraining venv can't see it):

```bash
# upload a corpus (paths in the manifest must be corpus-relative)
modal volume put encoder-anatomy-pilot data/pilot_1k/images /corpus/images
modal volume put encoder-anatomy-pilot data/pilot_1k/images_modal.jsonl /corpus/images_modal.jsonl

# extraction fan-out (encoder x shard); resume-safe
uv run modal run --detach modal_extract.py \
    --encoders clip_vit_l_336,siglip2_naflex,qwen35_vit --shards 4 \
    --images-subpath images_modal.jsonl

# probe fitting next to the features; one container per encoder parallelizes
uv run modal run --detach modal_extract.py --fit \
    --encoders qwen35_vit --probes-subpath probes.jsonl --run pilot_v1
```

Hard-won rules baked in:
- **Compute dtype is fp32 by default** (`--dtype` to override). "auto" picks
  bf16 on CUDA, and these ViTs amplify bf16 noise over layers (per-token min
  cosine ~0.25 vs fp32 on low-norm patches — verified dtype-, not
  Modal-caused). Features must be box-independent; storage stays fp16.
- **Always `--detach`** for anything long: a `modal run` app dies with the
  local client (one restart killed 4 encoders' fits mid-run).
- Each `--fit` invocation writes its own `summary.md` (last-writer-wins) —
  fan out per encoder and consolidate the per-pair JSONs yourself.
- A finiteness guard refuses to cache NaN/Inf/fp16-overflow features (MPS
  *saturates* fp16 casts instead of producing Inf — the guard checks source
  absmax; local MPS runs have produced corrupt CLIP grids while reporting
  success, so prefer `--device cpu` locally or extract on Modal).

## Budget sweep (Exp 2 token frontier)

`LADDER = [64, 100, 144, 196, 256, 400, 576, 784, 1024]` target tokens
(`encoder_experiments/budgets.py`). Two derivation routes, one output layout —
the site-mode contract above (`sites` + `points` + `pooled`, `budget_tokens` =
ACTUAL realized count) under `features_sweep/<encoder>@<budget>/`:

- **Knob towers** (`mechanism` `resolution` / `res-mode`): the preprocessing
  knob realizes the budget — `siglip2_naflex` → `max_num_patches=budget`,
  `qwen35_vit` → `max_pixels=budget*784` (14px patch × 2×2 merge → 784
  px/merged token), `deepseek_ocr` → `base_size` per `{64:512, 100:640,
  144:768, 196:896, 256:1024, 400:1280}` (grid side is exactly base_size/64;
  no rung above 400). naflex/qwen realize ≤ budget (asserted in the
  adapters), deepseek is exact; analysis must plot against the recorded
  ACTUAL counts.

      uv run modal run --detach modal_extract.py \
          --encoders siglip2_naflex,qwen35_vit,deepseek_ocr \
          --budget 64,100,144,196,256,400,576,784,1024 \
          --shards 4 --probes-subpath probes.jsonl   # sites-mode is mandatory

- **Merge towers** (`mechanism` `merge`): the fixed-res grids (clip 24×24,
  siglip2 27×27, sam 64×64) are adaptive-average-pooled DOWN from the
  existing full-grid caches (fp32 pooling, then bilinear site readout at the
  probes' points, via the same `save_sites` writer) — no re-extraction.
  Rungs above native are skipped; the pooled vector becomes the merged-grid
  mean (`source_pooled_kind` preserved).

      uv run python -m encoder_experiments.derive_pooled \
          --features-in features/clip_vit_l_336 --probes probes.jsonl \
          --rungs 64,100,144,196,256,400,576 --out features_sweep/
      # or on Modal (CPU), against /vol/features/<tower>:
      uv run modal run --detach modal_extract.py --derive-pooled \
          --encoders clip_vit_l_336,siglip2_so400m_384,sam_vit_b

  Variable-grid caches pool the same way (grid_hw is read per image;
  over-budget rungs skip per image). `--out-tower` renames the output dirs —
  the B3 pixel-information control pools the qwen35_vit NATIVE grids to
  `qwen35_vit_pooled@<rung>` because `qwen35_vit@<rung>` is the resolution
  sweep's:

      uv run modal run --detach modal_extract.py --derive-pooled \
          --encoders qwen35_vit --out-tower qwen35_vit_pooled

## Pilot v1 (1k docs)

Corpus at `data/pilot_1k/` (audit: `DATASHEET.md`, gallery:
`browse/index.html`); feature cache + per-pair fit results on the Modal volume
(`/vol/features`, `/vol/results/pilot_v1/`). All results — pilot table,
survival curves, task frontier, findings, caveats — live in
[RESULTS.md](RESULTS.md); this README is tooling and contracts only.

## Disk sizing

fp16 full-grid features: ~1.5–2 MB/image for the 384–1024px towers (SAM is the
heavy one: 4096 tokens × 768) → hundreds of GB at the full 15–20k-page ×
7-tower scale. The fix is the `--sites-from` extraction mode above:
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
