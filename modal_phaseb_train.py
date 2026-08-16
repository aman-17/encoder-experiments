"""Phase B2 — bridge-only pilot vs decoder-LoRA control (phase-b-causal.md §B2).

Three arms on Qwen3.5-4B (same trust_remote_code loading as
modal_extract.extract_decoder_mid), bf16 + gradient checkpointing:

    A  bridge:  ONLY the vision merger/bridge parameters train (the merger
       module is found the way adapters/qwen_vit.py's premerge hook finds it);
       encoder + decoder frozen.
    B  decoder control: peft LoRA on decoder attn+mlp projections, rank picked
       so trainable params match arm A within 2x (both counts recorded).
    C  anchor: no training, eval only.

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
bundle (per-arm summaries + doc-paired bootstrap contrasts A-B, A-C, B-C;
no conclusion prose) to validation/b2_pilot.json.

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
SMOKE_LR = {"A": 1e-4, "B": 3e-4}
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
    scores_a: dict[str, dict], scores_b: dict[str, dict], n_boot: int = 2000, seed: int = 0
) -> dict:
    """Overall + per-family contrasts from two {image_id: scores.jsonl record}
    maps (frontier_score output). Only docs scored in BOTH arms pair up."""
    common = sorted(set(scores_a) & set(scores_b))
    out = {"overall": bootstrap_contrast(
        [(scores_a[i]["score"], scores_b[i]["score"]) for i in common],
        n_boot=n_boot, seed=seed,
    )}
    fams = sorted({scores_a[i]["family"] for i in common})
    out["families"] = {
        fam: bootstrap_contrast(
            [(scores_a[i]["score"], scores_b[i]["score"])
             for i in common if scores_a[i]["family"] == fam],
            n_boot=n_boot, seed=seed,
        )
        for fam in fams
    }
    return out


def _fmt_lr(lr: float) -> str:
    return f"{lr:g}"


def arm_dir(arm: str, lr: float, smoke: bool = False) -> str:
    """Relative (to /vol) checkpoint dir: phaseb/[smoke/]<arm>_<lr>."""
    root = f"{PHASEB_ROOT}/smoke" if smoke else PHASEB_ROOT
    return f"{root}/{arm}_{_fmt_lr(lr)}"


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
    timeout=3600 * 12,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def train_arm(
    arm: str,
    lr: float,
    smoke: bool = False,
    epochs: int = EPOCHS,
    grad_accum: int = GRAD_ACCUM,
    seq_cap: int = SEQ_CAP,
    seed: int = 0,
) -> dict:
    """One (arm, lr) training run -> /vol/phaseb/[smoke/]<arm>_<lr>/
    (bridge.safetensors or adapter/, saved at every val improvement, +
    train_stats.json). Arm A trains the merger only; arm B trains decoder
    LoRA rank-matched to the merger count within 2x; both freeze everything
    else and hard-assert it at step 0."""
    import time

    import torch
    from PIL import Image
    from safetensors.torch import save_file

    from modal_frontier import QWEN_PROMPT

    assert arm in ("A", "B"), f"train_arm takes arm A or B, got {arm!r}"
    data_volume.reload()

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / TRAIN_MANIFEST
    if not manifest.exists():
        raise FileNotFoundError(f"{manifest} not found — run --plan/--train locally first")
    rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    train_rows = [r for r in rows if r["split"] == "train"]
    val_rows = [r for r in rows if r["split"] == "val"]
    if smoke:
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

    model.requires_grad_(False)
    lora_rank = None
    if arm == "A":
        merger.requires_grad_(True)
        merger_ids = {id(p) for p in merger.parameters()}
        trainable = {n: p for n, p in model.named_parameters() if id(p) in merger_ids}
        expected = {n for n, p in model.named_parameters() if id(p) in merger_ids}
    else:
        target_shapes: list[tuple[int, int]] = []
        target_names: list[str] = []
        for name, mod in model.named_modules():
            if name.startswith(visual_prefix + ".") or name == visual_prefix:
                continue
            if isinstance(mod, torch.nn.Linear) and name.rsplit(".", 1)[-1] in LORA_TARGET_SUFFIXES:
                target_names.append(name)
                target_shapes.append((mod.in_features, mod.out_features))
        lora_rank, expected_count = pick_lora_rank(bridge_params, target_shapes)
        from peft import LoraConfig, get_peft_model

        model = get_peft_model(model, LoraConfig(
            r=lora_rank, lora_alpha=2 * lora_rank, lora_dropout=0.0,
            bias="none", target_modules=target_names,
        ))
        trainable = {n: p for n, p in model.named_parameters() if p.requires_grad}
        assert all("lora_" in n for n in trainable), sorted(trainable)[:5]
        actual = sum(p.numel() for p in trainable.values())
        assert actual == expected_count, (
            f"LoRA count mismatch: peft trainable {actual} != formula {expected_count}"
        )
        expected = set(trainable)

    trainable_params = sum(p.numel() for p in trainable.values())
    match_ratio = max(trainable_params / bridge_params, bridge_params / trainable_params)
    assert match_ratio <= LORA_MATCH_MAX_RATIO, (
        f"arm {arm}: trainable {trainable_params} vs bridge {bridge_params} "
        f"ratio {match_ratio:.2f} > {LORA_MATCH_MAX_RATIO}"
    )
    actual_names = {n for n, p in model.named_parameters() if p.requires_grad}
    assert actual_names == expected, (
        f"trainable set drifted: +{sorted(actual_names - expected)[:5]} "
        f"-{sorted(expected - actual_names)[:5]}"
    )
    print(f"[phaseb] arm {arm} lr={_fmt_lr(lr)}: bridge_params={bridge_params:,} "
          f"trainable={trainable_params:,} (ratio {match_ratio:.2f}"
          f"{f', lora r={lora_rank}' if lora_rank else ''}) "
          f"train={len(train_rows)} val={len(val_rows)} docs")

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

    micro_total = epochs * len(train_rows)
    if smoke:
        micro_total = min(micro_total, SMOKE_MICRO_STEPS)
    optim_total = max(1, math.ceil(micro_total / grad_accum))
    optimizer = torch.optim.AdamW(trainable.values(), lr=lr, weight_decay=0.0)
    from transformers import get_cosine_schedule_with_warmup

    warmup = min(20, max(1, optim_total // 10))
    scheduler = get_cosine_schedule_with_warmup(optimizer, warmup, optim_total)

    out_dir = Path(VOL_PATH) / arm_dir(arm, lr, smoke=smoke)
    out_dir.mkdir(parents=True, exist_ok=True)

    def save_weights():
        if arm == "A":
            save_file({k: v.detach().to("cpu", torch.float32) for k, v in
                       merger.state_dict().items()}, out_dir / "bridge.safetensors")
        else:
            model.save_pretrained(str(out_dir / "adapter"))
        data_volume.commit()

    @torch.no_grad()
    def val_loss():
        model.eval()
        losses = []
        for row in val_rows:
            enc = encode_row(row)
            if enc is None:
                continue
            inputs, labels = enc
            losses.append(float(_token_ce(model(**inputs).logits, labels).item()))
        model.train()
        return sum(losses) / len(losses) if losses else float("nan")

    dropped: set[str] = set()
    val_curve: list[dict] = []
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
            loss = _token_ce(model(**inputs).logits, labels)
            (loss / grad_accum).backward()
            micro += 1
            if micro % grad_accum == 0 or micro == micro_total:
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
                optim += 1
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
                    print(f"[phaseb] step-0 frozen check passed "
                          f"({len(fingerprint0)} fingerprints)")
            if micro % 25 == 0:
                print(f"[phaseb] {arm}_{_fmt_lr(lr)} micro {micro}/{micro_total} "
                      f"loss={float(loss.item()):.4f}")
        vl = val_loss()
        val_curve.append({"epoch": epoch + 1, "optim_step": optim, "val_loss": round(vl, 6)})
        print(f"[phaseb] {arm}_{_fmt_lr(lr)} epoch {epoch + 1}: val_loss={vl:.4f}")
        if vl < best_val:
            best_val = vl
            save_weights()
        if micro >= micro_total:
            break

    stats = {
        "arm": arm,
        "lr": lr,
        "smoke": smoke,
        "checkpoint": CHECKPOINT,
        "bridge_params": bridge_params,
        "trainable_params": trainable_params,
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
    shard: int = 0,
    nshards: int = 1,
    limit: int = 0,
    smoke: bool = False,
) -> dict:
    """Greedy generation (modal_frontier's pattern: fixed QWEN_PROMPT, native
    resolution, fence-stripped) over the held-out docs for one arm ->
    /vol/phaseb/[smoke/]eval/<arm>/<image_id>.md, resume-safe. Arm A loads
    bridge.safetensors into the merger, arm B attaches the peft adapter,
    arm C is the untouched base."""
    import time
    import traceback

    import torch
    from PIL import Image
    from safetensors.torch import load_file

    from encoder_experiments.extract import safe_image_id
    from modal_frontier import QWEN_PROMPT, _strip_md_fence

    assert arm in ("A", "B", "C"), f"unknown arm {arm!r}"
    assert arm == "C" or lr > 0, f"arm {arm} needs the trained lr"
    data_volume.reload()

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / EVAL_MANIFEST
    if not manifest.exists():
        raise FileNotFoundError(f"{manifest} not found — run --plan/--train locally first")
    rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    if limit:
        rows = rows[:limit]
    rows = rows[shard::nshards]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, processor = _load_model_and_processor(CHECKPOINT, device)
    weights_note = "base"
    if arm == "A":
        merger, _ = _find_merger(model)
        path = Path(VOL_PATH) / arm_dir(arm, lr, smoke=smoke) / "bridge.safetensors"
        state = {k: v.to(torch.bfloat16) for k, v in load_file(str(path)).items()}
        merger.load_state_dict(state, strict=True)
        merger.to(device)
        weights_note = str(path)
    elif arm == "B":
        from peft import PeftModel

        path = Path(VOL_PATH) / arm_dir(arm, lr, smoke=smoke) / "adapter"
        model = PeftModel.from_pretrained(model, str(path))
        weights_note = str(path)
    model.eval()

    root = Path(VOL_PATH) / PHASEB_ROOT / ("smoke/eval" if smoke else "eval")
    out_dir = root / arm
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path = out_dir / f"meta.shard{shard}.jsonl"
    errors_path = out_dir / f"errors.shard{shard}.jsonl"
    print(f"[phaseb-eval] arm {arm} ({weights_note}) shard {shard}/{nshards}: "
          f"{len(rows)} docs -> {out_dir}")

    messages = [{
        "role": "user",
        "content": [{"type": "image"}, {"type": "text", "text": QWEN_PROMPT}],
    }]
    chat_text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
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
            img = Image.open(corpus / row["image_path"]).convert("RGB")
            inputs = processor(text=[chat_text], images=[img], return_tensors="pt")
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
        "arm": arm, "lr": lr or None, "shard": shard, "nshards": nshards,
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

def _upload_manifests(train_rows: list[dict], eval_rows: list[dict]) -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        tp, ep = Path(td) / TRAIN_MANIFEST, Path(td) / EVAL_MANIFEST
        tp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in train_rows))
        ep.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in eval_rows))
        with data_volume.batch_upload(force=True) as batch:
            batch.put_file(str(tp), f"/corpus/{TRAIN_MANIFEST}")
            batch.put_file(str(ep), f"/corpus/{EVAL_MANIFEST}")
    print(f"[phaseb] uploaded /corpus/{TRAIN_MANIFEST} ({len(train_rows)} rows) + "
          f"/corpus/{EVAL_MANIFEST} ({len(eval_rows)} rows)")


def _pick_best_lrs(eval_lrs: str, smoke: bool) -> dict[str, float]:
    """Best-val-loss LR per trained arm from the volume's train_stats.json
    files; --eval-lrs 'A:0.0001,B:0.0003' overrides."""
    if eval_lrs:
        out = {}
        for part in eval_lrs.split(","):
            arm_name, lr_s = part.split(":")
            out[arm_name.strip()] = float(lr_s)
        return out
    prefix = ["smoke"] if smoke else [""]
    stats = fetch_phaseb.remote(prefix, "train_stats.json")
    best: dict[str, tuple[float, float]] = {}  # arm -> (val_loss, lr)
    for rel, text in stats.items():
        if not smoke and rel.startswith(("smoke/", "eval/")):
            continue
        s = json.loads(text)
        vl = s.get("best_val_loss")
        if vl is None:
            continue
        if s["arm"] not in best or vl < best[s["arm"]][0]:
            best[s["arm"]] = (vl, s["lr"])
    picked = {a: lr for a, (vl, lr) in best.items()}
    print(f"[phaseb] best-LR picks from train_stats: "
          f"{ {a: (_fmt_lr(lr), best[a][0]) for a, lr in picked.items()} }")
    return picked


def _score_local(arms: list[str], manifests: dict, smoke: bool) -> None:
    from encoder_experiments.frontier_score import score_pred_dir

    repo = Path(__file__).resolve().parent
    dataset_root = repo / "data" / "pilot_1k"
    out_root = repo / "validation" / ("phaseb_eval_smoke" if smoke else "phaseb_eval")
    out_root.mkdir(parents=True, exist_ok=True)

    # scorer contract: images jsonl must live in the dataset root so gold
    # resolves relative to it (precedent: images_frontier_e2e60.jsonl)
    eval_images = dataset_root / "images_phaseb_eval.jsonl"
    eval_images.write_text("".join(
        json.dumps(r, ensure_ascii=False) + "\n" for r in manifests["eval_rows"]
    ))

    fetched = fetch_phaseb.remote(
        [f"{'smoke/eval' if smoke else 'eval'}/{a}" for a in arms], ".md"
    )
    arm_summaries: dict[str, dict] = {}
    arm_scores: dict[str, dict[str, dict]] = {}
    for arm in arms:
        pred_dir = out_root / arm
        pred_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for rel, text in fetched.items():
            if Path(rel).parts[-2] == arm:
                (pred_dir / Path(rel).name).write_text(text, encoding="utf-8")
                n += 1
        print(f"[phaseb-score] arm {arm}: fetched {n} predictions")
        summary = score_pred_dir(
            pred_dir, eval_images, out_root / f"{arm}_scores", only_preds=smoke
        )
        arm_summaries[arm] = summary
        arm_scores[arm] = {
            rec["image_id"]: rec
            for rec in (json.loads(line) for line in
                        (out_root / f"{arm}_scores" / "scores.jsonl").read_text().splitlines()
                        if line.strip())
        }

    stats = fetch_phaseb.remote(["smoke"] if smoke else [""], "train_stats.json")
    train_stats = [json.loads(t) for rel, t in stats.items()
                   if smoke or not rel.startswith(("smoke/", "eval/"))]

    contrasts = {
        f"{a}-{b}": contrast_block(arm_scores[a], arm_scores[b])
        for a, b in (("A", "B"), ("A", "C"), ("B", "C"))
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
                # checkpoint is the min-best_val_loss one (or --eval-lrs)
                "train_stats": sorted(
                    (s for s in train_stats if s["arm"] == arm),
                    key=lambda s: s["lr"],
                ) or None,
            }
            for arm in arms
        },
        "contrasts": contrasts,
        "bootstrap": {"n_resamples": 2000, "unit": "document", "seed": 0},
    }
    out_path = repo / "validation" / ("b2_pilot_smoke.json" if smoke else "b2_pilot.json")
    out_path.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n")
    print(f"[phaseb-score] wrote {out_path}")
    for name, c in contrasts.items():
        print(f"[phaseb-score] {name} overall: {c['overall']}")


@app.local_entrypoint()
def main(
    plan: bool = False,
    smoke: bool = False,
    train: bool = False,
    eval: bool = False,
    score: bool = False,
    arms: str = "",
    lrs: str = "",
    eval_lrs: str = "",
    shards: int = 2,
    limit: int = 0,
    smoke_artifacts: bool = False,
):
    """One mode per invocation: --plan | --smoke | --train | --eval | --score.

    --arms restricts the arm set ("A,B" for train, "A,B,C" for eval/score);
    --lrs overrides the training LR grid (comma floats, applied to every
    trained arm); --eval-lrs "A:0.0001,B:0.0003" pins eval checkpoints
    instead of the best-val-loss auto-pick; --smoke-artifacts points --eval/
    --score at the smoke checkpoints/outputs.
    """
    if sum([plan, smoke, train, eval, score]) != 1:
        raise SystemExit("pass exactly one of --plan --smoke --train --eval --score")

    dataset_root = Path(__file__).resolve().parent / "data" / "pilot_1k"
    manifests = build_manifests(dataset_root)
    counts = manifests["counts"]

    if plan:
        train_jobs = [(a, lr) for a in ("A", "B") for lr in LR_GRID[a]]
        print(json.dumps(counts, indent=2))
        print(f"[plan] gpu={GPU} seq_cap={SEQ_CAP} epochs={EPOCHS} accum={GRAD_ACCUM}")
        print(f"[plan] train jobs ({len(train_jobs)}): "
              f"{[f'{a}_{_fmt_lr(lr)}' for a, lr in train_jobs]}")
        print(f"[plan] smoke: {SMOKE_DOCS} docs, {SMOKE_MICRO_STEPS} micro steps, "
              f"lrs { {a: _fmt_lr(lr) for a, lr in SMOKE_LR.items()} }")
        print(f"[plan] outputs: /vol/{PHASEB_ROOT}/<arm>_<lr>/ ; eval -> "
              f"/vol/{PHASEB_ROOT}/eval/<arm>/ ; score -> validation/b2_pilot.json")
        return

    if score:
        arm_list = [a for a in (arms or "A,B,C").split(",") if a]
        _score_local(arm_list, manifests, smoke_artifacts)
        return

    _upload_manifests(manifests["train_rows"], manifests["eval_rows"])

    if smoke:
        jobs = [(a, SMOKE_LR[a]) for a in (arms or "A,B").split(",") if a in SMOKE_LR]
        handles = [(f"{a}_{_fmt_lr(lr)}", train_arm.spawn(arm=a, lr=lr, smoke=True))
                   for a, lr in jobs]
    elif train:
        lr_override = [float(x) for x in lrs.split(",") if x.strip()]
        jobs = [(a, lr) for a in (arms or "A,B").split(",") if a in LR_GRID
                for lr in (lr_override or LR_GRID[a])]
        handles = [(f"{a}_{_fmt_lr(lr)}", train_arm.spawn(arm=a, lr=lr))
                   for a, lr in jobs]
    else:  # eval
        picked = _pick_best_lrs(eval_lrs, smoke_artifacts)
        arm_list = [a for a in (arms or "A,B,C").split(",") if a]
        missing = [a for a in arm_list if a != "C" and a not in picked]
        if missing:
            raise SystemExit(f"no train_stats for arms {missing}; train first or pass --eval-lrs")
        handles = []
        for a in arm_list:
            lr = 0.0 if a == "C" else picked[a]
            for shard in range(shards):
                handles.append((
                    f"eval {a}{'@' + _fmt_lr(lr) if lr else ''} shard {shard}",
                    eval_arm.spawn(arm=a, lr=lr, shard=shard, nshards=shards,
                                   limit=limit, smoke=smoke_artifacts),
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
