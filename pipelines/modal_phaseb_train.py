"""Phase B2 — bridge-only pilot vs decoder-LoRA control (docs/experiments.md §B2).

Three arms on Qwen3.5-4B (same trust_remote_code loading as
modal_extract.extract_decoder_mid), bf16 + gradient checkpointing:

    A  bridge:  ONLY the vision merger/bridge parameters train (the merger
       module is found the way adapters/qwen_vit.py's premerge hook finds it);
       encoder + decoder frozen.
    B  decoder control: peft LoRA on decoder attn+mlp projections, rank picked
       so trainable params match arm A within 2x (both counts recorded).
    C  anchor: no training, eval only.

R4 arms (docs/experiments.md §R4 — diagnosis-supervised bridge training; B2
arms and their outputs untouched): arm-A recipe (merger trainable, encoder +
decoder frozen, LR fixed at 3e-4 = arm A's winner) plus a jointly-trained
aux head on live merger captures, total = lm_ce + lam * aux, lam fanned over
{0.1, 1.0} (--lam overrides):

    R4a  glyph-probe aux: linear head + CE over the corpus glyph vocab, read
         bilinearly (sites.features_at's convention, autograd kept) from the
         merger OUTPUT grid at the train images' glyph probe points
         (/vol/corpus/phaseb_glyphs.json, built locally from probes.jsonl —
         glyph_id rows, train docs only, corpus-wide vocab).
    R4b  inverse-map aux: linear head + MSE (per-dim std-normalized so lam is
         scale-comparable to CE) reconstructing each merged token's 4-patch
         pre-merge input concat from the merger output.

    Checkpoints land in /vol/phaseb/R4{a,b}_<lam>/; bridge.safetensors stays
    merger-only (the deliverable) — the aux head is saved separately as
    aux_head.safetensors, for the record, and is never loaded at eval.
    train_stats.json gains lm_ce/aux curves + finals so "bound but didn't
    transfer" is distinguishable from "failed to bind".

R5 arms (docs/experiments.md §R5 — the pin-vs-scale 2x2; R4 outputs
untouched). Both use R4a's exact objective (CE + lam=1 glyph aux, lr 3e-4):

    R5b  bridge-only: the R4a recipe verbatim — its 2x2 cell is the train
         corpus (R5b_700 duplicates R4a_1's recipe on the pilot split;
         R5b_5k is the new-corpus run).
    R5j  joint: merger AND decoder LoRA r16 both in the optimizer (LoRA lr
         3e-4 too), encoder frozen. NOT param-matched to bridge-only by
         design; merger/LoRA/aux-head counts reported separately.

    --train-corpus {pilot,r5} picks the train data: pilot = the 789-split
    below; r5 = /vol/corpus_r5/images_r5_modal.jsonl + probes_r5.jsonl,
    read remotely (val = fixed seeded 40 r5 docs). EVAL IS UNCHANGED for
    every arm: the same 211 pilot held-out docs. Checkpoints land in
    /vol/phaseb/R5{j,b}_<corpus>/ with <corpus> in {700,5k} — disjoint
    from every A_/B_/R4 dir. R5j saves bridge.safetensors (merger) + the
    peft adapter + aux_head.safetensors, all three; generation needs
    merger AND adapter, the b2 probe readout needs the merger half alone.

Data: the pilot_1k probe-harness doc split (probe_fit.doc_is_train, seed 0,
train_frac 0.8 -> 789 train / 211 held-out docs), clean natives from
/vol/corpus, gold located exactly as the frontier scoring pipeline located it
(frontier_score.load_gold). Loss = LM cross-entropy on the gold tokens only
(prompt + image positions masked); sequences over SEQ_CAP tokens are dropped
and counted. Val = a fixed 40-doc slice of train (seeded, excluded from
training batches); LR winners are best val loss, weights are saved at every
val improvement so the saved checkpoint IS the selected one.

Modes (exactly one per invocation):

    uv run modal run modal_phaseb_train.py --plan          # local dry-run
    uv run modal run modal_phaseb_train.py --smoke         # 20 docs, 30 steps,
                                                           # 1 lr per arm
    uv run modal run --detach modal_phaseb_train.py --train    # arm x lr fan
    uv run modal run --detach modal_phaseb_train.py --eval     # gen 211 docs
    uv run modal run modal_phaseb_train.py --score         # local scoring

--train fans train_arm over arm x LR_GRID (A: 3e-5/1e-4/3e-4, B: 1e-4/3e-4/
1e-3 — LoRA runs hotter); weights + train_stats.json land in
/vol/phaseb/<arm>_<lr>/. --eval picks each arm's best-val-loss LR from the
volume's train_stats.json files (override: --eval-lrs "A:0.0001,B:0.0003"),
then generates greedily (modal_frontier's pattern, its QWEN_PROMPT, native
resolution) over the held-out docs -> /vol/phaseb/eval/<arm>/<image_id>.md,
resume-safe. --score fetches the eval outputs, scores every arm with
frontier_score.score_pred_dir against data/pilot_1k, and writes the raw
bundle (per-arm summaries + doc-paired bootstrap contrasts A-B, A-C, B-C, and
the same contrasts on the §R5 content_edit_sim readout as content_contrasts;
no conclusion prose) to validation/b2_pilot.json. Retro-scoring the §R5
content metric over ALREADY-fetched eval outputs (no volume access) is
pipelines/retro_content_metric.py.

Blind control (--no-image): the same eval with the visual input removed, so
the share of the task score that is language prior rather than perception is
measurable. Two variants — `withheld` (no image part in the message at all,
no image tokens) and `blank` (a white page of the same size, so the image-token
span is preserved and only its information is gone). Prompt string, greedy
decoding, max_new_tokens, manifest and scorer are identical to the sighted
eval; only the pixels change. Blind generations land under
/vol/phaseb/eval_blind/<label>__<variant>/, disjoint from the sighted
/vol/phaseb/eval/<label>/ outputs the B2/R4/R5 records were scored from.
`--score --no-image ...` scores sighted and blind with the one scorer and
writes the doc-paired sighted-blind gain (raw score and content_edit_sim,
overall + per family, bootstrap CIs) to validation/blind_control.json.

The train/eval manifests (gold markdown inline; ~2.5 MB) are rebuilt locally
and re-uploaded to /vol/corpus/phaseb_{train,eval}.jsonl on every --smoke/
--train run — content is deterministic, so the upload is idempotent.

GPU: A100-80GB preferred, L40S fallback (override with PHASEB_GPU in the
local environment). bf16 is fine here — this is training/generation, not the
probe pass's fp32 feature-parity regime.
"""

from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path

import modal

APP_NAME = "encoder-anatomy-phaseb"
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"  # same mount path as the pilot + trainers -> cache hits
GPU = [g for g in os.environ.get("PHASEB_GPU", "A100-80GB,L40S").split(",") if g]

app = modal.App(APP_NAME)

data_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

CHECKPOINT = "Qwen/Qwen3.5-4B"  # same checkpoint as modal_extract.extract_decoder_mid

TRAIN_MANIFEST = "phaseb_train.jsonl"  # under /vol/corpus
EVAL_MANIFEST = "phaseb_eval.jsonl"
PHASEB_ROOT = "phaseb"  # under /vol

SEQ_CAP = 12288  # prompt + image + gold tokens; overlong docs drop-and-count
N_VAL_DOCS = 40
VAL_SEED = 0
EPOCHS = 2
GRAD_ACCUM = 8
MAX_NEW_TOKENS = 4096
LR_GRID = {"A": (3e-5, 1e-4, 3e-4), "B": (1e-4, 3e-4, 1e-3)}
R4_ARMS = ("R4a", "R4b")
R4_LR = 3e-4  # fixed: arm A's val-loss winner (docs/experiments.md §R4)
LAM_GRID = (0.1, 1.0)
SMOKE_LAM = 1.0
GLYPH_SIDECAR = "phaseb_glyphs.json"  # under /vol/corpus, next to the manifests
R5_ARMS = ("R5j", "R5b")  # joint (merger + decoder LoRA r16) / bridge-only (§R5)
R5_LR = R4_LR  # one lr for merger AND LoRA — pre-registered, no fan
R5_LAM = 1.0  # glyph aux weight, fixed: R4a's lam=1 recipe
R5_LORA_RANK = 16
GLYPH_AUX_ARMS = ("R4a", *R5_ARMS)  # arms whose aux is the glyph-probe head
CORPUS_TAGS = {"pilot": "700", "r5": "5k"}  # --train-corpus -> checkpoint-dir key
# eval may additionally target frozen snapshots of a trained cell (§R5's
# 1-epoch R5b_5k_ep1); those dirs carry weights but no train_stats.json, so
# they are reachable only via an explicit --eval-lrs pin, never the auto-pick
EVAL_CORPUS_TAGS = (*CORPUS_TAGS.values(), "5k_ep1")
BLIND_VARIANTS = ("withheld", "blank")  # --no-image values
BLIND_ROOT = "eval_blind"  # under /vol/phaseb — disjoint from eval/
R5_CORPUS_DIR = "corpus_r5"  # under /vol; built by the §R5 corpus job, read-only here
R5_IMAGES = "images_r5_modal.jsonl"
R5_PROBES = "probes_r5.jsonl"
SMOKE_LR = {"A": 1e-4, "B": 3e-4, "R4a": R4_LR, "R4b": R4_LR, "R5j": R5_LR}
SMOKE_DOCS = 20
SMOKE_VAL_DOCS = 5
SMOKE_MICRO_STEPS = 30

LORA_RANKS = (1, 2, 4, 8, 16, 32, 64, 128, 256)
LORA_TARGET_SUFFIXES = ("q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj")
LORA_MATCH_MAX_RATIO = 2.0  # pre-registered: |trainable(B)/trainable(A)| <= 2

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=5.14,<5.15",  # same pin as modal_extract.py / modal_frontier.py
        "accelerate",
        "peft>=0.14",
        "safetensors",
        "pillow",
        "numpy",
        "tqdm",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments", "modal_frontier")
)


# --------------------------------------------------------------------------- #
# pure parts (locally testable)
# --------------------------------------------------------------------------- #

