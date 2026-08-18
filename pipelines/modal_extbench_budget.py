"""Vision TOKEN BUDGET vs external OCR benchmarks, on stock Qwen3.5-4B (no training).

One dial: how many merged vision tokens the LM is handed for the same page. Everything
else — render, prompt, sampling, postprocess, and the official scorers — is
ocr_postraining/extbench's own, IMPORTED from the mounted extbench dir rather than
forked, so a rung's predictions are scored by the unmodified scorer.

Qwen3.5's ViT is 16px patches with a 2x2 spatial merge, so one merged token covers a
32x32 pixel tile: merged_tokens ~= pixels / 1024 (NOT the 14px lineage's /784 that
budgets.py encodes for qwen35_vit — that constant is wrong for this checkpoint's
processor, which reports patch_size=16). The processor is Qwen2VLImageProcessor under a
Qwen3VLProcessor; on transformers 5.15 a bare `max_pixels=` kwarg passed to the HF
processor is INERT (only the `size` dict, whose shortest_edge/longest_edge are pixel
AREAS, drives smart_resize) — but vLLM 0.27.1 honors BOTH, because its Qwen processing
info translates min/max_pixels into that size dict itself. This module passes the `size`
dict, the channel that also reaches the FLOOR (shortest_edge) and so can buy tokens
above native by upscaling.

Rungs (nominal x default; realized counts are measured per page, never assumed):

    b280     cap  280*1024 px area   ~0.25x
    b560     cap  560*1024                  ~0.5x
    b1120    no kwargs                       1x   == extbench's own default arm
    b2240up  floor 2240*1024                ~2x   SAME 1288px render, upscaled: more
                                                  tokens over the same information
    b2240px  no kwargs, 1822px render       ~2x   more tokens AND more pixels

b2240up/b2240px land on the same realized token count by construction, so the pair
separates "more tokens" from "more pixels" — the Silico pixel-shuffle contrast.

    uv run modal run modal_extbench_budget.py --bench olmocr --rung b280
    (cd ../ocr_postraining/extbench && modal run bench_olmocr.py \
        --candidate qwen35_4b_stock_b280 --stage score)
    uv run modal run modal_extbench_budget.py --collect

Inference is resume-safe (existing predictions are skipped) and writes a telemetry
sidecar per candidate holding per-page realized image-token counts, prompt/generated
lengths and batch wall times — the cost side of the trade. Ops: --detach does not
survive a killed client (results.md §extbench), so start each client in its own session.
"""

from __future__ import annotations

import json
import os as _os
from datetime import datetime, timezone
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTBENCH_DIR = REPO_ROOT.parent / "ocr_postraining" / "extbench"
LOCAL_OUT_PATH = REPO_ROOT / "validation" / "token_budget_extbench.json"
KNOB_PATH = REPO_ROOT / "validation" / "token_budget_knob_probe.json"

APP_NAME = "encoder-anatomy-extbench-budget"
DATA_PATH = "/data"
MODELS_PATH = "/models"
HF_CACHE_PATH = "/hf"
EXTBENCH_MOUNT = "/extbench"
STOCK_DIR = "/models/hf_exports/qwen35_4b_stock"

# 16px patch x 2x2 spatial merge -> 32x32 px per merged vision token.
QWEN35_PX_PER_TOKEN = 32 * 32
SIZE_AREA_MAX = 16_777_216   # the processor's own default longest_edge (uncapped here)
SIZE_AREA_MIN = 65_536       # its default shortest_edge

BENCHES = ("olmocr", "omnidoc")


def _cap(tokens: int) -> dict:
    return {"shortest_edge": SIZE_AREA_MIN, "longest_edge": tokens * QWEN35_PX_PER_TOKEN}


def _floor(tokens: int) -> dict:
    return {"shortest_edge": tokens * QWEN35_PX_PER_TOKEN, "longest_edge": SIZE_AREA_MAX}


