# encoder-experiments

Tooling for the document-VLM signal-localization work: frozen-encoder feature
extraction, a probe harness, site-wise localization inside the Qwen3.5-4B
stack, activation patching, a bridge trainer, and token-budget sweeps against
external OCR benchmarks.

**Four docs, no more.** [docs/ideas.md](docs/ideas.md) — the write-up framing
and what currently stands. [docs/experiments.md](docs/experiments.md) — every
experiment: what it asks, its pre-registered decision rule, and its outcome.
[docs/results.md](docs/results.md) — the measurement record, refuted findings
included. **This file** — tooling and contracts only, no findings.

Three explainers sit alongside them for people joining the work, not adding to
it: [docs/speaker-notes.md](docs/speaker-notes.md) (the whole arc in plain
language), [docs/evaluations.md](docs/evaluations.md) (one real page, one real
character, followed through every step of how a number is produced), and
[docs/data-annotation.md](docs/data-annotation.md) (where the pages and their
ground truth come from, followed through one real document). They restate; they
never hold a finding of their own.

## Layout

```
docs/         ideas.md (framing) · experiments.md (designs + decision rules) · results.md (the record)
pipelines/    Modal apps (modal_*.py, run with `modal run`) + local assemblers (run_*.py and friends)
src/
  encoder_experiments/   the importable package — adapters, extraction, probes, heads, reconstruction
  data/                  corpus generators (node) + degradation + sidecar tooling
tests/        193 passing; no downloads, no GPU
validation/   raw result bundles and one-off baseline scripts
figures/      figures + tidy curve data
```

Everything in `pipelines/` is a **sibling-import group** — `modal_phaseb_train`
imports `modal_frontier`, and the `run_*` assemblers import `modal_extract`.
They resolve because the entrypoint's own directory lands on `sys.path[0]`.
Keep them in one directory, or fix the imports deliberately.

## Scope: what is live and what is scaffolding

The repo is wider than the current work. Much of this README describes
machinery built for the earlier eight-tower survival-curve framing; it still
runs and is still supported, but it is not what the current work uses. The
table below says which is which.

| surface | status |
|---|---|
| `qwen35_vit` (incl. `site=premerge`), `deepseek_ocr` | **live** — the two towers that carry current work |
| `glyph_id`, `pl1_class` probes | **live** — headline signal + specificity contrast |
| exp2a site grid, reconstruction, patching, Phase-B trainer | **live** |
| token-budget sweep on external benchmarks (`modal_extbench_bridge.py`) | **live** — the current positive result |
| CLIP / SigLIP2 / NaFlex / SAM + random-init floors | supporting only |
| `series_id`, `cell_row`, `cell_col`, `pl2_extent`, `pl3_summary` | runnable, but **not reportable as findings** — see the validity addendum in [docs/results.md](docs/results.md) |
| `point_value` | **broken** — negative R² everywhere, both heads. Do not run |
| P-L4 reading order | never built. Not planned |
| `difficulty_tagger.py` | implemented and tested, but nothing stratifies on it — tags come out ~100% `hard` on dense pages |

## Quickstart

```bash
uv sync
uv run pytest          # no downloads; pins site-sampling math, budgets, heads, reconstruction
```

The three things you most likely want:

```bash
# 1. extract features for one tower (sites mode — the default at scale)
uv run python -m encoder_experiments.extract \
    --manifest data/probe_v1/manifest.jsonl --encoder qwen35_vit \
    --sites-from probes.jsonl --out features/

# 2. fit probes on the cache
uv run python -m encoder_experiments.probe_fit \
    --features features/ --probes probes.jsonl \
    --encoders qwen35_vit --out results/

# 3. pre-merge (S1) capture — the bridge experiments' input
uv run python -m encoder_experiments.extract \
    --manifest data/probe_v1/manifest.jsonl --encoder qwen35_vit \
    --adapter-arg site=premerge --sites-from probes.jsonl --out features/
```

## Code map

**Package** (`src/encoder_experiments/`) — importable, CPU-safe, no heavy deps
at import time:

| module | does |
|---|---|
| `extract.py` | CLI. Forward pass → feature cache (full grid or sites). |
| `probe_fit.py` | CLI. Cached features + `probes.jsonl` → per-pair result JSONs + `summary.md`. Row schema in its module docstring. |
| `probe_sampler.py` | CLI. Corpus + sidecars → `probes.jsonl`. |
| `sites.py` / `site_store.py` | Marked-point → token lookup; the sites cache format. |
| `heads.py` / `probe_metrics.py` | Linear + MLP heads, capacity matching, bootstrap CIs, IoU/R²/accuracy. |
| `reconstruct.py` | CLI. S2→S1 inverse map + functional residual (the 44% instrument). |
| `patching.py` | Activation-patching hooks for B1. |
| `frontier_score.py` | CLI. Generated markdown vs gold — TEDS via pipe→HTML, edit-sim, chart-rule recall. |
| `derive_pooled.py` | CLI. Adaptive-pool cached grids down to budget rungs (merge mechanism). |
| `budgets.py` | The token ladder and per-tower knob mapping. |
| `registry.py` / `adapters/` | Encoder registry; one adapter per tower. |
| `difficulty_tagger.py` | Difficulty rules v1. Implemented, tested, unused — tags saturate at `hard`. |

**Modal drivers** (repo root) — each is a separate app; invoke through *this
repo's* venv (`uv run modal ...`; the module is mounted from the invoking
environment):

| script | app | does |
|---|---|---|
| `pipelines/modal_extract.py` | `encoder-anatomy-pilot` | extraction fan-out + `--fit` + `--derive-pooled` |
| `pipelines/modal_frontier.py` | `encoder-anatomy-frontier` | Exp 3 generation: full stacks → markdown at budgets |
| `pipelines/modal_patch.py` | — | B1 activation patching, inference-only |
| `pipelines/modal_phaseb_train.py` | — | B2/B4 bridge vs decoder-LoRA training + eval |

**Assemblers** (root, local) — read Modal output trees, emit raw JSON, no
conclusion prose: `pipelines/run_exp2a.py` (site grid + reconstruction + threshold
assembly), `pipelines/run_b1_patching.py` (restoration fractions), `pipelines/run_validation_refits.py`
(shortcut-baseline refits), `pipelines/gate2a_sanity.py` (pre-merge site sanity check),
`pipelines/fetch_frontier.py` / `pipelines/gen_return.py` (volume-bypass fetch/generation — the
shared volume serves stale listings under concurrent commits).

## Encoders

| registry key | arm | checkpoint | random-init | scope |
|---|---|---|---|---|
| `qwen35_vit` | A3 | Qwen/Qwen3.5-4B (vision tower) | no | **live** |
| `deepseek_ocr` | P2 | deepseek-ai/DeepSeek-OCR | no | **live** |
| `clip_vit_l_336` | P1 | openai/clip-vit-large-patch14-336 | yes | appendix |
| `siglip2_so400m_384` | A1 | google/siglip2-so400m-patch14-384 | yes | appendix |
| `siglip2_naflex` | A2 | google/siglip2-so400m-patch16-naflex | yes | appendix |
| `sam_vit_b` | A4/5 | facebook/sam-vit-base (pre-neck) | yes | appendix |
| `qwen3_vl_vit` | F1 | Qwen/Qwen3-VL-4B-Instruct (vision tower) | no | excluded — see below |

- **`qwen35_vit` has a site knob**: `--adapter-arg site=premerge|postmerge`
  (default `postmerge`). `premerge` installs a forward pre-hook on
  `visual.merger` and captures its input — the 2× grid, `merge²` = 4 tokens per
  merged one. This is S1; `postmerge` is S2 (= the LM's input embeddings in this
  architecture). `pipelines/modal_extract.py --decoder-mid` gives S3.
- **Bridge topology differs between the Qwen towers** (verified in configs).
  Qwen3.5-4B: `deepstack_visual_indexes: []` — a single bridge, so
  encoder-output probes see everything its decoder receives, and the
  localization is architecturally complete for it. Qwen3-VL: DeepStack
  `[5, 11, 17]` — three mid-ViT paths inject at multiple decoder depths, so its
  probe numbers describe the top path only. **Excluded from all causal work**;
  the Phase-B trainer hard-errors on a non-empty `deepstack_visual_indexes`
  rather than silently training one bridge of four.