def build_manifests(
    dataset_root: Path,
    images_subpath: str = "images_modal.jsonl",
    train_frac: float = 0.8,
    split_seed: int = 0,
    n_val_docs: int = N_VAL_DOCS,
    val_seed: int = VAL_SEED,
) -> dict:
    """The B2 data contract, built from the local pilot_1k corpus.

    Split = probe_fit.doc_is_train over the 1000 clean docs (identical to
    exp2a/reconstruction: seed 0, train_frac 0.8 -> 789/211). Gold =
    frontier_score.load_gold (expected_markdown, else the .gold.md/.md
    sidecar) — train docs whose gold does not resolve are dropped and listed.
    Val = n_val_docs sampled (random.Random(val_seed)) from the sorted usable
    train docs; their rows carry split="val" and never enter training batches.

    Returns {"train_rows", "eval_rows", "counts"}; row image_path is relative
    to /vol/corpus (copied from images_modal.jsonl, which is the volume's own
    manifest).
    """
    from encoder_experiments.frontier_score import load_gold
    from encoder_experiments.probe_fit import doc_is_train

    rows = [json.loads(line) for line in (dataset_root / images_subpath).read_text().splitlines()
            if line.strip()]
    clean = sorted((r for r in rows if r.get("scan_severity") == 0),
                   key=lambda r: r["image_id"])
    assert len({r["doc_id"] for r in clean}) == len(clean), "clean rows must be 1 page/doc"

    train_docs = {r["doc_id"] for r in clean if doc_is_train(r["doc_id"], train_frac, split_seed)}
    train_rows: list[dict] = []
    eval_rows: list[dict] = []
    no_gold: list[str] = []
    for r in clean:
        base = {"image_id": r["image_id"], "image_path": r["image_path"],
                "doc_id": r["doc_id"], "generator": r["generator"]}
        if r["doc_id"] not in train_docs:
            eval_rows.append(base)
            continue
        try:
            gold = load_gold(dataset_root, r["generator"], r["doc_id"])
        except FileNotFoundError:
            no_gold.append(r["doc_id"])
            continue
        if not gold.markdown:
            no_gold.append(r["doc_id"])
            continue
        train_rows.append({**base, "split": "train", "gold_markdown": gold.markdown})

    usable_docs = sorted(r["doc_id"] for r in train_rows)
    val_docs = set(random.Random(val_seed).sample(usable_docs, n_val_docs))
    for r in train_rows:
        if r["doc_id"] in val_docs:
            r["split"] = "val"

    counts = {
        "n_clean_docs": len(clean),
        "n_train_docs": len(train_docs),
        "n_eval_docs": len(clean) - len(train_docs),
        "n_train_usable": sum(r["split"] == "train" for r in train_rows),
        "n_val": sum(r["split"] == "val" for r in train_rows),
        "n_train_no_gold": len(no_gold),
        "train_no_gold_docs": sorted(no_gold),
        "split": {"train_frac": train_frac, "seed": split_seed, "unit": "document"},
        "val": {"n_docs": n_val_docs, "seed": val_seed},
    }
    return {"train_rows": train_rows, "eval_rows": eval_rows, "counts": counts}


def build_r5_manifest(
    corpus_root: Path,
    images_name: str = R5_IMAGES,
    n_val_docs: int = N_VAL_DOCS,
    val_seed: int = VAL_SEED,
) -> dict:
    """The §R5 train-corpus contract, read from <corpus_root>/images_r5_modal
    .jsonl (single-page docs; image_path relative to corpus_root). Gold =
    inline `gold_markdown`, else the row's `gold_path` sidecar read relative
    to corpus_root; rows with neither (or empty gold) are dropped and listed.
    Val = n_val_docs sampled (random.Random(val_seed)) from the sorted usable
    doc_ids — build_manifests' slice, verbatim, on the r5 corpus. TRAIN ONLY:
    eval stays the pilot 211 held-out docs for every arm, so no eval rows are
    built here. -> {"train_rows", "counts"}; deterministic for a fixed corpus
    (tests/test_phaseb_r5.py pins content + the val slice)."""
    rows = [json.loads(line)
            for line in (corpus_root / images_name).read_text().splitlines()
            if line.strip()]
    rows.sort(key=lambda r: r["image_id"])
    assert len({r["image_id"] for r in rows}) == len(rows), "duplicate r5 image_ids"
    assert len({r["doc_id"] for r in rows}) == len(rows), "r5 rows must be 1 page/doc"

    train_rows: list[dict] = []
    no_gold: list[str] = []
    for r in rows:
        gold = r.get("gold_markdown", "")
        if not gold and r.get("gold_path"):
            gold_file = corpus_root / r["gold_path"]
            gold = gold_file.read_text(encoding="utf-8") if gold_file.exists() else ""
        if not gold:
            no_gold.append(r["doc_id"])
            continue
        train_rows.append({"image_id": r["image_id"], "image_path": r["image_path"],
                           "doc_id": r["doc_id"], "generator": r.get("generator", ""),
                           "split": "train", "gold_markdown": gold})

    usable_docs = sorted(r["doc_id"] for r in train_rows)
    val_docs = set(random.Random(val_seed).sample(usable_docs, n_val_docs))
    for r in train_rows:
        if r["doc_id"] in val_docs:
            r["split"] = "val"

    counts = {
        "corpus": "r5",
        "n_docs": len(rows),
        "n_train_usable": sum(r["split"] == "train" for r in train_rows),
        "n_val": sum(r["split"] == "val" for r in train_rows),
        "n_no_gold": len(no_gold),
        "no_gold_docs": sorted(no_gold),
        "val": {"n_docs": n_val_docs, "seed": val_seed},
    }
    return {"train_rows": train_rows, "counts": counts}


def certify_joint_trainable(named_params, merger_param_ids: set[int]) -> dict:
    """R5j trainable-set certification: every trainable param must be either
    the merger's or a decoder-LoRA matrix, and BOTH halves must be present.
    A stray trainable (encoder, embeddings, lm head) or a missing half is a
    hard error — never a silently different experiment. -> separate counts
    {"merger_params", "lora_params"} (reported separately by contract; the
    joint arm is deliberately not param-matched)."""
    merger_n = lora_n = 0
    stray: list[str] = []
    for name, p in named_params:
        if not p.requires_grad:
            continue
        if id(p) in merger_param_ids:
            merger_n += p.numel()
        elif "lora_" in name:
            lora_n += p.numel()
        else:
            stray.append(name)
    if stray:
        raise ValueError(f"R5j stray trainable params (encoder/decoder body must "
                         f"stay frozen): {sorted(stray)[:5]}")
    if not (merger_n and lora_n):
        raise ValueError(f"R5j needs both halves in the optimizer: "
                         f"merger={merger_n}, lora={lora_n}")
    return {"merger_params": merger_n, "lora_params": lora_n}


def build_training_ids(
    prefix_ids: list[int], gold_ids: list[int], eos_id: int, cap: int = SEQ_CAP
) -> tuple[list[int], list[int]] | None:
    """(input_ids, labels) with the prompt+image prefix masked to -100 and
    loss on gold + eos only. None when the total exceeds cap (drop-and-count)."""
    total = len(prefix_ids) + len(gold_ids) + 1
    if total > cap:
        return None
    input_ids = list(prefix_ids) + list(gold_ids) + [eos_id]
    labels = [-100] * len(prefix_ids) + list(gold_ids) + [eos_id]
    return input_ids, labels


def lora_param_count(shapes: list[tuple[int, int]], rank: int) -> int:
    """Trainable params of rank-r LoRA over Linear(in, out) targets:
    A [r, in] + B [out, r] per target."""
    return sum(rank * (i + o) for i, o in shapes)


def pick_lora_rank(
    bridge_params: int,
    shapes: list[tuple[int, int]],
    ranks: tuple[int, ...] = LORA_RANKS,
    max_ratio: float = LORA_MATCH_MAX_RATIO,
) -> tuple[int, int]:
    """Rank whose LoRA param count is closest to bridge_params in log space.

    -> (rank, count). Raises when no rank lands within max_ratio — the arms
    would not be capacity-comparable and the run must not silently proceed.
    """
    if bridge_params <= 0 or not shapes:
        raise ValueError(f"need bridge_params > 0 and targets, got {bridge_params}, {len(shapes)}")
    best = min(ranks, key=lambda r: abs(math.log(lora_param_count(shapes, r) / bridge_params)))
    count = lora_param_count(shapes, best)
    ratio = max(count / bridge_params, bridge_params / count)
    if ratio > max_ratio:
        raise ValueError(
            f"no LoRA rank in {ranks} matches bridge count {bridge_params} within "
            f"{max_ratio}x (closest: r={best} -> {count}, ratio {ratio:.2f})"
        )
    return best, count


def bootstrap_contrast(
    pairs: list[tuple[float, float]], n_boot: int = 2000, seed: int = 0
) -> dict:
    """Doc-paired mean difference a-b with a percentile bootstrap CI over docs."""
    import numpy as np

    a = np.asarray([p[0] for p in pairs], dtype=np.float64)
    b = np.asarray([p[1] for p in pairs], dtype=np.float64)
    diff = a - b
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(diff), size=(n_boot, len(diff)))
    boots = diff[idx].mean(axis=1)
    return {
        "n_docs": int(len(diff)),
        "mean_diff": round(float(diff.mean()), 6),
        "ci95_lo": round(float(np.quantile(boots, 0.025)), 6),
        "ci95_hi": round(float(np.quantile(boots, 0.975)), 6),
    }


def contrast_block(
    scores_a: dict[str, dict], scores_b: dict[str, dict], n_boot: int = 2000,
    seed: int = 0, key: str = "score",
) -> dict:
    """Overall + per-family contrasts from two {image_id: scores.jsonl record}
    maps (frontier_score output). Only docs scored in BOTH arms pair up; with a
    non-default ``key`` (e.g. ``content_edit_sim``), only docs carrying that
    field in both arms."""
    common = sorted(i for i in set(scores_a) & set(scores_b)
                    if key in scores_a[i] and key in scores_b[i])
    out = {"overall": bootstrap_contrast(
        [(scores_a[i][key], scores_b[i][key]) for i in common],
        n_boot=n_boot, seed=seed,
    )}
    fams = sorted({scores_a[i]["family"] for i in common})
    out["families"] = {
        fam: bootstrap_contrast(
            [(scores_a[i][key], scores_b[i][key])
             for i in common if scores_a[i]["family"] == fam],
            n_boot=n_boot, seed=seed,
        )
        for fam in fams
    }
    return out


def build_glyph_sidecar(probes_path: Path, train_image_ids: set[str]) -> dict:
    """R4a supervision, built once locally and uploaded next to the train
    manifest: per-train-image glyph rows from probes.jsonl (probe=glyph_id).

    vocab = sorted unique glyph labels over the WHOLE corpus (train + eval
    docs), so head class indices are split-independent and deterministic;
    `images` keeps only train-manifest image_ids, points/labels in probes
    file order, labels re-coded as vocab indices. Same probes file -> byte-
    identical sidecar; row order can only permute per-image point order,
    never the vocab (tests/test_phaseb_r4.py pins both).
    """
    vocab_set: set = set()
    images: dict[str, dict] = {}
    with open(probes_path) as f:
        for line in f:
            if '"glyph_id"' not in line:  # cheap prefilter; membership re-checked below
                continue
            row = json.loads(line)
            if row["probe"] != "glyph_id":
                continue
            vocab_set.add(row["label"])
            if row["image_id"] not in train_image_ids:
                continue
            rec = images.setdefault(row["image_id"], {"points": [], "labels": []})
            rec["points"].append([float(row["point_xy"][0]), float(row["point_xy"][1])])
            rec["labels"].append(row["label"])
    vocab = sorted(vocab_set)
    code = {lab: i for i, lab in enumerate(vocab)}
    for rec in images.values():
        rec["labels"] = [code[lab] for lab in rec["labels"]]
    return {"vocab": vocab, "n_classes": len(vocab), "images": dict(sorted(images.items()))}