# render_dim overrides the bench's own render size (olmOCR: target longest edge;
# OmniDoc: longest-edge cap). 0 = the bench's convention, untouched.
RUNGS: dict[str, dict] = {
    "b280":    {"nominal_tokens": 280,  "size": _cap(280),    "render_dim": 0},
    "b560":    {"nominal_tokens": 560,  "size": _cap(560),    "render_dim": 0},
    "b1120":   {"nominal_tokens": 1120, "size": None,         "render_dim": 0},
    "b2240up": {"nominal_tokens": 2240, "size": _floor(2240), "render_dim": 0},
    "b2240px": {"nominal_tokens": 2240, "size": None,         "render_dim": 1822},
}


def candidate_name(rung: str, model_dir: str = STOCK_DIR) -> str:
    return f"{model_dir.rstrip('/').split('/')[-1]}_{rung}"


# overridable so a per-rung sweep runs under its own app name and a `modal app stop`
# aimed at one rung cannot take the others down (results.md §extbench ops lesson).
app = modal.App(_os.environ.get("BUDGET_APP", APP_NAME))

data_volume = modal.Volume.from_name("ocr-rl-trainer-data-0", create_if_missing=False)
models_volume = modal.Volume.from_name("ocr-rl-trainer-models-0", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

infer_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("poppler-utils")
    .pip_install("vllm", "pillow", "olmocr", "huggingface_hub")
    .env({"HF_HOME": HF_CACHE_PATH, "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
          "VLLM_USE_FLASHINFER_SAMPLER": "0"})
    .add_local_dir(str(EXTBENCH_DIR), EXTBENCH_MOUNT)
)

collect_image = (modal.Image.debian_slim(python_version="3.12")
                 .add_local_python_source("modal_extbench_budget"))

_VOLUMES = {DATA_PATH: data_volume, MODELS_PATH: models_volume, HF_CACHE_PATH: hf_cache_volume}


def _extbench(module: str):
    """extbench's own module, imported from the mount — never a fork of its logic."""
    import importlib
    import sys

    if EXTBENCH_MOUNT not in sys.path:
        sys.path.insert(0, EXTBENCH_MOUNT)
    return importlib.import_module(module)


@app.function(image=infer_image, gpu="H200:1", volumes=_VOLUMES,
              secrets=[modal.Secret.from_name("huggingface")], timeout=8 * 60 * 60)