- **`deepseek_ocr` is wired directly against the checkpoint's `deepencoder.py`**
  (SAM→16×conv→CLIP→projector, weights prefix-filtered from the safetensors
  shard, strict-loud on mismatch) — the remote-code VLM path is bypassed.
  GLOBAL 1024px view only, 256 tokens: production adds tiled crops, so every
  DeepSeek number reads as "the global encoder alone" and carries that label.
- **`sam_vit_b__rand` emits exactly-zero features** (a property of SAM's
  pre-neck at random init, verified) — no usable floor; use CLIP/SigLIP2 rand.
- **A5 has no separate tower**: its global stage is a text LM; its vision side
  *is* `sam_vit_b`.

## Contracts

These are load-bearing and pinned by tests. Break one and results silently
corrupt.

**Manifest** — JSONL, one image per line:

```json
{"image_id": "charts/series_bind/000123", "image_path": "/abs/path/000123.png", "task": "series_id", "difficulty_bin": 3, "point_xy": [0.41, 0.62], "label": 2}
```

Extraction uses only `image_id` + `image_path`; everything else rides along for
the probe harness, which joins on `image_id`.

**Marked points** — `(x, y)` normalized to `[0, 1]` over the *original* image, x
rightward, y downward. Patch centers are `((j+0.5)/W, (i+0.5)/H)`;
`sites.features_at` maps a point at a patch center exactly onto that patch's
token. For padded/letterboxed towers (SAM pads to square), emit square renders
so normalized coords survive preprocessing.

**Layout sidecar (v2)** — `<id>.layout.json`, a list of items with Canonical17
`class` and `bbox = [x, y, w, h]` as **integers on the 0–1000 page scale**
(Qwen-VL grounding convention; ÷1000 for the normalized frame). Not part of the
manifest row; joined on `image_id`. `src/data/degrade.py` auto-detects v1
(normalized float) vs v2 (int 0–1000) and transforms bboxes by
`scan_geom_matrix`, classes/text untouched. Cells sidecars get their convention
sniffed **per file** (replicator corners `[x0,y0,x1,y1]` vs table-generator
`[x,y,w,h]` — payloads are self-describing) and stay in their own convention.

**Feature cache** — `features/<encoder>[__rand]/<image_id>.safetensors` with
`tokens` [N, D] + `pooled` [D] in fp16, grid shape and provenance in metadata.
Re-runs skip existing files; per-image failures go to `errors.jsonl` and never
kill the run.

**Sites cache** (`--sites-from`) — `<image_id>.sites.safetensors` with
pre-sampled `sites` [K, D] fp16 + `points` [K, 2] fp32 + `pooled` [D] fp16,
~50 KB/image instead of full grids. Site vectors are computed by
`sites.features_at` on the fp16-roundtripped grid — bit-identical to a full-grid
read (pinned by `tests/test_site_store.py`). `probe_fit` reads either layout
transparently, matching `point_xy` against stored points by **exact 6dp
equality**; a miss is a hard error naming the nearest stored point.

**Sweep metadata** — every stored file carries `budget_tokens` (the ACTUAL token
count of that encode, never the nominal knob), `mechanism`
(`resolution|res-mode|merge|native`) and `knob`. `probe_fit` copies them into
each results JSON. **Analysis plots against realized counts, never nominal.**

## Probe harness

`probe_fit` fits linear (LogisticRegression / Ridge) + 2-layer-MLP heads per
(probe family × encoder) on a fixed **document-level** split — a doc never
straddles, hard-asserted after splitting (`doc_id` per row, or derived by
stripping `__sev<key>` / `__p<N>` / `_s<NNN>` suffixes). Every head gets a
shuffled-train-label control; CIs are 1000 bootstrap resamples over test
documents. Slices by `meta.scan_severity` (the severity KEY string, e.g. `'2b'`;
`meta.severity_level` is the int base), `meta.difficulty`, and per-class for
`pl1*`.

A (probe × encoder) pair that raises records the error in its results JSON and
the run continues; `summary.md` is always written, with an errors section
(`--min-samples` tunes the skip threshold). Site probes read
`sites.features_at`; `pl3*` (or `"site": "pooled"`) reads the pooled vector.
Feature files open lazily, one image at a time.