def bilinear_readout(tokens, grid_hw: tuple[int, int], points_xy):
    """sites.features_at's exact convention — patch centers at ((j+.5)/W,
    (i+.5)/H), align_corners=False, zeros outside the grid — in explicit
    gather math so the read is dtype-flexible (bf16 merger captures) and
    stays inside autograd for the R4a aux loss. tokens [N, D], points_xy
    [K, 2] normalized (x, y) -> [K, D] float32. Parity with features_at and
    a numpy reference is pinned at 1e-5 in tests/test_phaseb_r4.py.
    """
    import torch

    h, w = grid_hw
    if tokens.shape[0] != h * w:
        raise ValueError(f"{tokens.shape[0]} tokens cannot fill a {h}x{w} grid")
    flat = tokens.reshape(h * w, -1).float()
    pts = points_xy.to(device=flat.device, dtype=torch.float32)
    fx, fy = pts[:, 0] * w - 0.5, pts[:, 1] * h - 0.5
    x0, y0 = fx.floor(), fy.floor()
    wx, wy = fx - x0, fy - y0
    out = flat.new_zeros(pts.shape[0], flat.shape[1])
    for dy in (0, 1):
        for dx in (0, 1):
            xi, yi = x0.long() + dx, y0.long() + dy
            wgt = (wx if dx else 1.0 - wx) * (wy if dy else 1.0 - wy)
            inside = ((xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)).float()
            idx = yi.clamp(0, h - 1) * w + xi.clamp(0, w - 1)
            out = out + (wgt * inside).unsqueeze(1) * flat[idx]
    return out


def normalized_mse(pred, target, eps: float = 1e-6):
    """R4b aux: MSE with each target dim standardized by its (detached) batch
    std, so a mean predictor scores ~1.0 at any feature scale and lam is
    scale-comparable to CE. The floor is RELATIVE (5% of the mean std + eps):
    near-constant dims stop amplifying noise, and the loss stays exactly
    invariant under a common rescale of pred+target."""
    pred, target = pred.float(), target.float()
    std = target.std(dim=0, unbiased=False)
    std = std.clamp_min(0.05 * std.mean() + eps).detach()
    return (((pred - target) / std) ** 2).mean()


def percell_target(premerge, n_out: int, m2: int):
    """Merger input -> R4b regression target [n_out, m2*D_pre]: each output
    token's m2 pre-merge children concatenated in the merger's own view
    order (flat input rows m2*i .. m2*i+m2-1 ARE output row i's cell — the
    lineage's block-major pre-merge layout, qwen_vit._to_row_major's pinned
    convention). Accepts the per-cell [n_out, m2, D_pre] form too; any other
    factorization is a hard error, never a silent reshape."""
    if premerge.dim() == 3:
        n, m, d = premerge.shape
        if (n, m) != (n_out, m2):
            raise ValueError(
                f"per-cell merger input {tuple(premerge.shape)} != [{n_out}, {m2}, D_pre]"
            )
        return premerge.reshape(n_out, m2 * d)
    if premerge.dim() == 2 and premerge.shape[0] == n_out * m2:
        return premerge.reshape(n_out, m2 * premerge.shape[1])
    raise ValueError(
        f"merger input {tuple(premerge.shape)} does not factor into "
        f"{n_out} cells x {m2} patches"
    )


def _fmt_lr(lr: float) -> str:
    return f"{lr:g}"


def _fmt_knob(knob: float | str) -> str:
    return knob if isinstance(knob, str) else _fmt_lr(knob)


def arm_dir(arm: str, knob: float | str, smoke: bool = False) -> str:
    """Relative (to /vol) checkpoint dir: phaseb/[smoke/]<arm>_<knob>.

    The knob is the arm's fan axis — lr for A/B, lam for R4 arms (whose lr
    is fixed at R4_LR), corpus tag (700|5k) for R5 arms (lr AND lam fixed).
    The arm name prefixes the dir, so R4/R5 dirs can never collide with
    A_/B_ ones or each other (pinned in tests/test_phaseb_r{4,5}.py)."""
    root = f"{PHASEB_ROOT}/smoke" if smoke else PHASEB_ROOT
    return f"{root}/{arm}_{_fmt_knob(knob)}"


def arm_label(arm: str, knob: float | str) -> str:
    """Eval/score identity: bare arm for A/B/C (one eval'd checkpoint each),
    arm_<lam> for R4 arms (both lams are adjudication readouts), arm_<corpus>
    for R5 arms (each 2x2 cell is its own readout)."""
    return f"{arm}_{_fmt_knob(knob)}" if arm in (*R4_ARMS, *R5_ARMS) else arm


def stats_label(stats: dict) -> str:
    """arm_label of a train_stats.json record."""
    if stats["arm"] in R5_ARMS:
        knob = stats["corpus_tag"]
    elif stats["arm"] in R4_ARMS:
        knob = stats["lam"]
    else:
        knob = stats["lr"]
    return arm_label(stats["arm"], knob)


def check_blind(blind: str) -> str:
    """Validate a --no-image variant ("" = sighted). An unknown value is a
    hard error: a typo must never fall through to a sighted generation that
    then lands under a blind label."""
    if blind and blind not in BLIND_VARIANTS:
        raise ValueError(f"--no-image takes {list(BLIND_VARIANTS)}, got {blind!r}")
    return blind


def blind_variants(spec: str) -> list[str]:
    """--no-image value -> variant list in BLIND_VARIANTS order ("all" = every
    variant, "" = sighted, i.e. no blind run). Deduplicated, so repeating a
    variant cannot double-spawn its generation jobs."""
    if not spec.strip():
        return []
    if spec.strip() == "all":
        return list(BLIND_VARIANTS)
    picked = {check_blind(p.strip()) for p in spec.split(",") if p.strip()}
    if not picked:
        raise ValueError(f"--no-image got no variant in {spec!r}")
    return [v for v in BLIND_VARIANTS if v in picked]


def eval_label(arm: str, knob: float | str, blind: str = "") -> str:
    """Generation identity: arm_label for the sighted eval, suffixed
    <label>__<variant> for a blind one."""
    return f"{arm_label(arm, knob)}__{check_blind(blind)}" if blind else arm_label(arm, knob)


def eval_dir(arm: str, knob: float | str, blind: str = "", smoke: bool = False) -> str:
    """Relative (to /vol) generation dir. Blind runs live under a separate
    phaseb/eval_blind/ root AND carry a suffixed label, so they can neither
    overwrite nor be mistaken for the sighted phaseb/eval/<label>/ outputs the
    B2/R4/R5 records were scored from."""
    root = f"{PHASEB_ROOT}/smoke" if smoke else PHASEB_ROOT
    sub = BLIND_ROOT if check_blind(blind) else "eval"
    return f"{root}/{sub}/{eval_label(arm, knob, blind)}"


def blind_messages(prompt: str, blind: str = "") -> list[dict]:
    """Chat messages for one variant. `withheld` drops the image part entirely
    (no image tokens reach the decoder); `blank` and sighted share the SAME
    message list — that variant changes pixels, not the token span. The prompt
    string is identical in all three by construction."""
    check_blind(blind)
    content: list[dict] = [{"type": "text", "text": prompt}]
    if blind != "withheld":
        content.insert(0, {"type": "image"})
    return [{"role": "user", "content": content}]


def blind_image(img, blind: str = ""):
    """Pixels handed to the processor: a white page of the SAME size for
    `blank` (identical image-token span, no information), the page itself
    otherwise. `withheld` passes no image at all and must not reach here."""
    if check_blind(blind) == "withheld":
        raise ValueError("the withheld variant passes no image to the processor")
    if blind == "blank":
        from PIL import Image

        return Image.new("RGB", img.size, (255, 255, 255))
    return img


def gain_block(
    sighted: dict[str, dict], blind: dict[str, dict],
    keys: tuple[str, ...] = ("score", "content_edit_sim"),
    n_boot: int = 2000, seed: int = 0,
) -> dict:
    """Doc-paired sighted-blind gain per metric: contrast_block for each key
    (overall + per family). Positive = the image helped."""
    return {k: contrast_block(sighted, blind, n_boot=n_boot, seed=seed, key=k) for k in keys}


def summary_mean(summary: dict, slice_: str, metric: str) -> float | None:
    """One cell of a frontier_score summary: `slice_` is "overall" or a family
    name, `metric` is "score" (the family's primary) or "content_edit_sim".
    None when the slice carries no such readout (chart docs have no gold
    markdown, so charts have no content_edit_sim)."""
    block = summary["overall"] if slice_ == "overall" else summary["families"].get(slice_)
    if block is None:
        return None
    if metric == "score":
        return block.get("mean")
    if slice_ == "overall":
        return summary.get("content_edit_sim", {}).get("mean")
    return block.get(metric, {}).get("mean")


def blind_table(bundle: dict, metric: str = "score") -> str:
    """Markdown table of one blind_control bundle metric: a row per (arm,
    slice) with the sighted mean, each variant's blind mean and the doc-paired
    gain + 95% CI. Slices are overall then FAMILY_ORDER; cells with no readout
    for the metric print as an em dash."""
    from encoder_experiments.frontier_score import FAMILY_ORDER

    variants = list(bundle["variants"])
    head = ["arm", "slice", "sighted"]
    for v in variants:
        head += [v, f"gain vs {v} [95% CI]"]
    lines = ["| " + " | ".join(head) + " |",
             "|" + "|".join(["---"] * len(head)) + "|"]

    def fmt(x):
        return "—" if x is None else f"{x:.4f}"

    for arm, blocks in bundle["arms"].items():
        sighted_sum = blocks["sighted"]["summary"]
        fams = [f for f in FAMILY_ORDER if f in sighted_sum["families"]]
        for slice_ in ("overall", *fams):
            row = [arm, slice_, fmt(summary_mean(sighted_sum, slice_, metric))]
            for v in variants:
                blind = blocks[v]
                row.append(fmt(summary_mean(blind["summary"], slice_, metric)))
                g = blind["gain"][metric]
                cell = g["overall"] if slice_ == "overall" else g["families"].get(slice_)
                row.append("—" if cell is None else
                           f"{cell['mean_diff']:+.4f} [{cell['ci95_lo']:+.4f}, "
                           f"{cell['ci95_hi']:+.4f}] (n={cell['n_docs']})")
            lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# remote helpers (image-side imports only)
# --------------------------------------------------------------------------- #