def infer(bench: str, rung: str, model: str, prompt: str) -> dict:
    import base64
    import io
    import time

    from PIL import Image as PILImage
    from transformers import AutoConfig
    from vllm import LLM, SamplingParams

    spec = RUNGS[rung]
    candidate = candidate_name(rung, model)
    image_token_id = int(AutoConfig.from_pretrained(
        model, trust_remote_code=True).to_dict()["image_token_id"])

    if bench == "olmocr":
        mod = _extbench("bench_olmocr")
        from olmocr.data.renderpdf import render_pdf_to_base64png

        root = Path(mod.ROOT)
        dim = spec["render_dim"] or mod.TARGET_DIM
        pdfs = sorted((root / "bench_data" / "pdfs").rglob("*.pdf"))
        out_root = root / "bench_data" / candidate

        def out_path(p: Path) -> Path:
            return (out_root / p.parent.relative_to(root / "bench_data" / "pdfs")
                    / f"{p.stem}_pg1_repeat1.md")

        def to_uri(p: Path) -> tuple[str, tuple[int, int]]:
            b64 = render_pdf_to_base64png(str(p), page_num=1, target_longest_image_dim=dim)
            with PILImage.open(io.BytesIO(base64.b64decode(b64))) as im:
                wh = im.size
            return f"data:image/png;base64,{b64}", wh

        inputs, batch = pdfs, 64
    elif bench == "omnidoc":
        mod = _extbench("bench_omnidoc")
        root = Path(mod.ROOT)
        dim = spec["render_dim"] or mod.MAX_IMAGE_DIM
        gt = json.loads((root / "OmniDocBench.json").read_text())
        inputs = [root / "images" / n
                  for n in sorted({Path(p["page_info"]["image_path"]).name for p in gt})]
        out_root = root / "preds" / candidate

        def out_path(p: Path) -> Path:
            return out_root / (p.stem + ".md")

        def to_uri(p: Path) -> tuple[str, tuple[int, int]]:
            img = PILImage.open(p).convert("RGB")
            w, h = img.size
            if max(w, h) > dim:
                sc = dim / max(w, h)
                img = img.resize((int(w * sc), int(h * sc)), PILImage.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return ("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
                    img.size)

        batch = 48
    else:
        raise ValueError(f"unknown bench {bench!r}")

    todo = [p for p in inputs if not out_path(p).exists()]
    print(f"[{bench}/{rung}] {len(inputs)} inputs, {len(todo)} to infer, "
          f"render_dim={dim}, size={spec['size']}", flush=True)

    tele_path = root / "telemetry" / f"{candidate}.json"
    tele_path.parent.mkdir(parents=True, exist_ok=True)
    tele = json.loads(tele_path.read_text()) if tele_path.exists() else {}
    pages: dict = tele.get("pages", {})

    if todo:
        kwargs = {"mm_processor_kwargs": {"size": spec["size"]}} if spec["size"] else {}
        llm = LLM(model=model, trust_remote_code=True, max_model_len=16384,
                  limit_mm_per_prompt={"image": 1}, gpu_memory_utilization=0.85, **kwargs)
        sp = SamplingParams(temperature=0.0, max_tokens=8192)
        done = 0
        for i in range(0, len(todo), batch):
            chunk = todo[i:i + batch]
            rendered = [to_uri(p) for p in chunk]
            convs = [[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": uri}},
                {"type": "text", "text": prompt}]}] for uri, _ in rendered]
            t0 = time.perf_counter()
            outs = llm.chat(convs, sp, chat_template_kwargs={"enable_thinking": False})
            wall = time.perf_counter() - t0
            for p, (_, wh), o in zip(chunk, rendered, outs):
                op = out_path(p)
                op.parent.mkdir(parents=True, exist_ok=True)
                op.write_text(mod._postprocess(o.outputs[0].text))
                pages[p.stem] = {
                    "image_wh": list(wh),
                    "image_tokens": sum(1 for t in o.prompt_token_ids if t == image_token_id),
                    "prompt_tokens": len(o.prompt_token_ids),
                    "gen_tokens": len(o.outputs[0].token_ids),
                    "batch_wall_s": round(wall, 3),
                    "batch_size": len(chunk),
                }
            done += len(chunk)
            tele["pages"] = pages
            tele_path.write_text(json.dumps(tele))
            print(f"[{bench}/{rung}] {done}/{len(todo)} ({wall:.1f}s/batch)", flush=True)
            data_volume.commit()

    summary = telemetry_summary(pages)
    tele.update({"bench": bench, "rung": rung, "candidate": candidate, "model": model,
                 "render_dim": dim, "size": spec["size"],
                 "nominal_tokens": spec["nominal_tokens"],
                 "image_token_id": image_token_id, "pages": pages, **summary})
    tele_path.write_text(json.dumps(tele))
    data_volume.commit()
    return {k: v for k, v in tele.items() if k != "pages"}