**MLP calibration**: 300 epochs / lr 3e-5 restores MLP ≥ linear wherever that is
attainable. On the S1 concat4 arms, linear > MLP is a transfer property of the
arm, not undertraining (exhaustive sweep) — the exp2a yardstick clamps negative
lifts at 0 accordingly.

Probe families and their labels:

| probe | site | label | scope |
|---|---|---|---|
| `glyph_id` | site feature | char + `size_pt` (text) | **live** |
| **P-L1** `pl1_class` | each patch token | Canonical17 class ∪ background (sidecar rasterized to the encoder's patch grid; majority-at-center, smallest-area-wins) | **live** |
| `series_id` | site feature | series identity (charts) | appendix |
| `cell_row` / `cell_col` | site feature | int row / column index | appendix |
| **P-L2** `pl2_extent` | site feature inside an element | `[x,y,w,h]` /1000, mean IoU / IoU@0.5 | appendix |
| **P-L3** `pl3_summary` | pooled | per-class presence + `n_boxes` | appendix |
| `point_value` | site feature | data-space value | **broken — do not run** |

## Bridge experiments (the current work)

Site-wise localization and repair on `qwen35_vit`. Designs, thresholds, and
decision rules: [docs/experiments.md](docs/experiments.md).

```bash
# S1 pre-merge sanity on 5 images before committing a grid (checks the 4x
# token count, distinct children within a merged cell, grid geometry)
uv run modal run pipelines/gate2a_sanity.py

# exp2a: site x budget probe grid + S2->S1 reconstruction
uv run modal run --detach pipelines/modal_extract.py --fit \
    --encoders qwen35_vit --probes-subpath probes.jsonl --run exp2a_v1
uv run python pipelines/run_exp2a.py            # assembles thresholds + sandwich table

# B1 activation patching (twins built by src/data/make_b1_twins.py)
uv run modal run --detach pipelines/modal_patch.py --shards 4
uv run python pipelines/run_b1_patching.py      # restoration fractions + CIs

# B2 bridge-only vs decoder-LoRA control
uv run modal run pipelines/modal_phaseb_train.py --plan          # arm/param-count plan
uv run modal run pipelines/modal_phaseb_train.py --smoke         # end-to-end smoke
uv run modal run --detach pipelines/modal_phaseb_train.py --train --arms A,B --lrs 1e-5,3e-5,1e-4
uv run modal run --detach pipelines/modal_phaseb_train.py --eval --eval-lrs auto
uv run modal run pipelines/modal_phaseb_train.py --score         # arm contrasts + CIs
```

`--plan` reports trainable-parameter counts per arm and picks the decoder-LoRA
rank that matches arm A within 2×. Both counts go in every results table — the
param match *is* the control.

## Modal

App `encoder-anatomy-pilot`, workspace llamaindex-research; volume
`encoder-anatomy-pilot` at `/vol`; HF cache `ocr-rl-trainer-hf-cache-0` shared
with the RL trainers. Corpus lives at `/vol/corpus`, features at
`/vol/features`, results at `/vol/results/<run>/`.

```bash
# upload a corpus (manifest paths must be corpus-relative)
modal volume put encoder-anatomy-pilot data/pilot_1k/images /corpus/images
modal volume put encoder-anatomy-pilot data/pilot_1k/images_modal.jsonl /corpus/images_modal.jsonl

# extraction fan-out (encoder x shard); resume-safe
uv run modal run --detach pipelines/modal_extract.py \
    --encoders qwen35_vit,deepseek_ocr --shards 4 \
    --images-subpath images_modal.jsonl

# fitting next to the features; one container per encoder
uv run modal run --detach pipelines/modal_extract.py --fit \
    --encoders qwen35_vit --probes-subpath probes.jsonl --run pilot_v1
```

**Hard-won rules — each of these cost a run:**

- **Compute dtype is fp32 by default** (`--dtype` to override). `auto` picks
  bf16 on CUDA, and these ViTs amplify bf16 noise over layers (per-token min
  cosine ~0.25 vs fp32 on low-norm patches — verified dtype-caused, not
  Modal-caused). Features must be box-independent. Storage stays fp16.
- **Always `--detach`** for anything long: a `modal run` app dies with the local
  client. One restart killed four encoders' fits mid-run.
- **Fitting goes on CPU containers** (16 core) — sklearn-bound, schedules
  instantly, and dodges the shared-workspace L40S queue where pending apps got
  CLI-stopped.
- Each `--fit` invocation writes its own `summary.md` (last-writer-wins) — fan
  out per encoder and consolidate the per-pair JSONs yourself.
- **A finiteness guard refuses to cache NaN/Inf/fp16-overflow features.** MPS
  *saturates* fp16 casts instead of producing Inf, so the guard checks source
  absmax; local MPS runs have produced corrupt CLIP grids while reporting
  success. Prefer `--device cpu` locally, or extract on Modal.
- **Volume dirs under concurrent writers show commit-lineage read bounce.**
  Treat per-file presence, not directory listings, as truth during active runs;
  `pipelines/fetch_frontier.py` exists because `modal volume ls/get` served stale views.
- **Function timeout must exceed shard_pages × worst s/page.** The 4h ceiling
  killed 355-page shards at ~80s/page; 16-way sharding + resume recovered.

## Budget sweep `appendix`

`LADDER = [64, 100, 144, 196, 256, 400, 576, 784, 1024]` target tokens
(`budgets.py`). Two derivation routes, one output layout — the sites contract
above, under `features_sweep/<encoder>@<budget>/`.

**Knob towers** (`resolution` / `res-mode`): the preprocessing knob realizes the
budget — `siglip2_naflex` → `max_num_patches=budget`; `qwen35_vit` →
`max_pixels=budget*784` (14px patch × 2×2 merge → 784 px/merged token);
`deepseek_ocr` → `base_size` per `{64:512, 100:640, 144:768, 196:896, 256:1024,
400:1280}` (grid side is exactly `base_size/64`; no rung above 400).
naflex/qwen realize ≤ budget (asserted in the adapters); deepseek is exact.

```bash
uv run modal run --detach pipelines/modal_extract.py \
    --encoders siglip2_naflex,qwen35_vit,deepseek_ocr \
    --budget 64,100,144,196,256,400,576,784,1024 \
    --shards 4 --probes-subpath probes.jsonl        # sites mode is mandatory
```

**Merge towers** (`merge`): fixed-res grids (clip 24×24, siglip2 27×27, sam
64×64) adaptive-average-pooled DOWN from existing full-grid caches (fp32
pooling, then bilinear site readout via the same `save_sites` writer) — no
re-extraction. Rungs above native are skipped; the pooled vector becomes the
merged-grid mean.

```bash
uv run python -m encoder_experiments.derive_pooled \
    --features-in features/clip_vit_l_336 --probes probes.jsonl \
    --rungs 64,100,144,196,256,400,576 --out features_sweep/

uv run modal run --detach pipelines/modal_extract.py --derive-pooled \
    --encoders clip_vit_l_336,siglip2_so400m_384,sam_vit_b
```

`--out-tower` renames output dirs — the B3 pixel-information control pools
`qwen35_vit` NATIVE grids to `qwen35_vit_pooled@<rung>`, because
`qwen35_vit@<rung>` is already the resolution sweep's.

## Disk sizing

fp16 full-grid features run ~1.5–2 MB/image for the 384–1024px towers (SAM is
the heavy one: 4096 tokens × 768). The pilot's full-grid cache was ~45 GB for
1k docs × 8 variants.

**Use `--sites-from`.** Marked points are known up front, so storing pre-sampled
site features + pooled costs ~50 KB/image — a ~30× reduction, and bit-identical
readout. At the 20k-page training scale, full grids for the two live towers
would be several hundred GB and buy nothing; sites mode is the default and
full-grid extraction is an exploratory tool for small N only.

Layout probes stay compatible by sampling **K ≈ 64–128 labeled patches per
page** into the manifest (patch center + Canonical17 label) — P-L1 never needs
the full grid at scale.

## Adding an encoder

Subclass `EncoderAdapter` in `adapters/`, set `name` / `checkpoint` /
`pooled_kind`, implement `load()` + `encode()` (return final-hidden tokens,
padding stripped, row-major), register in `registry.py`. Keep transformers
imports inside `load()` so the CLI stays importable without heavy deps.

**No new encoders** ([docs/ideas.md](docs/ideas.md) §Non-goals) — this is here for
reuse, not for scope growth.