def _load_model_and_processor(checkpoint: str, device):
    """Same trust_remote_code loading as modal_extract.extract_decoder_mid,
    but through the head-bearing Auto classes — B2 needs logits (masked CE)
    and .generate(), which the bare AutoModel base lacks. Ladder:
    ImageTextToText -> CausalLM, hard error if neither yields logits+generate.
    Keeps extract_decoder_mid's DeepStack guard: plural bridges would make
    "the merger" ill-defined for arm A.
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor

    try:
        from transformers import AutoModelForImageTextToText
    except ImportError:
        AutoModelForImageTextToText = None

    processor = AutoProcessor.from_pretrained(checkpoint, trust_remote_code=True)
    model = None
    errors = []
    for cls in (AutoModelForImageTextToText, AutoModelForCausalLM):
        if cls is None:
            continue
        try:
            model = cls.from_pretrained(
                checkpoint, trust_remote_code=True, torch_dtype=torch.bfloat16
            )
            break
        except Exception as exc:  # noqa: BLE001 — try the next head class
            errors.append(f"{cls.__name__}: {type(exc).__name__}: {exc}")
    if model is None:
        raise RuntimeError(f"{checkpoint}: no head-bearing Auto class loaded it: {errors}")
    if not callable(getattr(model, "generate", None)):
        raise RuntimeError(f"{checkpoint}: {type(model).__name__} has no generate()")

    deepstack = list(getattr(model.config.vision_config, "deepstack_visual_indexes", []) or [])
    if deepstack:
        raise RuntimeError(
            f"{checkpoint}: deepstack_visual_indexes={deepstack} — plural bridges; "
            "arm A's single-merger contract does not cover DeepStack paths"
        )
    return model.to(device), processor


def _find_merger(model):
    """The bridge module, located the way Qwen35Vit._install_premerge_capture
    locates it: the vision tower under one of _VISUAL_ATTRS, then its
    `merger` attribute. -> (merger, visual_prefix). Hard error when absent —
    arm A has nothing to train without it."""
    from encoder_experiments.adapters.qwen_vit import _VISUAL_ATTRS, _resolve_attr

    for attr in _VISUAL_ATTRS:
        visual = _resolve_attr(model, attr)
        if visual is not None:
            merger = getattr(visual, "merger", None)
            if merger is None:
                raise RuntimeError(
                    f"{CHECKPOINT}: vision tower at {attr!r} has no `merger` module; "
                    f"children: {[n for n, _ in visual.named_children()]}"
                )
            return merger, attr
    raise RuntimeError(f"{CHECKPOINT}: no vision tower under any of {_VISUAL_ATTRS}")


def _token_ce(logits, labels):
    """Next-token CE over labels != -100 (batch 1). Masks BEFORE the fp32
    upcast so only gold-position logits are ever materialized in fp32."""
    import torch.nn.functional as F

    lg, lb = logits[0, :-1], labels[0, 1:]
    mask = lb != -100
    return F.cross_entropy(lg[mask].float(), lb[mask], reduction="mean")


class _MergerTap:
    """Live capture of one forward through the merger, autograd preserved:
    hooks hand back the graph tensors themselves (no detach/copy), so aux
    losses built on .inp/.out backprop into the trainable merger. .inp = the
    floating-point tensor the merger receives (pre-merge patches), .out =
    what it returns (merged tokens). Exactly one float input tensor and a
    plain tensor return are asserted — a release that breaks either breaks
    loudly, never trains on the wrong capture."""

    def __init__(self, merger):
        self.inp = self.out = None
        self.handles = [
            merger.register_forward_pre_hook(self._pre, with_kwargs=True),
            merger.register_forward_hook(self._post),
        ]

    def clear(self):
        self.inp = self.out = None

    def _pre(self, _mod, args, kwargs):
        import torch

        floats = [t for t in (*args, *kwargs.values())
                  if isinstance(t, torch.Tensor) and t.is_floating_point()]
        assert len(floats) == 1, (
            f"merger got {len(floats)} float tensor inputs "
            f"{[tuple(t.shape) for t in floats]}; the R4 capture needs exactly one"
        )
        self.inp = floats[0]

    def _post(self, _mod, _args, out):
        import torch

        assert isinstance(out, torch.Tensor), (
            f"merger returned {type(out).__name__}, not a tensor — R4 capture "
            "does not know which member is the merged-token stream"
        )
        self.out = out[0] if out.dim() == 3 and out.shape[0] == 1 else out
        assert self.out.dim() == 2, f"merged tokens must be [N, D], got {tuple(out.shape)}"


def _frozen_fingerprint(model, n_probes: int = 64):
    """Deterministic sample of frozen-param sums; exact-equality check after
    step 0 certifies the optimizer touched nothing frozen."""
    frozen = [(n, p) for n, p in sorted(model.named_parameters()) if not p.requires_grad]
    step = max(1, len(frozen) // n_probes)
    return [(n, float(p.detach().float().sum().item())) for n, p in frozen[::step]]


# --------------------------------------------------------------------------- #
# training
# --------------------------------------------------------------------------- #

@app.function(
    image=image,
    gpu=GPU,
    timeout=3600 * 24,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def train_arm(
    arm: str,
    lr: float,
    lam: float = 0.0,
    train_corpus: str = "pilot",
    smoke: bool = False,
    epochs: int = EPOCHS,
    grad_accum: int = GRAD_ACCUM,
    seq_cap: int = SEQ_CAP,
    seed: int = 0,
) -> dict:
    """One (arm, knob) training run -> /vol/phaseb/[smoke/]<arm>_<knob>/
    (bridge.safetensors or adapter/, saved at every val improvement, +
    train_stats.json; knob = lr for A/B, lam for R4, corpus tag for R5). Arm
    A trains the merger only; arm B trains decoder LoRA rank-matched to the
    merger count within 2x; R4/R5 arms train the merger + a jointly-optimized
    aux head whose loss (lam-weighted) is added to the LM CE — the head is
    saved separately (aux_head.safetensors) and is NOT part of the bridge
    deliverable. R5b is the R4a recipe on the chosen corpus; R5j additionally
    puts decoder LoRA r16 in the optimizer (adapter/ saved next to the
    bridge; both are needed for generation). train_corpus=r5 reads
    /vol/corpus_r5 remotely (manifest + glyph sidecar built in-process,
    deterministic); R5 arms only. All arms freeze everything else —
    encoder always — and hard-assert it at step 0."""
    import time

    import torch
    import torch.nn.functional as F
    from PIL import Image
    from safetensors.torch import save_file

    from modal_frontier import QWEN_PROMPT

    is_r4 = arm in R4_ARMS
    is_r5 = arm in R5_ARMS
    is_aux = is_r4 or is_r5
    is_glyph = arm in GLYPH_AUX_ARMS
    assert arm in ("A", "B") or is_aux, (
        f"train_arm takes A, B, R4a, R4b, R5j or R5b, got {arm!r}"
    )
    assert (lam > 0) == is_aux, f"lam is the aux knob: arm {arm} got lam={lam}"
    assert train_corpus in CORPUS_TAGS, f"unknown train_corpus {train_corpus!r}"
    assert is_r5 or train_corpus == "pilot", (
        f"arm {arm} is pilot-only; --train-corpus r5 takes R5 arms"
    )
    corpus_tag = CORPUS_TAGS[train_corpus]
    data_volume.reload()

    r5_counts = None
    if train_corpus == "r5":
        corpus = Path(VOL_PATH) / R5_CORPUS_DIR
        if not (corpus / R5_IMAGES).exists():
            raise FileNotFoundError(
                f"{corpus / R5_IMAGES} not found — the §R5 corpus job must land first"
            )
        r5 = build_r5_manifest(corpus)
        rows, r5_counts = r5["train_rows"], r5["counts"]
        print(f"[phaseb] r5 corpus: {json.dumps({k: v for k, v in r5_counts.items() if k != 'no_gold_docs'})}")
    else:
        corpus = Path(VOL_PATH) / "corpus"
        manifest = corpus / TRAIN_MANIFEST
        if not manifest.exists():
            raise FileNotFoundError(f"{manifest} not found — run --plan/--train locally first")
        rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    train_rows = [r for r in rows if r["split"] == "train"]
    val_rows = [r for r in rows if r["split"] == "val"]

    glyphs = n_glyph_classes = None
    if is_glyph:
        if train_corpus == "r5":
            probes_path = corpus / R5_PROBES
            if not probes_path.exists():
                raise FileNotFoundError(
                    f"{probes_path} not found — the §R5 corpus job must land first"
                )
            sidecar = build_glyph_sidecar(probes_path, {r["image_id"] for r in rows})
        else:
            sidecar_path = corpus / GLYPH_SIDECAR
            if not sidecar_path.exists():
                raise FileNotFoundError(f"{sidecar_path} not found — run --plan/--train locally first")
            sidecar = json.loads(sidecar_path.read_text())
        glyphs, n_glyph_classes = sidecar["images"], sidecar["n_classes"]

    if smoke:
        if is_glyph:
            # the plain [:SMOKE_DOCS] head of the sorted manifest is all
            # chart docs with zero glyph rows; R4a's smoke must exercise the
            # aux path, so slice the first glyph-covered docs instead
            train_rows = [r for r in train_rows if r["image_id"] in glyphs][:SMOKE_DOCS]
            val_rows = [r for r in val_rows if r["image_id"] in glyphs][:SMOKE_VAL_DOCS]
        else:
            train_rows = train_rows[:SMOKE_DOCS]
            val_rows = val_rows[:SMOKE_VAL_DOCS]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(seed)
    t0 = time.monotonic()
    model, processor = _load_model_and_processor(CHECKPOINT, device)
    load_s = time.monotonic() - t0
    tokenizer = processor.tokenizer
    eos_id = tokenizer.eos_token_id
    assert eos_id is not None, f"{CHECKPOINT}: tokenizer has no eos_token_id"

    merger, visual_prefix = _find_merger(model)
    bridge_params = sum(p.numel() for p in merger.parameters())
    # merge size resolved pre-wrap: peft's attr forwarding would obscure the
    # dotted visual path for R5j (only the aux grid math uses it)
    from encoder_experiments.adapters.qwen_vit import _resolve_attr

    visual = _resolve_attr(model, visual_prefix)
    merge = int(getattr(visual, "spatial_merge_size", None)
                or getattr(getattr(visual, "config", None), "spatial_merge_size", 2))
    del visual

    model.requires_grad_(False)
    lora_rank = None
    lora_params = None
    if arm in ("B", "R5j"):  # decoder LoRA joins the optimizer
        target_shapes: list[tuple[int, int]] = []
        target_names: list[str] = []
        for name, mod in model.named_modules():
            if name.startswith(visual_prefix + ".") or name == visual_prefix:
                continue
            if isinstance(mod, torch.nn.Linear) and name.rsplit(".", 1)[-1] in LORA_TARGET_SUFFIXES:
                target_names.append(name)
                target_shapes.append((mod.in_features, mod.out_features))
        if arm == "B":
            lora_rank, expected_count = pick_lora_rank(bridge_params, target_shapes)
        else:  # R5j: rank fixed at 16 by §R5 — deliberately NOT param-matched
            lora_rank = R5_LORA_RANK
            expected_count = lora_param_count(target_shapes, lora_rank)
        from peft import LoraConfig, get_peft_model

        model = get_peft_model(model, LoraConfig(
            r=lora_rank, lora_alpha=2 * lora_rank, lora_dropout=0.0,
            bias="none", target_modules=target_names,
        ))
    merger_ids = {id(p) for p in merger.parameters()}
    if arm != "B":  # A/R4/R5 train the merger (peft re-froze it, so after the wrap)
        merger.requires_grad_(True)
    if arm == "B":
        trainable = {n: p for n, p in model.named_parameters() if p.requires_grad}
        assert all("lora_" in n for n in trainable), sorted(trainable)[:5]
        actual = sum(p.numel() for p in trainable.values())
        assert actual == expected_count, (
            f"LoRA count mismatch: peft trainable {actual} != formula {expected_count}"
        )
    elif arm == "R5j":
        trainable = {n: p for n, p in model.named_parameters() if p.requires_grad}
        joint = certify_joint_trainable(model.named_parameters(), merger_ids)
        assert joint["merger_params"] == bridge_params, joint
        assert joint["lora_params"] == expected_count, (
            f"LoRA count mismatch: peft trainable {joint['lora_params']} != "
            f"formula {expected_count}"
        )
        lora_params = joint["lora_params"]
    else:
        trainable = {n: p for n, p in model.named_parameters() if id(p) in merger_ids}
    expected = set(trainable)

    trainable_params = sum(p.numel() for p in trainable.values())
    match_ratio = max(trainable_params / bridge_params, bridge_params / trainable_params)
    if arm != "R5j":  # the joint arm is not capacity-matched (§R5, by design)
        assert match_ratio <= LORA_MATCH_MAX_RATIO, (
            f"arm {arm}: trainable {trainable_params} vs bridge {bridge_params} "
            f"ratio {match_ratio:.2f} > {LORA_MATCH_MAX_RATIO}"
        )
    actual_names = {n for n, p in model.named_parameters() if p.requires_grad}
    assert actual_names == expected, (
        f"trainable set drifted: +{sorted(actual_names - expected)[:5]} "
        f"-{sorted(expected - actual_names)[:5]}"
    )
    print(f"[phaseb] arm {arm} lr={_fmt_lr(lr)}"
          f"{f' lam={_fmt_lr(lam)}' if is_aux else ''}"
          f"{f' corpus={train_corpus}({corpus_tag})' if is_r5 else ''}: "
          f"bridge_params={bridge_params:,} "
          f"trainable={trainable_params:,} (ratio {match_ratio:.2f}"
          f"{f', lora r={lora_rank}' if lora_rank else ''}) "
          f"train={len(train_rows)} val={len(val_rows)} docs")
    if arm == "R5j":
        print(f"[phaseb] R5j trainable halves (counted separately, not matched): "
              f"merger={bridge_params:,} lora={lora_params:,}")

    if hasattr(model, "gradient_checkpointing_enable"):
        model.gradient_checkpointing_enable(
            gradient_checkpointing_kwargs={"use_reentrant": False}
        )
    model.train()
    fingerprint0 = _frozen_fingerprint(model)

    messages = [{
        "role": "user",
        "content": [{"type": "image"}, {"type": "text", "text": QWEN_PROMPT}],
    }]
    prompt_text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    def encode_row(row):
        """-> (inputs on device, labels) or None (overlong, drop-and-count)."""
        img = Image.open(corpus / row["image_path"]).convert("RGB")
        inputs = processor(text=[prompt_text], images=[img], return_tensors="pt")
        prefix_len = int(inputs["input_ids"].shape[1])
        prefix_ids = inputs["input_ids"][0].tolist()
        gold_ids = tokenizer(row["gold_markdown"], add_special_tokens=False)["input_ids"]
        built = build_training_ids(prefix_ids, gold_ids, eos_id, cap=seq_cap)
        if built is None:
            return None
        input_ids, labels = built
        n_new = len(input_ids) - prefix_len
        inputs["input_ids"] = torch.tensor([input_ids])
        inputs["attention_mask"] = torch.ones(1, len(input_ids), dtype=torch.long)
        # every other per-position tensor must grow with the appended gold:
        # qwen3_5 M-RoPE reads mm_token_type_ids (text=0, image=1), so the
        # gold/eos extension is zeros. An unknown per-position key is a hard
        # error — silently leaving it short desyncs get_rope_index.
        for key, val in list(inputs.items()):
            if key in ("input_ids", "attention_mask") or not torch.is_tensor(val):
                continue
            if val.ndim == 2 and val.shape[0] == 1 and val.shape[1] == prefix_len:
                assert key == "mm_token_type_ids", f"unhandled per-position tensor {key!r}"
                inputs[key] = torch.cat([val, val.new_zeros(1, n_new)], dim=1)
        if "pixel_values" in inputs:
            inputs["pixel_values"] = inputs["pixel_values"].to(torch.bfloat16)
        return inputs.to(device), torch.tensor([labels], device=device)

    # ---- R4/R5: merger tap + jointly-trained aux head -------------------- #
    tap = aux_head = aux_kind = None
    aux_head_params = None
    if is_aux:
        tap = _MergerTap(merger)

        def merged_grid(inputs, out):
            """(h, w) of the merged token grid, asserted against the capture.
            Merged sequence order is raster over it: the lineage's pre-merge
            layout is block-major (h/m, w/m, m, m) — qwen_vit._to_row_major's
            pinned convention — so the merger's [N/m^2, m^2*D] view walks
            merged cells in raster order."""
            assert "image_grid_thw" in inputs, "processor emitted no image_grid_thw"
            t, h, w = (int(v) for v in inputs["image_grid_thw"][0])
            hm, wm = h // merge, w // merge
            assert t == 1 and out.shape[0] == hm * wm, (
                f"merger capture/grid mismatch: thw={(t, h, w)} merge={merge} "
                f"captured {tuple(out.shape)}"
            )
            return hm, wm

        # one no-grad probe forward pins the merger's I/O dims + factorization
        probe_enc = next((e for e in map(encode_row, train_rows) if e is not None), None)
        assert probe_enc is not None, "no under-cap train row to probe merger dims"
        model.eval()
        with torch.no_grad():
            model(**probe_enc[0])
        model.train()
        d_out = tap.out.shape[-1]
        if is_glyph:
            merged_grid(probe_enc[0], tap.out)
            aux_head = torch.nn.Linear(d_out, n_glyph_classes)
            aux_kind = "glyph_ce"
        else:
            target0 = percell_target(tap.inp, tap.out.shape[0], merge * merge)
            aux_head = torch.nn.Linear(d_out, target0.shape[1])
            aux_kind = "inverse_map_mse"
        aux_head = aux_head.to(device=device, dtype=torch.float32)
        aux_head.train()
        aux_head_params = sum(p.numel() for p in aux_head.parameters())
        tap.clear()
        del probe_enc
        print(f"[phaseb] {arm} aux head ({aux_kind}): "
              f"{d_out} -> {aux_head.out_features}, params={aux_head_params:,}; "
              f"optimizer = {'merger + decoder LoRA' if arm == 'R5j' else 'merger'} "
              f"{trainable_params:,} + aux head "
              f"{aux_head_params:,} (deliverable bridge.safetensors = merger only)")

        def aux_loss(row, inputs):
            """The lam-weighted aux term for one image, or None when it
            carries no supervision (glyph-aux doc without glyph rows)."""
            out = tap.out
            if is_glyph:
                g = glyphs.get(row["image_id"])
                if g is None:
                    return None
                grid_hw = merged_grid(inputs, out)
                feats = bilinear_readout(
                    out, grid_hw, torch.tensor(g["points"], dtype=torch.float32)
                )
                labels_t = torch.tensor(g["labels"], dtype=torch.long, device=feats.device)
                return F.cross_entropy(aux_head(feats), labels_t)
            target = percell_target(tap.inp, out.shape[0], merge * merge)
            return normalized_mse(aux_head(out.float()), target.detach())

    micro_total = epochs * len(train_rows)
    if smoke:
        micro_total = min(micro_total, SMOKE_MICRO_STEPS)
    optim_total = max(1, math.ceil(micro_total / grad_accum))
    optim_params = list(trainable.values()) + (list(aux_head.parameters()) if aux_head else [])
    optimizer = torch.optim.AdamW(optim_params, lr=lr, weight_decay=0.0)
    from transformers import get_cosine_schedule_with_warmup

    warmup = min(20, max(1, optim_total // 10))
    scheduler = get_cosine_schedule_with_warmup(optimizer, warmup, optim_total)

    knob = corpus_tag if is_r5 else lam if is_r4 else lr
    out_dir = Path(VOL_PATH) / arm_dir(arm, knob, smoke=smoke)
    out_dir.mkdir(parents=True, exist_ok=True)

    def save_weights():
        if arm == "B":
            model.save_pretrained(str(out_dir / "adapter"))
        else:
            save_file({k: v.detach().to("cpu", torch.float32) for k, v in
                       merger.state_dict().items()}, out_dir / "bridge.safetensors")
            if arm == "R5j":
                # the joint arm's decoder half: generation needs bridge AND
                # adapter; the b2 probe readout needs the bridge alone
                model.save_pretrained(str(out_dir / "adapter"))
            if aux_head is not None:
                # record only — NOT the deliverable; eval and the b2 probe
                # pipeline never load it
                save_file({k: v.detach().to("cpu", torch.float32) for k, v in
                           aux_head.state_dict().items()}, out_dir / "aux_head.safetensors")
        data_volume.commit()

    @torch.no_grad()
    def val_metrics():
        """-> (lm_ce, aux or None, total). total is the selection metric:
        the training objective lm + lam*aux for R4/R5, plain lm for A/B."""
        model.eval()
        lm_losses, aux_losses = [], []
        for row in val_rows:
            enc = encode_row(row)
            if enc is None:
                continue
            inputs, labels = enc
            if is_aux:
                tap.clear()
            lm_losses.append(float(_token_ce(model(**inputs).logits, labels).item()))
            if is_aux:
                a = aux_loss(row, inputs)
                if a is not None:
                    aux_losses.append(float(a.item()))
        model.train()
        lm = sum(lm_losses) / len(lm_losses) if lm_losses else float("nan")
        aux = sum(aux_losses) / len(aux_losses) if aux_losses else None
        total = lm + lam * aux if (is_aux and aux is not None) else lm
        return lm, aux, total

    dropped: set[str] = set()
    val_curve: list[dict] = []
    lm_ce_curve: list[float] = []
    aux_curve: list[float | None] = []  # None = no supervised image in the window
    win_lm: list[float] = []
    win_aux: list[float] = []
    n_no_aux = 0
    best_val = float("inf")
    micro = optim = 0
    frozen_checked = False
    rng = random.Random(seed)
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()
    t_train = time.monotonic()
    optimizer.zero_grad(set_to_none=True)

    for epoch in range(epochs):
        order = list(range(len(train_rows)))
        rng.shuffle(order)
        for i in order:
            if micro >= micro_total:
                break
            row = train_rows[i]
            if row["image_id"] in dropped:
                continue
            enc = encode_row(row)
            if enc is None:
                dropped.add(row["image_id"])
                continue
            inputs, labels = enc
            if is_aux:
                tap.clear()
            lm = _token_ce(model(**inputs).logits, labels)
            loss = lm
            aux = None
            if is_aux:
                assert tap.out is not None and tap.out.requires_grad, (
                    "merger capture is outside autograd (checkpointed or "
                    "no-grad forward) — the aux loss cannot shape the merger"
                )
                aux = aux_loss(row, inputs)
                if aux is None:
                    n_no_aux += 1
                else:
                    loss = lm + lam * aux
                    win_aux.append(float(aux.item()))
            win_lm.append(float(lm.item()))
            (loss / grad_accum).backward()
            micro += 1
            if micro % grad_accum == 0 or micro == micro_total:
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
                optim += 1
                lm_ce_curve.append(round(sum(win_lm) / len(win_lm), 6))
                win_lm = []
                if is_aux:
                    aux_curve.append(
                        round(sum(win_aux) / len(win_aux), 6) if win_aux else None
                    )
                    win_aux = []
                if not frozen_checked:
                    # step-0 frozen-set certification: no frozen grad, no drift
                    bad = [n for n, p in model.named_parameters()
                           if not p.requires_grad and p.grad is not None]
                    assert not bad, f"frozen params got grads: {bad[:5]}"
                    now = _frozen_fingerprint(model)
                    assert now == fingerprint0, (
                        "frozen params changed at step 0: "
                        f"{[a for a, b in zip(now, fingerprint0) if a != b][:3]}"
                    )
                    frozen_checked = True
                    desc = {"A": "merger", "B": "decoder LoRA",
                            "R5j": "merger + decoder LoRA + aux head"}.get(
                                arm, "merger + aux head")
                    print(f"[phaseb] step-0 frozen check passed "
                          f"({len(fingerprint0)} fingerprints; trainable = {desc})")
            if micro % 25 == 0:
                aux_s = f" aux={float(aux.item()):.4f}" if aux is not None else ""
                print(f"[phaseb] {arm}_{_fmt_lr(lr)} micro {micro}/{micro_total} "
                      f"lm_ce={float(lm.item()):.4f}{aux_s}")
        vl_lm, vl_aux, vl = val_metrics()
        entry = {"epoch": epoch + 1, "optim_step": optim, "val_loss": round(vl, 6)}
        if is_aux:
            entry["val_lm_ce"] = round(vl_lm, 6)
            entry["val_aux"] = round(vl_aux, 6) if vl_aux is not None else None
        val_curve.append(entry)
        print(f"[phaseb] {arm}_{_fmt_lr(lr)} epoch {epoch + 1}: val_loss={vl:.4f}")
        if vl < best_val:
            best_val = vl
            save_weights()
        if micro >= micro_total:
            break

    aux_pts = [v for v in aux_curve if v is not None]
    stats = {
        "arm": arm,
        "lr": lr,
        "lam": lam if is_aux else None,
        "train_corpus": train_corpus,
        "corpus_tag": corpus_tag if is_r5 else None,
        "corpus_counts": r5_counts,
        "smoke": smoke,
        "checkpoint": CHECKPOINT,
        "bridge_params": bridge_params,
        "trainable_params": trainable_params,
        "merger_params": bridge_params if arm == "R5j" else None,  # halves, separately
        "lora_params": lora_params,
        "aux_kind": aux_kind,
        "aux_head_params": aux_head_params,
        "n_no_aux_supervision": n_no_aux if is_aux else None,
        "lm_ce_curve": lm_ce_curve,
        "lm_ce_final": (round(sum(lm_ce_curve[-5:]) / len(lm_ce_curve[-5:]), 6)
                        if lm_ce_curve else None),
        "aux_curve": aux_curve if is_aux else None,
        "aux_loss_final": (round(sum(aux_pts[-5:]) / len(aux_pts[-5:]), 6)
                           if aux_pts else None),
        "match_ratio": round(match_ratio, 4),
        "lora_rank": lora_rank,
        "n_train": len(train_rows),
        "n_val": len(val_rows),
        "n_dropped_overlong": len(dropped),
        "dropped_overlong": sorted(dropped),
        "seq_cap": seq_cap,
        "epochs": epochs,
        "grad_accum": grad_accum,
        "micro_steps": micro,
        "optim_steps": optim,
        "warmup_steps": warmup,
        "val_curve": val_curve,
        "best_val_loss": round(best_val, 6) if best_val < float("inf") else None,
        "frozen_check": "pass" if frozen_checked else "not_reached",
        "load_s": round(load_s, 1),
        "train_s": round(time.monotonic() - t_train, 1),
        "peak_gpu_mem_gib": (
            round(torch.cuda.max_memory_allocated() / 2**30, 2)
            if device.type == "cuda" else None
        ),
    }
    if best_val == float("inf"):  # smoke may end before any val improvement is possible
        save_weights()
    (out_dir / "train_stats.json").write_text(json.dumps(stats, indent=2) + "\n")
    data_volume.commit()
    print(f"[phaseb] {json.dumps({k: v for k, v in stats.items() if k != 'dropped_overlong'})}")
    if smoke and is_aux:
        # smoke contract (R4 and R5j alike): the aux objective must bind and
        # the LM CE must survive it — asserted after stats land so a failure
        # is inspectable
        assert all(math.isfinite(v) for v in lm_ce_curve), (
            f"lm_ce went non-finite under the aux loss: {lm_ce_curve}"
        )
        assert len(aux_pts) >= 2 and aux_pts[-1] < aux_pts[0], (
            f"aux loss did not decrease over the smoke run: {aux_curve}"
        )
    return stats


# --------------------------------------------------------------------------- #
# eval generation
# --------------------------------------------------------------------------- #

@app.function(
    image=image,
    gpu=GPU,
    timeout=3600 * 10,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def eval_arm(
    arm: str,
    lr: float = 0.0,
    corpus: str = "",
    shard: int = 0,
    nshards: int = 1,
    limit: int = 0,
    smoke: bool = False,
    blind: str = "",
) -> dict:
    """Greedy generation (modal_frontier's pattern: fixed QWEN_PROMPT, native
    resolution, fence-stripped) over the held-out docs for one arm ->
    /vol/phaseb/[smoke/]eval/<label>/<image_id>.md, resume-safe (label =
    arm for A/B/C, <arm>_<lam> for R4, <arm>_<corpus> for R5). Arms
    A/R4a/R4b/R5b load bridge.safetensors into the merger — merger-only BY
    CONTRACT: the aux head is never loaded at eval. Arm B attaches the peft
    adapter, arm C is the untouched base. R5j needs BOTH halves for
    generation: bridge.safetensors into the merger AND the peft adapter
    (the b2 probe readout, by contrast, consumes bridge.safetensors alone —
    the merger half suffices there). For R4 arms the `lr` argument carries
    the lam knob; for R5 arms `corpus` (700|5k, or a frozen snapshot tag)
    is the checkpoint-dir key.

    `blind` runs the image-withheld control: same weights, prompt, decoding
    and manifest, with the visual input removed (see blind_messages /
    blind_image) -> /vol/phaseb/[smoke/]eval_blind/<label>__<variant>/.

    Every arm generates over the SAME pilot eval manifest (211 held-out
    docs) regardless of its train corpus — §R5's fixed-eval contract."""
    import time
    import traceback

    import torch
    from PIL import Image
    from safetensors.torch import load_file

    from encoder_experiments.extract import safe_image_id
    from modal_frontier import QWEN_PROMPT, _strip_md_fence

    assert arm in ("A", "B", "C", *R4_ARMS, *R5_ARMS), f"unknown arm {arm!r}"
    check_blind(blind)
    if arm in R5_ARMS:
        assert corpus in EVAL_CORPUS_TAGS, (
            f"arm {arm} needs corpus in {sorted(EVAL_CORPUS_TAGS)}, got {corpus!r}"
        )
        knob: float | str = corpus
    else:
        assert arm == "C" or lr > 0, f"arm {arm} needs its trained knob (lr / lam)"
        knob = lr
    data_volume.reload()

    corpus_dir = Path(VOL_PATH) / "corpus"
    manifest = corpus_dir / EVAL_MANIFEST
    if not manifest.exists():
        raise FileNotFoundError(f"{manifest} not found — run --plan/--train locally first")
    rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    if limit:
        rows = rows[:limit]
    rows = rows[shard::nshards]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, processor = _load_model_and_processor(CHECKPOINT, device)
    weights_note = "base"
    if arm in ("A", *R4_ARMS, *R5_ARMS):
        merger, _ = _find_merger(model)
        ckpt_dir = Path(VOL_PATH) / arm_dir(arm, knob, smoke=smoke)
        path = ckpt_dir / "bridge.safetensors"
        state = {k: v.to(torch.bfloat16) for k, v in load_file(str(path)).items()}
        merger.load_state_dict(state, strict=True)
        merger.to(device)
        weights_note = str(path)
        if arm == "R5j":  # the joint arm's decoder half rides along
            from peft import PeftModel

            model = PeftModel.from_pretrained(model, str(ckpt_dir / "adapter"))
            weights_note += " + adapter"
    elif arm == "B":
        from peft import PeftModel

        path = Path(VOL_PATH) / arm_dir(arm, knob, smoke=smoke) / "adapter"
        model = PeftModel.from_pretrained(model, str(path))
        weights_note = str(path)
    model.eval()

    out_dir = Path(VOL_PATH) / eval_dir(arm, knob, blind=blind, smoke=smoke)
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path = out_dir / f"meta.shard{shard}.jsonl"
    errors_path = out_dir / f"errors.shard{shard}.jsonl"
    print(f"[phaseb-eval] arm {eval_label(arm, knob, blind)} ({weights_note}) "
          f"shard {shard}/{nshards}: {len(rows)} docs -> {out_dir}")

    chat_text = processor.apply_chat_template(
        blind_messages(QWEN_PROMPT, blind), tokenize=False, add_generation_prompt=True
    )

    done = skipped = failed = 0
    gen_times: list[float] = []
    since_commit = 0
    for row in rows:
        sid = safe_image_id(row["image_id"])
        md_path = out_dir / f"{sid}.md"
        if md_path.exists():
            skipped += 1
            continue
        try:
            t0 = time.monotonic()
            proc_kwargs: dict = {"text": [chat_text], "return_tensors": "pt"}
            if blind != "withheld":
                img = Image.open(corpus_dir / row["image_path"]).convert("RGB")
                proc_kwargs["images"] = [blind_image(img, blind)]
            inputs = processor(**proc_kwargs)
            if "pixel_values" in inputs:
                inputs["pixel_values"] = inputs["pixel_values"].to(torch.bfloat16)
            inputs = inputs.to(device)
            with torch.inference_mode():
                out = model.generate(
                    **inputs, do_sample=False, max_new_tokens=MAX_NEW_TOKENS
                )
            new_tokens = out[0][inputs["input_ids"].shape[1]:]
            markdown = _strip_md_fence(
                processor.decode(new_tokens, skip_special_tokens=True).strip()
            )
            gen_s = time.monotonic() - t0
            md_path.write_text(markdown, encoding="utf-8")
            with open(meta_path, "a") as mf:
                mf.write(json.dumps({
                    "image_id": row["image_id"],
                    "gen_s": round(gen_s, 3),
                    "n_output_tokens": int(new_tokens.shape[0]),
                }) + "\n")
            gen_times.append(gen_s)
            done += 1
        except Exception as exc:  # noqa: BLE001 — per-image isolation, as in the pilot
            failed += 1
            with open(errors_path, "a") as ef:
                ef.write(json.dumps({
                    "image_id": row["image_id"],
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }) + "\n")
            print(f"[phaseb-eval] FAIL {sid}: {exc!r}")
        since_commit += 1
        if since_commit >= 10:
            data_volume.commit()
            since_commit = 0

    data_volume.commit()
    stats = {
        "arm": arm, "label": eval_label(arm, knob, blind),
        "lr": lr or None, "corpus": corpus or None, "blind": blind or None,
        "shard": shard, "nshards": nshards,
        "done": done, "skipped": skipped, "failed": failed,
        "mean_gen_s": round(sum(gen_times) / len(gen_times), 2) if gen_times else None,
        "weights": weights_note,
    }
    print(f"[phaseb-eval] {json.dumps(stats)}")
    return stats