def telemetry_summary(pages: dict) -> dict:
    """Realized budget + cost per page. Wall time is throughput at the serving batch
    size (a batch's wall clock spread over its pages), not single-request latency."""
    if not pages:
        return {"n_pages": 0}
    n = len(pages)
    img = sorted(p["image_tokens"] for p in pages.values())
    gen = [p["gen_tokens"] for p in pages.values()]
    # each page carries its share of its batch's wall clock, so the total is right
    # whatever the batch boundaries were (including across a resume).
    wall = sum(p["batch_wall_s"] / p["batch_size"] for p in pages.values())
    return {
        "n_pages": n,
        "image_tokens_mean": round(sum(img) / n, 1),
        "image_tokens_median": img[n // 2],
        "image_tokens_min": img[0],
        "image_tokens_max": img[-1],
        "prompt_tokens_mean": round(sum(p["prompt_tokens"] for p in pages.values()) / n, 1),
        "gen_tokens_mean": round(sum(gen) / n, 1),
        "wall_s_per_page": round(wall / n, 3),
        "gpu_s_total": round(wall, 1),
    }


@app.function(image=collect_image, cpu=2.0, timeout=1800,
              volumes={DATA_PATH: data_volume})
def collect_reports(candidates: dict, benches: list) -> dict:
    """{rung: candidate} -> the benchmarks' OWN report files + our telemetry sidecars."""
    data_volume.reload()
    root = Path(DATA_PATH) / "extbench"
    out: dict[str, dict] = {}
    for rung, candidate in candidates.items():
        out[rung] = {}
        for bench in benches:
            if bench == "olmocr":
                path = root / "olmocr" / "reports" / candidate / "summary.txt"
                preds = list((root / "olmocr" / "bench_data" / candidate).rglob("*.md"))
                payload = None
                if path.exists():
                    text = path.read_text()
                    marker = text.rfind("Final Summary")
                    payload = text[marker:] if marker >= 0 else text[-8000:]
            else:
                results = root / "omnidoc" / "results" / candidate
                path = results / f"{candidate}_quick_match_metric_result.json"
                if not path.exists():
                    found = (sorted(results.glob("*_quick_match_metric_result.json"))
                             if results.is_dir() else [])
                    path = found[-1] if found else path
                preds = list((root / "omnidoc" / "preds" / candidate).glob("*.md"))
                payload = json.loads(path.read_text()) if path.exists() else None
            tele = root / bench / "telemetry" / f"{candidate}.json"
            tele_payload = None
            if tele.exists():
                full = json.loads(tele.read_text())
                tele_payload = {k: v for k, v in full.items() if k != "pages"}
                if not tele_payload.get("n_pages"):
                    tele_payload.update(telemetry_summary(full.get("pages", {})))
            out[rung][bench] = {"found": payload is not None, "path": str(path),
                                "payload": payload, "n_predictions": len(preds),
                                "telemetry": tele_payload}
    return out


@app.function(image=infer_image, gpu="H200:1", volumes=_VOLUMES, timeout=3600)
def verify_knob(model: str, prompt: str, engine_size: dict | None = None) -> dict:
    """Does the SERVING path realize the budget? Count image-placeholder tokens.

    The measurement is `prompt_token_ids.count(image_token_id)` per request — the
    literal number of vision tokens the LM is handed — under the engine-level knob, the
    per-request knob, and the raw HF processor, on the same official 1288px renders.
    Two negative controls matter: transformers 5.15's Qwen2VLImageProcessor IGNORES a
    bare `max_pixels=` call kwarg (only the `size` AREA dict drives smart_resize), while
    vLLM honors both because its Qwen processing info rewrites min/max_pixels into that
    dict. A knob that silently did nothing would show as an unchanged count.
    """
    import base64
    import io

    from olmocr.data.renderpdf import render_pdf_to_base64png
    from PIL import Image as PILImage
    from transformers import AutoConfig, AutoProcessor
    from vllm import LLM, SamplingParams

    import vllm

    mod = _extbench("bench_olmocr")
    pdfs = sorted((Path(mod.ROOT) / "bench_data" / "pdfs").rglob("*.pdf"))[:4]
    b64s = [render_pdf_to_base64png(str(p), page_num=1,
                                    target_longest_image_dim=mod.TARGET_DIM) for p in pdfs]
    imgs = [PILImage.open(io.BytesIO(base64.b64decode(b))).convert("RGB") for b in b64s]
    image_token_id = int(AutoConfig.from_pretrained(
        model, trust_remote_code=True).to_dict()["image_token_id"])

    proc = AutoProcessor.from_pretrained(model, trust_remote_code=True)
    hf = {}
    for label, kw in (("default", {}),
                      ("bare_max_pixels", {"max_pixels": _cap(280)["longest_edge"]}),
                      ("size_area_cap", {"size": _cap(280)}),
                      ("size_area_floor", {"size": _floor(2240)})):
        thw = proc.image_processor(images=[imgs[0]], return_tensors="pt",
                                   **kw)["image_grid_thw"][0].tolist()
        hf[label] = {"grid_thw": thw, "merged_tokens": thw[0] * thw[1] * thw[2] // 4}

    kwargs = {"mm_processor_kwargs": {"size": engine_size}} if engine_size else {}
    llm = LLM(model=model, trust_remote_code=True, max_model_len=16384,
              limit_mm_per_prompt={"image": 1}, gpu_memory_utilization=0.85, **kwargs)
    sp = SamplingParams(temperature=0.0, max_tokens=32)

    def counts(outs):
        return {"image_tokens": [sum(1 for t in o.prompt_token_ids if t == image_token_id)
                                 for o in outs],
                "prompt_tokens": [len(o.prompt_token_ids) for o in outs],
                "text0": outs[0].outputs[0].text[:120]}

    convs = [[{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b}"}},
        {"type": "text", "text": prompt}]}] for b in b64s]
    chat = llm.chat(convs, sp, chat_template_kwargs={"enable_thinking": False})

    text = proc.apply_chat_template(
        [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}],
        tokenize=False, add_generation_prompt=True, enable_thinking=False)
    per_request = {}
    for label, mmk in (("size_area_cap", {"size": _cap(280)}),
                       ("size_area_floor", {"size": _floor(2240)}),
                       ("bare_max_pixels", {"max_pixels": _cap(280)["longest_edge"]})):
        outs = llm.generate([{"prompt": text, "multi_modal_data": {"image": im},
                              "mm_processor_kwargs": mmk} for im in imgs], sp)
        per_request[label] = counts(outs)
    plain = llm.generate([{"prompt": text, "multi_modal_data": {"image": im}}
                          for im in imgs], sp)
    return {
        "vllm_version": vllm.__version__,
        "model": model,
        "image_token_id": image_token_id,
        "render_wh": [list(i.size) for i in imgs],
        "engine_size": engine_size,
        "hf_processor_direct": hf,
        "vllm_chat_under_engine_knob": counts(chat),
        # no per-request kwargs, so this arm INHERITS engine_size — its value is the
        # token-for-token identity with the chat path, not a second default reading.
        "vllm_generate_inherits_engine_knob": {
            **counts(plain),
            "prompt_ids_match_chat": [list(a.prompt_token_ids) == list(b.prompt_token_ids)
                                      for a, b in zip(chat, plain)],
        },
        "vllm_generate_per_request_knob": per_request,
    }


score_image = (modal.Image.debian_slim(python_version="3.12")
               .apt_install("poppler-utils")
               .pip_install("olmocr[bench]", "numpy")
               .env({"PLAYWRIGHT_BROWSERS_PATH": "/ms-playwright"})
               .run_commands("playwright install-deps chromium",
                             "playwright install chromium"))


@app.function(image=score_image, cpu=16.0, memory=32768, timeout=6 * 60 * 60,
              volumes={DATA_PATH: data_volume})
def score_olmocr(candidate: str) -> str:
    """`python -m olmocr.bench.benchmark` — the OFFICIAL scorer, unmodified, invoked
    with a container-LOCAL HOME.

    extbench's own score() points HOME at the data volume so the KaTeX equation-render
    cache persists. Five candidates scoring concurrently then hammer one volume path
    with small-file writes and the run does not finish inside its 3h timeout; a local
    HOME trades cache reuse for a filesystem that keeps up. Reports land in extbench's
    own layout, so nothing downstream distinguishes the two paths.
    """
    import os
    import subprocess
    from pathlib import Path

    root = Path(DATA_PATH) / "extbench" / "olmocr"
    home = Path("/tmp/olmocr_home")
    home.mkdir(parents=True, exist_ok=True)
    rep_dir = root / "reports" / candidate
    rep_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["python", "-m", "olmocr.bench.benchmark", "--dir", str(root / "bench_data"),
         "--candidate", candidate, "--test_report", str(rep_dir / "report.html"),
         "--output_failed", str(rep_dir / "failed.jsonl")],
        capture_output=True, text=True, env=dict(os.environ, HOME=str(home)))
    (rep_dir / "summary.txt").write_text(proc.stdout)
    data_volume.commit()
    if proc.returncode != 0:
        print("STDERR:", proc.stderr[-2000:])
        raise RuntimeError(f"benchmark failed rc={proc.returncode}")
    return proc.stdout[-3000:]


@app.function(image=collect_image, cpu=2.0, timeout=1800,
              volumes={DATA_PATH: data_volume})