@app.function(
    image=image,
    cpu=2.0,
    timeout=1800,
    volumes={VOL_PATH: data_volume},
)
def fetch_phaseb(prefixes: list[str], suffix: str) -> dict:
    """Authoritative /vol/phaseb reads via a container mount (fetch_frontier
    pattern — the volume CLI serves stale views during concurrent commits).
    -> {relpath under phaseb: text} for files under each prefix ending in
    suffix."""
    data_volume.reload()
    root = Path(VOL_PATH) / PHASEB_ROOT
    out: dict[str, str] = {}
    for prefix in prefixes:
        base = root / prefix if prefix else root
        if not base.exists():
            continue
        for p in sorted(base.rglob(f"*{suffix}")):
            if p.is_file():
                out[str(p.relative_to(root))] = p.read_text(encoding="utf-8", errors="replace")
    return out


# --------------------------------------------------------------------------- #
# local entrypoint
# --------------------------------------------------------------------------- #

def _upload_manifests(
    train_rows: list[dict], eval_rows: list[dict], glyph_sidecar: dict
) -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        tp, ep = Path(td) / TRAIN_MANIFEST, Path(td) / EVAL_MANIFEST
        gp = Path(td) / GLYPH_SIDECAR
        tp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in train_rows))
        ep.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in eval_rows))
        gp.write_text(json.dumps(glyph_sidecar, ensure_ascii=False, sort_keys=True) + "\n")
        with data_volume.batch_upload(force=True) as batch:
            batch.put_file(str(tp), f"/corpus/{TRAIN_MANIFEST}")
            batch.put_file(str(ep), f"/corpus/{EVAL_MANIFEST}")
            batch.put_file(str(gp), f"/corpus/{GLYPH_SIDECAR}")
    print(f"[phaseb] uploaded /corpus/{TRAIN_MANIFEST} ({len(train_rows)} rows) + "
          f"/corpus/{EVAL_MANIFEST} ({len(eval_rows)} rows) + "
          f"/corpus/{GLYPH_SIDECAR} ({len(glyph_sidecar['images'])} images, "
          f"{glyph_sidecar['n_classes']} classes)")