def diff_predictions(left: str, right: str) -> dict:
    """Per-page equality of two olmOCR candidates' predictions.

    The default rung re-runs what extbench's own `bench_olmocr.py infer` already ran, so
    this is the check that this module is a re-entry into that path and not a fork of
    it: at the same budget the two candidates' 1,403 files must match.
    """
    data_volume.reload()
    root = Path(DATA_PATH) / "extbench" / "olmocr" / "bench_data"
    lf = {p.relative_to(root / left): p for p in (root / left).rglob("*.md")}
    rf = {p.relative_to(root / right): p for p in (root / right).rglob("*.md")}
    shared = sorted(set(lf) & set(rf))
    same = [k for k in shared if lf[k].read_bytes() == rf[k].read_bytes()]
    return {"left": left, "right": right, "n_left": len(lf), "n_right": len(rf),
            "n_shared": len(shared), "n_identical": len(same),
            "differing": [str(k) for k in shared if k not in set(same)][:20]}


def assemble_bundle(reports: dict, config: dict) -> dict:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from modal_extbench_bridge import omnidoc_slices, parse_olmocr_summary

    parse = {"olmocr": parse_olmocr_summary, "omnidoc": omnidoc_slices}
    rungs: dict[str, dict] = {}
    for rung, benches in reports.items():
        rungs[rung] = {"spec": RUNGS.get(rung)}
        for bench, entry in benches.items():
            if not entry.get("found"):
                rungs[rung][bench] = {"status": "missing", "path": entry.get("path"),
                                      "telemetry": entry.get("telemetry")}
                continue
            rungs[rung][bench] = {
                "status": "ok",
                "path": entry["path"],
                "n_predictions": entry.get("n_predictions"),
                "telemetry": entry.get("telemetry"),
                **parse[bench](entry["payload"]),
            }
    return {
        "experiment": "vision token budget vs external OCR benchmarks — stock Qwen3.5-4B",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "px_per_merged_token": QWEN35_PX_PER_TOKEN,
        "rungs": rungs,
        "config": config,
    }


def _fmt(v, nd: int = 1) -> str:
    if v is None:
        return "—"
    return f"{v:.{nd}f}" if isinstance(v, float) else str(v)


def markdown_tables(bundle: dict) -> str:
    """Raw budget x score tables (overall + every sub-slice) for docs/results.md."""
    rungs = bundle["rungs"]
    order = [r for r in RUNGS if r in rungs]
    out: list[str] = []

    def tele(rung: str, bench: str, key):
        t = (rungs[rung].get(bench) or {}).get("telemetry") or {}
        return t.get(key)

    ok = [r for r in order if (rungs[r].get("olmocr") or {}).get("status") == "ok"]
    if ok:
        head = "| rung | " + " | ".join(ok) + " |"
        rule = "|---|" + "---|" * len(ok)
        out += ["## olmOCR-bench — official scorer, 1,403 pages (pass rate %)", "",
                head, rule,
                "| realized image tokens (mean) | " + " | ".join(
                    _fmt(tele(r, "olmocr", "image_tokens_mean")) for r in ok) + " |",
                "| realized image tokens (min–max) | " + " | ".join(
                    f"{tele(r, 'olmocr', 'image_tokens_min')}–"
                    f"{tele(r, 'olmocr', 'image_tokens_max')}" for r in ok) + " |",
                "| render longest edge (px) | " + " | ".join(
                    str(tele(r, "olmocr", "render_dim")) for r in ok) + " |",
                "| GPU s / page (H200, batch 64) | " + " | ".join(
                    _fmt(tele(r, "olmocr", "wall_s_per_page"), 2) for r in ok) + " |",
                "| generated tokens / page (mean) | " + " | ".join(
                    _fmt(tele(r, "olmocr", "gen_tokens_mean")) for r in ok) + " |",
                "| **overall** (macro over jsonls) | " + " | ".join(
                    _fmt(rungs[r]["olmocr"]["overall"]) for r in ok) + " |",
                "| ±95% CI | " + " | ".join(
                    _fmt(rungs[r]["olmocr"]["ci95"]) for r in ok) + " |"]
        keys: list[str] = []
        for r in ok:
            for k in rungs[r]["olmocr"]["test_types"]:
                if k not in keys:
                    keys.append(k)
        for k in sorted(keys):
            n = next((rungs[r]["olmocr"]["test_types"][k]["n_tests"] for r in ok
                      if k in rungs[r]["olmocr"]["test_types"]), "?")
            out.append(f"| {k} (n={n}) | " + " | ".join(
                _fmt((rungs[r]["olmocr"]["test_types"].get(k) or {}).get("score"))
                for r in ok) + " |")
        files: list[str] = []
        for r in ok:
            for k in rungs[r]["olmocr"]["by_file"]:
                if k not in files:
                    files.append(k)
        for k in sorted(files):
            out.append(f"| {k} | " + " | ".join(
                _fmt((rungs[r]["olmocr"]["by_file"].get(k) or {}).get("score"))
                for r in ok) + " |")
        out.append("")

    ok = [r for r in order if (rungs[r].get("omnidoc") or {}).get("status") == "ok"]
    if ok:
        out += ["## OmniDocBench v1.6 — official repro container, 1,651 pages", "",
                "| rung | " + " | ".join(ok) + " |", "|---|" + "---|" * len(ok),
                "| realized image tokens (mean) | " + " | ".join(
                    _fmt(tele(r, "omnidoc", "image_tokens_mean")) for r in ok) + " |",
                "| GPU s / page (H200, batch 48) | " + " | ".join(
                    _fmt(tele(r, "omnidoc", "wall_s_per_page"), 2) for r in ok) + " |"]
        for k in ("overall", "text_block_edit", "table_teds", "table_teds_structure_only",
                  "table_edit", "display_formula_cdm", "display_formula_edit",
                  "reading_order_edit"):
            out.append(f"| {k} | " + " | ".join(
                _fmt(rungs[r]["omnidoc"].get(k), 4) for r in ok) + " |")
        out.append("")
    return "\n".join(out)