def _pick_eval_knobs(
    eval_lrs: str, smoke: bool
) -> tuple[dict[str, float], dict[str, list[float]], dict[str, list[str]]]:
    """-> (best-val-loss LR per B2 arm, ALL trained lams per R4 arm, ALL
    trained corpus tags per R5 arm — every R4/R5 cell is a pre-registered
    adjudication readout, no picking) from the volume's train_stats.json
    files. --eval-lrs 'A:0.0001,R4a:1,R5j:5k' pins instead (R4 values are
    lams, R5 values are corpus tags)."""
    if eval_lrs:
        best: dict[str, float] = {}
        r4: dict[str, list[float]] = {}
        r5: dict[str, list[str]] = {}
        for part in eval_lrs.split(","):
            arm_name, knob_s = part.split(":")
            arm_name, knob_s = arm_name.strip(), knob_s.strip()
            if arm_name in R5_ARMS:
                assert knob_s in EVAL_CORPUS_TAGS, f"bad R5 corpus tag {knob_s!r}"
                r5.setdefault(arm_name, []).append(knob_s)
            elif arm_name in R4_ARMS:
                r4.setdefault(arm_name, []).append(float(knob_s))
            else:
                best[arm_name] = float(knob_s)
        return best, r4, r5
    prefix = ["smoke"] if smoke else [""]
    stats = fetch_phaseb.remote(prefix, "train_stats.json")
    best_raw: dict[str, tuple[float, float]] = {}  # arm -> (val_loss, lr)
    r4 = {}
    r5 = {}
    for rel, text in stats.items():
        if not smoke and rel.startswith(("smoke/", "eval/")):
            continue
        s = json.loads(text)
        if s["arm"] in R5_ARMS:
            r5.setdefault(s["arm"], []).append(s["corpus_tag"])
            continue
        if s["arm"] in R4_ARMS:
            r4.setdefault(s["arm"], []).append(s["lam"])
            continue
        vl = s.get("best_val_loss")
        if vl is None:
            continue
        if s["arm"] not in best_raw or vl < best_raw[s["arm"]][0]:
            best_raw[s["arm"]] = (vl, s["lr"])
    picked = {a: lr for a, (vl, lr) in best_raw.items()}
    r4 = {a: sorted(set(v)) for a, v in r4.items()}
    r5 = {a: sorted(set(v)) for a, v in r5.items()}
    print(f"[phaseb] best-LR picks from train_stats: "
          f"{ {a: (_fmt_lr(lr), best_raw[a][0]) for a, lr in picked.items()} }"
          + (f" ; R4 lams: { {a: [_fmt_lr(v) for v in vs] for a, vs in r4.items()} }" if r4 else "")
          + (f" ; R5 corpora: {r5}" if r5 else ""))
    return picked, r4, r5


def _write_eval_images(manifests: dict, dataset_root: Path) -> Path:
    """The scorer's images jsonl. Contract: it must live in the dataset root so
    gold resolves relative to it (precedent: images_frontier_e2e60.jsonl)."""
    eval_images = dataset_root / "images_phaseb_eval.jsonl"
    eval_images.write_text("".join(
        json.dumps(r, ensure_ascii=False) + "\n" for r in manifests["eval_rows"]
    ))
    return eval_images


def _score_labels(
    prefixes: dict[str, str], eval_images: Path, out_root: Path, only_preds: bool
) -> tuple[dict[str, dict], dict[str, dict[str, dict]]]:
    """Fetch each label's predictions from its /vol/phaseb prefix in ONE remote
    call and score them all with the one scorer -> (summary per label,
    {label: {image_id: scores.jsonl record}})."""
    from encoder_experiments.frontier_score import score_pred_dir

    fetched = fetch_phaseb.remote(sorted(set(prefixes.values())), ".md")
    summaries: dict[str, dict] = {}
    scores: dict[str, dict[str, dict]] = {}
    for label, prefix in prefixes.items():
        pred_dir = out_root / label
        pred_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for rel, text in fetched.items():
            if str(Path(rel).parent) == prefix:
                (pred_dir / Path(rel).name).write_text(text, encoding="utf-8")
                n += 1
        print(f"[phaseb-score] {label}: fetched {n} predictions from {prefix}")
        summaries[label] = score_pred_dir(
            pred_dir, eval_images, out_root / f"{label}_scores", only_preds=only_preds
        )
        scores[label] = {
            rec["image_id"]: rec
            for rec in (json.loads(line) for line in
                        (out_root / f"{label}_scores" / "scores.jsonl").read_text().splitlines()
                        if line.strip())
        }
    return summaries, scores


def _score_local(arms: list[str], manifests: dict, smoke: bool) -> None:
    repo = Path(__file__).resolve().parents[1]
    dataset_root = repo / "data" / "pilot_1k"
    out_root = repo / "validation" / ("phaseb_eval_smoke" if smoke else "phaseb_eval")
    out_root.mkdir(parents=True, exist_ok=True)
    eval_images = _write_eval_images(manifests, dataset_root)

    eval_prefix = "smoke/eval" if smoke else "eval"
    arm_summaries, arm_scores = _score_labels(
        {a: f"{eval_prefix}/{a}" for a in arms}, eval_images, out_root, only_preds=smoke
    )

    stats = fetch_phaseb.remote(["smoke"] if smoke else [""], "train_stats.json")
    train_stats = [json.loads(t) for rel, t in stats.items()
                   if smoke or not rel.startswith(("smoke/", "eval/"))]

    from itertools import combinations

    # all pairs over the requested labels — with the default A,B,C this is
    # exactly the original A-B, A-C, B-C block
    contrasts = {
        f"{a}-{b}": contrast_block(arm_scores[a], arm_scores[b])
        for a, b in combinations(arms, 2)
        if a in arm_scores and b in arm_scores
    }
    # §R5 content-normalized readout: same doc-paired bootstrap, on the
    # additive content_edit_sim field (text/math co-primary; per-arm means
    # already live in each summary's content_edit_sim blocks)
    content_contrasts = {
        f"{a}-{b}": contrast_block(arm_scores[a], arm_scores[b], key="content_edit_sim")
        for a, b in combinations(arms, 2)
        if a in arm_scores and b in arm_scores
    }
    from datetime import datetime, timezone

    bundle = {
        "experiment": "B2",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "checkpoint": CHECKPOINT,
        "smoke": smoke,
        "counts": manifests["counts"],
        "primary_readout": ["text", "math"],
        "arms": {
            arm: {
                "summary": arm_summaries[arm],
                # raw stats for every trained LR of the arm; the eval'd
                # checkpoint is the min-best_val_loss one (or --eval-lrs).
                # R4 labels are arm_<lam>, so each matches its single run.
                "train_stats": sorted(
                    (s for s in train_stats if stats_label(s) == arm),
                    key=lambda s: s["lr"],
                ) or None,
            }
            for arm in arms
        },
        "contrasts": contrasts,
        "content_metric": "content_edit_sim",  # frontier_score.content_normalize
        "content_contrasts": content_contrasts,
        "bootstrap": {"n_resamples": 2000, "unit": "document", "seed": 0},
    }
    out_path = repo / "validation" / ("b2_pilot_smoke.json" if smoke else "b2_pilot.json")
    out_path.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n")
    print(f"[phaseb-score] wrote {out_path}")
    for name, c in contrasts.items():
        print(f"[phaseb-score] {name} overall: {c['overall']}")
    for name, c in content_contrasts.items():
        print(f"[phaseb-score] {name} content_edit_sim overall: {c['overall']}")