@app.local_entrypoint()
def main(bench: str = "", rung: str = "", model: str = STOCK_DIR, collect: bool = False,
         rungs: str = ",".join(RUNGS), benches: str = ",".join(BENCHES),
         launch: bool = False, diff_against: str = "", verify: bool = False,
         score: bool = False):
    import hashlib

    prompt_path = EXTBENCH_DIR / "prompt_cost_effective.json"
    prompt = json.loads(prompt_path.read_text())["prompt"]
    rung_list = [r for r in rungs.split(",") if r]
    bench_list = [b for b in benches.split(",") if b]
    unknown = (set(rung_list) - set(RUNGS)) | ({rung} - set(RUNGS) if rung else set())
    if unknown:
        raise SystemExit(f"unknown rungs {sorted(unknown)}")

    if verify:
        report = verify_knob.remote(model, prompt, _cap(280))
        KNOB_PATH.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        print(f"[budget] wrote {KNOB_PATH}")
    if bench and rung:
        print(json.dumps(infer.remote(bench, rung, model, prompt), indent=2))
    if score:
        print(score_olmocr.remote(candidate_name(rung, model)))
    if launch:
        for b in bench_list:
            script = f"bench_{'olmocr' if b == 'olmocr' else 'omnidoc'}.py"
            for r in rung_list:
                cand = candidate_name(r, model)
                print(f"BENCH_APP=bench-{b}-{r} modal run --detach {script} "
                      f"--candidate {cand} --stage score")
    if diff_against:
        print(json.dumps(diff_predictions.remote(candidate_name(rung or "b1120", model),
                                                 diff_against), indent=2))
    if collect:
        candidates = {r: candidate_name(r, model) for r in rung_list}
        config = {
            "model": model,
            "candidates": candidates,
            "rungs": {r: RUNGS[r] for r in rung_list},
            "serving": "vLLM 0.27.1, greedy, enable_thinking=false, extbench render/"
                       "prompt/postprocess imported from ocr_postraining/extbench",
            "knob": "mm_processor_kwargs={'size': {shortest_edge, longest_edge}} "
                    "(pixel AREAS -> smart_resize)",
            "prompt_sha256": hashlib.sha256(prompt_path.read_bytes()).hexdigest(),
            "knob_verification": (json.loads(KNOB_PATH.read_text())
                                  if KNOB_PATH.exists() else None),
        }
        bundle = assemble_bundle(collect_reports.remote(candidates, bench_list), config)
        LOCAL_OUT_PATH.write_text(json.dumps(bundle, indent=2) + "\n")
        print(f"[budget] wrote {LOCAL_OUT_PATH}")
        print(markdown_tables(bundle))