def _score_blind(
    labels: list[str], variants: list[str], manifests: dict, smoke: bool
) -> None:
    """The image-withheld control -> validation/blind_control.json.

    Scores each label's sighted eval (/vol/phaseb/eval/<label>) and its blind
    twins (/vol/phaseb/eval_blind/<label>__<variant>) with the SAME scorer and
    reports the doc-paired sighted-blind gain — raw score and content_edit_sim,
    overall and per family, percentile bootstrap over documents. Predictions
    and per-doc scores land under validation/phaseb_eval_blind/ so the sighted
    validation/phaseb_eval/ artifacts of the B2/R4/R5 records are untouched."""
    from datetime import datetime, timezone

    from modal_frontier import QWEN_PROMPT

    assert variants, "--score --no-image needs at least one variant"
    repo = Path(__file__).resolve().parents[1]
    dataset_root = repo / "data" / "pilot_1k"
    out_root = repo / "validation" / (
        "phaseb_eval_blind_smoke" if smoke else "phaseb_eval_blind")
    out_root.mkdir(parents=True, exist_ok=True)
    eval_images = _write_eval_images(manifests, dataset_root)

    eval_prefix = "smoke/eval" if smoke else "eval"
    blind_prefix = f"smoke/{BLIND_ROOT}" if smoke else BLIND_ROOT
    prefixes = {f"{lab}__sighted": f"{eval_prefix}/{lab}" for lab in labels}
    prefixes.update({f"{lab}__{v}": f"{blind_prefix}/{lab}__{v}"
                     for lab in labels for v in variants})
    summaries, scores = _score_labels(prefixes, eval_images, out_root, only_preds=smoke)

    bundle = {
        "experiment": "blind_control",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "checkpoint": CHECKPOINT,
        "smoke": smoke,
        "counts": manifests["counts"],
        "variants": variants,
        "variant_definitions": {
            "withheld": "message carries the text prompt only — no image part, "
                        "no image tokens",
            "blank": "a plain white page of the same dimensions as the document, "
                     "so the image-token span is unchanged",
        },
        "held_fixed": {
            "prompt": QWEN_PROMPT,
            "decoding": "greedy (do_sample=False)",
            "max_new_tokens": MAX_NEW_TOKENS,
            "eval_manifest": EVAL_MANIFEST,
            "scorer": "encoder_experiments.frontier_score.score_pred_dir",
        },
        "metrics": ["score", "content_edit_sim"],
        "arms": {
            lab: {
                "sighted": {"summary": summaries[f"{lab}__sighted"]},
                **{v: {
                    "summary": summaries[f"{lab}__{v}"],
                    "gain": gain_block(scores[f"{lab}__sighted"], scores[f"{lab}__{v}"]),
                } for v in variants},
            }
            for lab in labels
        },
        "bootstrap": {"n_resamples": 2000, "unit": "document", "seed": 0},
    }
    out_path = repo / "validation" / (
        "blind_control_smoke.json" if smoke else "blind_control.json")
    out_path.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n")
    print(f"[phaseb-blind] wrote {out_path}")
    for metric in bundle["metrics"]:
        print(f"\n[phaseb-blind] {metric}\n{blind_table(bundle, metric)}")


@app.local_entrypoint()
def main(
    plan: bool = False,
    smoke: bool = False,
    train: bool = False,
    eval: bool = False,
    score: bool = False,
    arms: str = "",
    lrs: str = "",
    lam: str = "",
    train_corpus: str = "pilot",
    eval_lrs: str = "",
    shards: int = 2,
    limit: int = 0,
    smoke_artifacts: bool = False,
    no_image: str = "",
    reuse_manifests: bool = False,
):
    """One mode per invocation: --plan | --smoke | --train | --eval | --score.

    --arms restricts the arm set ("A,B" for train — pass "R4a,R4b" for the
    R4 fan, "R5j,R5b" for R5 — "A,B,C" for eval/score, where R4 entries are
    labeled R4a_<lam> and R5 entries R5j_<700|5k>); --lrs overrides the A/B
    training LR grid (comma floats; R4/R5 lr is fixed); --lam overrides the
    R4 lam grid the same way (R5 lam is fixed at 1); --train-corpus
    {pilot,r5} picks the R5 arms' train data (dir tag 700|5k; eval is always
    the pilot 211); --eval-lrs "A:0.0001,R4a:1,R5j:5k" pins eval checkpoints
    (R4 values are lams, R5 values are corpus tags) instead of the
    auto-pick; --smoke-artifacts points --eval/--score at the smoke
    checkpoints/outputs.

    --no-image "withheld|blank|withheld,blank|all" is the blind control: with
    --eval it generates the blind twins of the selected arms into
    /vol/phaseb/eval_blind/, with --score it scores sighted vs blind and
    writes validation/blind_control.json. --reuse-manifests skips the
    manifest rebuild+upload when the volume already carries them (the upload
    takes a volume layer, which the server refuses while many generation
    shards commit concurrently); only safe when split and corpus are unchanged.
    """
    if sum([plan, smoke, train, eval, score]) != 1:
        raise SystemExit("pass exactly one of --plan --smoke --train --eval --score")
    if train_corpus not in CORPUS_TAGS:
        raise SystemExit(f"--train-corpus takes {sorted(CORPUS_TAGS)}, got {train_corpus!r}")
    try:
        variants = blind_variants(no_image)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if variants and not (eval or score):
        raise SystemExit("--no-image pairs with --eval (generate) or --score (report)")

    dataset_root = Path(__file__).resolve().parents[1] / "data" / "pilot_1k"
    manifests = build_manifests(dataset_root)
    counts = manifests["counts"]

    if plan:
        train_jobs = [(a, lr) for a in ("A", "B") for lr in LR_GRID[a]]
        r4_jobs = [(a, l) for a in R4_ARMS for l in LAM_GRID]
        r5_jobs = [(a, t) for a in R5_ARMS for t in CORPUS_TAGS.values()]
        print(json.dumps(counts, indent=2))
        print(f"[plan] gpu={GPU} seq_cap={SEQ_CAP} epochs={EPOCHS} accum={GRAD_ACCUM}")
        print(f"[plan] train jobs ({len(train_jobs)}): "
              f"{[f'{a}_{_fmt_lr(lr)}' for a, lr in train_jobs]}")
        print(f"[plan] R4 jobs ({len(r4_jobs)}, lr={_fmt_lr(R4_LR)}, --arms R4a,R4b): "
              f"{[f'{a}_{_fmt_lr(l)}' for a, l in r4_jobs]}")
        print(f"[plan] R5 jobs ({len(r5_jobs)}, lr={_fmt_lr(R5_LR)} lam={_fmt_lr(R5_LAM)} "
              f"lora r={R5_LORA_RANK} for R5j; --arms R5j,R5b --train-corpus pilot|r5): "
              f"{[f'{a}_{t}' for a, t in r5_jobs]}")
        print(f"[plan] smoke: {SMOKE_DOCS} docs, {SMOKE_MICRO_STEPS} micro steps, "
              f"lrs { {a: _fmt_lr(lr) for a, lr in SMOKE_LR.items()} }, "
              f"aux lam {_fmt_lr(SMOKE_LAM)}")
        print(f"[plan] outputs: /vol/{PHASEB_ROOT}/<arm>_<lr|lam|corpus>/ ; eval -> "
              f"/vol/{PHASEB_ROOT}/eval/<label>/ ; score -> validation/b2_pilot.json")
        print(f"[plan] blind control (--no-image {'|'.join(BLIND_VARIANTS)}|all): "
              f"/vol/{PHASEB_ROOT}/{BLIND_ROOT}/<label>__<variant>/ ; "
              f"score -> validation/blind_control.json")
        return

    if score:
        arm_list = [a for a in (arms or "A,B,C").split(",") if a]
        if variants:
            _score_blind(arm_list, variants, manifests, smoke_artifacts)
        else:
            _score_local(arm_list, manifests, smoke_artifacts)
        return

    if reuse_manifests:
        # ops escape hatch: batch_upload takes a volume layer, which the server
        # refuses once enough concurrent generation shards are committing
        # ("too many layers in volume"). The manifests are deterministic in the
        # local corpus, so an --eval whose manifests are already on the volume
        # can skip the write. NEVER skip it after changing the split or corpus.
        print("[phaseb] --reuse-manifests: keeping the volume's existing "
              f"/corpus/{TRAIN_MANIFEST}, /corpus/{EVAL_MANIFEST}, /corpus/{GLYPH_SIDECAR}")
    else:
        glyph_sidecar = build_glyph_sidecar(
            dataset_root / "probes.jsonl",
            {r["image_id"] for r in manifests["train_rows"]},  # train + val splits
        )
        _upload_manifests(manifests["train_rows"], manifests["eval_rows"], glyph_sidecar)

    if smoke:
        # smoke always exercises the pilot slice — R5j included (§R5: joint
        # step-0 certification + aux binding on 20 docs / 30 steps)
        arm_list = [a for a in (arms or "A,B,R4a,R4b,R5j").split(",") if a in SMOKE_LR]
        handles = []
        for a in arm_list:
            sl = SMOKE_LAM if a in (*R4_ARMS, *R5_ARMS) else 0.0
            label = f"{a}_{_fmt_lr(SMOKE_LR[a])}" + (f"_lam{_fmt_lr(sl)}" if sl else "")
            handles.append((label, train_arm.spawn(arm=a, lr=SMOKE_LR[a], lam=sl, smoke=True)))
    elif train:
        lr_override = [float(x) for x in lrs.split(",") if x.strip()]
        lam_override = [float(x) for x in lam.split(",") if x.strip()]
        arm_names = [a for a in (arms or "A,B").split(",") if a]
        non_r5 = [a for a in arm_names if a not in R5_ARMS]
        if train_corpus != "pilot" and non_r5:
            raise SystemExit(f"--train-corpus r5 takes R5 arms only, got {non_r5}")
        handles = []
        for a in arm_names:
            if a in R5_ARMS:
                handles.append((f"{a}_{CORPUS_TAGS[train_corpus]}",
                                train_arm.spawn(arm=a, lr=R5_LR, lam=R5_LAM,
                                                train_corpus=train_corpus)))
            elif a in R4_ARMS:
                for l in (lam_override or LAM_GRID):
                    handles.append((f"{a}_lam{_fmt_lr(l)}",
                                    train_arm.spawn(arm=a, lr=R4_LR, lam=l)))
            elif a in LR_GRID:
                for lr in (lr_override or LR_GRID[a]):
                    handles.append((f"{a}_{_fmt_lr(lr)}", train_arm.spawn(arm=a, lr=lr)))
    else:  # eval
        picked, r4_lams, r5_corp = _pick_eval_knobs(eval_lrs, smoke_artifacts)
        arm_list = [a for a in (arms or "A,B,C").split(",") if a]
        missing = [a for a in arm_list if a != "C"
                   and a not in (r5_corp if a in R5_ARMS
                                 else r4_lams if a in R4_ARMS else picked)]
        if missing:
            raise SystemExit(f"no train_stats for arms {missing}; train first or pass --eval-lrs")
        handles = []
        for a in arm_list:
            if a == "C":
                knobs: list[float | str] = [0.0]
            elif a in R5_ARMS:
                knobs = r5_corp[a]
            elif a in R4_ARMS:
                knobs = r4_lams[a]
            else:
                knobs = [picked[a]]
            for knob in knobs:
                is_r5_arm = a in R5_ARMS
                for variant in (variants or [""]):
                    lbl = eval_label(a, knob, variant)
                    if a not in (*R4_ARMS, *R5_ARMS) and knob:
                        lbl += "@" + _fmt_lr(knob)
                    for shard in range(shards):
                        handles.append((
                            f"eval {lbl} shard {shard}",
                            eval_arm.spawn(arm=a,
                                           lr=0.0 if is_r5_arm else knob,
                                           corpus=knob if is_r5_arm else "",
                                           shard=shard, nshards=shards,
                                           limit=limit, smoke=smoke_artifacts,
                                           blind=variant),
                        ))

    print(f"[phaseb] launched {len(handles)} jobs (gpu={GPU})")
    ok = 0
    for label, handle in handles:
        try:
            res = handle.get()
        except Exception as exc:  # noqa: BLE001 — report per-job, keep collecting
            print(f"[FAIL] {label}: {type(exc).__name__}: {exc}")
            continue
        ok += 1
        brief = {k: res[k] for k in ("best_val_loss", "trainable_params", "bridge_params",
                                     "lora_rank", "n_dropped_overlong", "done", "skipped",
                                     "failed", "peak_gpu_mem_gib") if k in res}
        print(f"[ok]   {label}: {json.dumps(brief)}")
    print(f"[phaseb] {ok}/{len(handles)} jobs succeeded")
