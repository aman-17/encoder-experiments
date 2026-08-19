"""Vision TOKEN BUDGET vs ParseBench, on the trained soup checkpoint.

The olmOCR/OmniDoc twin of this sweep is `modal_extbench_budget.py` (stock Qwen3.5-4B,
external scorers). Here the model is OUR post-trained checkpoint
(`/models/hf_exports/parsebench__soupx3070p0490`) and the scorer is the internal
ParseBench harness, so the sweep answers the serving question directly: how many merged
vision tokens does the deployed checkpoint actually need per page, and does it still gain
above the resolution it was trained and evaluated at.

Nothing about the eval is forked. Inference and scoring are the training pipeline's own
`eval_recipe.sh` path (merge-free `--export-name` mode, the recipe's `@parsebench_adapter`
prompt/postprocess, the genuine `parse_bench` scorers). This module owns three things: the
rung ladder, the knob VERIFICATION on the serve image, and the collect/table step that
reads each rung's `report.json` off the data volume.

The dial is the same single knob: `mm_processor_kwargs={"size": {...}}` handed to the vLLM
serve, whose shortest/longest_edge are pixel AREAS driving `smart_resize`. A cap
(longest_edge) buys fewer tokens for the same render; a floor (shortest_edge) buys MORE
tokens than native by upscaling the same information. Qwen3.5's ViT is 16px patches with a
2x2 merge, so one merged token covers a 32x32 tile: merged_tokens ~= pixels / 1024.

ParseBench renders at 150 DPI (`infer.py` RENDER_DPI, the qwen3_5 provider's parity
setting), so a US-Letter page is 1275x1650 = 2,080 merged tokens NATIVE (measured, not
assumed: mean 2,194 / median 2,080 over all 1,581 pages) — roughly double olmOCR's 1288px
convention, and roughly 2.6x the ~790 tokens the training parquet bakes in at
max_image_dim=1024. The ladder is therefore centered on ParseBench's own native budget,
not on the extbench one.

    # 0. does the serve path realize the budget at all? (must pass before spending evals)
    uv run modal run modal_parsebench_budget.py --verify                        # native counts
    uv run modal run modal_parsebench_budget.py --verify --engine-size-tokens 512
    uv run modal run modal_parsebench_budget.py --census                        # cost axis
    # 1. one eval per rung, sequential, on the training pipeline's own harness
    ./sweep_parsebench_budget.sh
    # 2. collect every rung's report.json into one bundle + tables
    uv run modal run modal_parsebench_budget.py --collect
"""

from __future__ import annotations

import json
import os as _os
from datetime import datetime, timezone
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = REPO_ROOT.parent / "ocr_postraining" / "training" / "training_pipeline"
LOCAL_OUT_PATH = REPO_ROOT / "validation" / "token_budget_parsebench.json"
KNOB_PATH = REPO_ROOT / "validation" / "token_budget_parsebench_knob_probe.json"

APP_NAME = "encoder-anatomy-parsebench-budget"
DATA_PATH = "/data"
MODELS_PATH = "/models"
PBDATA_PATH = "/pbdata"
HF_CACHE_PATH = "/hf"

EXPORT = "parsebench__soupx3070p0490"          # the served weights (one physical copy)
BASE_MODEL = "Qwen/Qwen3.5-4B"                 # serve.py serves the export under the BASE tokenizer
SERVE_IMAGE = "nvcr.io/nvidia/vllm:26.03-py3"  # the recipe's own P.SERVE_IMAGE
RENDER_DPI = 150                               # parse_rl_utils/parsebench/infer.py RENDER_DPI

# Same processor facts as modal_extbench_budget: 16px patch x 2x2 spatial merge -> 32x32
# px per merged vision token; the two bounds are the processor's own size-dict defaults.
QWEN35_PX_PER_TOKEN = 32 * 32
SIZE_AREA_MAX = 16_777_216
SIZE_AREA_MIN = 65_536


def _cap(tokens: int) -> dict:
    return {"shortest_edge": SIZE_AREA_MIN, "longest_edge": tokens * QWEN35_PX_PER_TOKEN}


def _floor(tokens: int) -> dict:
    return {"shortest_edge": tokens * QWEN35_PX_PER_TOKEN, "longest_edge": SIZE_AREA_MAX}


def _force(tokens: int) -> dict:
    """Both bounds at one budget: every page lands on it, whatever its native size."""
    return {"shortest_edge": tokens * QWEN35_PX_PER_TOKEN,
            "longest_edge": tokens * QWEN35_PX_PER_TOKEN}


# `size` is the serve-side dial (same 150-DPI render, different token count); `dpi` moves the
# client-side render instead. Measured on the benchmark itself (token_census): native is
# mean 2194 / median 2080 merged tokens, so the caps below bind on essentially every page and
# the ladder is centered on ParseBench's own budget rather than olmOCR's.
#
# The two 4,096 arms are a MATCHED pair, both FORCED to the same budget rather than one floored
# and one free. 4,096 tokens is 4.19M px, which is exactly a Letter page at 212 DPI — so the px
# arm renders that budget natively while the up arm interpolates the 150-DPI render to the same
# grid. Same token count, same geometry, different amount of real information: the Silico
# pixel-shuffle contrast with the token count held fixed rather than merely matched on average.
# Forcing also caps the tail (one ParseBench page is 16,241 tokens native), which keeps the pair
# inside the 32k serve context instead of tripping infer.py's shrink-and-retry path — that
# fallback downscales the image, which would silently un-do the arm on exactly the biggest pages.
RUNGS: dict[str, dict] = {
    "b512":    {"nominal_tokens": 512,  "size": _cap(512),    "dpi": 0},
    "b1024":   {"nominal_tokens": 1024, "size": _cap(1024),   "dpi": 0},
    "b2048":   {"nominal_tokens": 2048, "size": _cap(2048),   "dpi": 0},
    "native":  {"nominal_tokens": 0,    "size": None,         "dpi": 0},
    "b4096up": {"nominal_tokens": 4096, "size": _force(4096), "dpi": 0},
    "b4096px": {"nominal_tokens": 4096, "size": _force(4096), "dpi": 212},
    # Variance control, NOT a ladder point: byte-identical config to `native`, run again under its
    # own artifact key. Greedy decoding here is not reproducible (0 of 36 sampled pages matched a
    # prior run of this checkpoint), so without a same-config repeat there is no scale against
    # which to read the ~1-point gaps at the top of the ladder.
    "nativeB": {"nominal_tokens": 0,    "size": None,         "dpi": 0},
}

DIMS = ("chart", "table", "text_content", "text_formatting")


def run_key(rung: str, export: str = EXPORT) -> str:
    """ParseBench artifact key for a rung == eval_recipe.sh's `--export-name` minus the prefix."""
    return f"{export[len('parsebench__'):]}_{rung}"


app = modal.App(_os.environ.get("PB_BUDGET_APP", APP_NAME))

data_volume = modal.Volume.from_name("ocr-rl-trainer-data-0", create_if_missing=False)
models_volume = modal.Volume.from_name("ocr-rl-trainer-models-0", create_if_missing=False)
pbdata_volume = modal.Volume.from_name("parsebench-data", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

# The serve image itself (P.SERVE_IMAGE), so the probe measures the engine that will run
# the sweep — a knob honored by some other vLLM build would prove nothing. poppler/pdf2image
# are added on top because the probe renders ParseBench PDFs exactly like infer.py does.
#
# This image's TRANSFORMERS cannot load model_type `qwen3_5` at all (vLLM 0.17.1 carries its own
# implementation and does not register the arch back into transformers' auto map), which is why
# serve.py already overrides --tokenizer to the base model. So the probe reads nothing through
# AutoConfig/AutoProcessor: it measures the serve path itself and resolves the image-pad token
# through the plain tokenizer, which does load here.
probe_image = (
    modal.Image.from_registry(SERVE_IMAGE, add_python=None)
    .apt_install("poppler-utils")
    .pip_install("pdf2image")
    .env({"HF_HOME": HF_CACHE_PATH})
)

# The census needs the HF image processor (CPU), so it gets a modern-transformers image instead
# of the nvcr one — same processor code path vLLM's newer builds use, and the probe cross-checks
# its numbers against the serve engine on real pages.
census_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("poppler-utils")
    .pip_install("vllm", "pillow", "pdf2image")
    .env({"HF_HOME": HF_CACHE_PATH})
)

collect_image = modal.Image.debian_slim(python_version="3.12")

_VOLUMES = {DATA_PATH: data_volume, MODELS_PATH: models_volume,
            PBDATA_PATH: pbdata_volume, HF_CACHE_PATH: hf_cache_volume}


def _sample_pages(n_per_group: int = 2) -> list:
    """First page of a few real ParseBench PDFs per group, at the harness's own DPI."""
    from pdf2image import convert_from_path

    out = []
    for group in ("table", "text", "chart"):
        pdfs = sorted((Path(PBDATA_PATH) / "docs" / group).glob("*.pdf"))[:n_per_group]
        for p in pdfs:
            img = convert_from_path(str(p), dpi=RENDER_DPI, first_page=1, last_page=1)[0]
            out.append((f"{group}/{p.stem}", img.convert("RGB")))
    return out


@app.function(image=probe_image, gpu="H200:1", volumes=_VOLUMES,
              secrets=[modal.Secret.from_name("huggingface")], timeout=3600)
def verify_knob(prompt: str, engine_size: dict | None = None) -> dict:
    """Does the SERVE path realize the budget on ParseBench pages? Count image tokens.

    Two things must hold before any eval is worth paying for: (a) NATIVE realized tokens are
    what the ladder is centered on — assumed numbers are how a sweep ends up measuring nothing;
    (b) the `size` dict must actually move the count under THIS vLLM build, which is older than
    the one the extbench twin verified.

    The measurement is `prompt_token_ids.count(image_pad)` per request — literally how many
    vision tokens the LM is handed — through `llm.chat`, the same OpenAI-shaped path the serve
    exposes, with the knob applied where serve.py applies it (engine level). A knob that
    silently did nothing shows up as an unchanged count, which is the whole point of running
    this before the evals rather than explaining a flat sweep afterwards.
    """
    import base64
    import io
    from collections import Counter

    from transformers import AutoTokenizer
    from vllm import LLM, SamplingParams

    import vllm

    pages = _sample_pages()
    model = f"{MODELS_PATH}/hf_exports/{EXPORT}"

    # Image-pad id via the plain tokenizer (loads here; AutoConfig for qwen3_5 does not).
    tok = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    image_token_id = tok.convert_tokens_to_ids("<|image_pad|>")
    id_source = "tokenizer:<|image_pad|>"

    kwargs = {"mm_processor_kwargs": {"size": engine_size}} if engine_size else {}
    llm = LLM(model=model, tokenizer=BASE_MODEL, trust_remote_code=True, max_model_len=32768,
              limit_mm_per_prompt={"image": 1}, gpu_memory_utilization=0.85, **kwargs)
    sp = SamplingParams(temperature=0.0, max_tokens=48)

    uris = []
    for _, img in pages:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        uris.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    convs = [[{"role": "user", "content": [{"type": "image_url", "image_url": {"url": u}},
                                           {"type": "text", "text": prompt}]}] for u in uris]
    chat = llm.chat(convs, sp, chat_template_kwargs={"enable_thinking": False})

    if image_token_id is None or image_token_id < 0:
        # Fallback: on a page-sized image the pad token dominates the prompt by orders of
        # magnitude, so the modal id IS the image token.
        image_token_id = Counter(chat[0].prompt_token_ids).most_common(1)[0][0]
        id_source = "modal prompt token id"
    return {
        "vllm_version": vllm.__version__,
        "serve_image": SERVE_IMAGE,
        "model": model,
        "tokenizer": BASE_MODEL,
        "render_dpi": RENDER_DPI,
        "image_token_id": int(image_token_id),
        "image_token_id_source": id_source,
        "engine_size": engine_size,
        "pages": [
            {"id": pid, "wh": list(img.size),
             "image_tokens": sum(1 for t in o.prompt_token_ids if t == image_token_id),
             "prompt_tokens": len(o.prompt_token_ids),
             "text_head": o.outputs[0].text[:100]}
            for (pid, img), o in zip(pages, chat)
        ],
    }


@app.function(image=census_image, cpu=8.0, memory=16384, volumes=_VOLUMES,
              secrets=[modal.Secret.from_name("huggingface")], timeout=2 * 3600)
def token_census(rungs: list) -> dict:
    """Realized merged-vision-token count for EVERY ParseBench page, per rung — the cost axis.

    CPU-only and exact: smart_resize depends on nothing but (height, width), so the real
    processor is called on a blank canvas of each page's true rasterized size instead of the
    page itself. Page size comes from poppler's own MediaBox at the rung's DPI, which is what
    pdf2image would produce, so no PDF is rendered and no sizing rule is reimplemented here.
    """
    from pdf2image.pdf2image import pdfinfo_from_path
    from PIL import Image as PILImage
    from transformers import AutoProcessor

    proc = AutoProcessor.from_pretrained(BASE_MODEL, trust_remote_code=True)
    docs = sorted(p for group in ("table", "text", "chart")
                  for p in (Path(PBDATA_PATH) / "docs" / group).glob("*.pdf"))

    sizes: list = []          # (dpi, w, h) per page, deduped across rungs sharing a DPI
    dpis = sorted({RUNGS[r]["dpi"] or RENDER_DPI for r in rungs})
    for dpi in dpis:
        for p in docs:
            try:
                info = pdfinfo_from_path(str(p))
            except Exception:  # noqa: BLE001 — a malformed PDF is a page we simply can't size
                continue
            for i in range(int(info.get("Pages", 1))):
                # "Page N size" for a per-page override, else the document-wide "Page size".
                spec = info.get(f"Page {i + 1} size") or info.get("Page size") or ""
                nums = [float(x) for x in spec.replace("x", " ").split()
                        if x.replace(".", "", 1).isdigit()][:2]
                if len(nums) != 2:
                    continue
                sizes.append((dpi, int(nums[0] * dpi / 72), int(nums[1] * dpi / 72)))

    out: dict = {"n_docs": len(docs), "rungs": {}}
    cache: dict = {}
    for rung in rungs:
        spec = RUNGS[rung]
        dpi = spec["dpi"] or RENDER_DPI
        kw = {"size": spec["size"]} if spec["size"] else {}
        counts = []
        for d, w, h in sizes:
            if d != dpi:
                continue
            key = (rung, w, h)
            if key not in cache:
                thw = proc.image_processor(images=[PILImage.new("RGB", (w, h))],
                                           return_tensors="pt", **kw)["image_grid_thw"][0].tolist()
                cache[key] = thw[0] * thw[1] * thw[2] // 4
            counts.append(cache[key])
        counts.sort()
        n = len(counts) or 1
        out["rungs"][rung] = {
            "n_pages": len(counts), "dpi": dpi, "size": spec["size"],
            "mean": round(sum(counts) / n, 1), "median": counts[n // 2] if counts else None,
            "min": counts[0] if counts else None, "max": counts[-1] if counts else None,
            "p90": counts[int(0.9 * (n - 1))] if counts else None,
        }
        print(f"[census] {rung}: {out['rungs'][rung]}", flush=True)
    return out


@app.function(image=collect_image, cpu=2.0, timeout=1800, volumes={DATA_PATH: data_volume})
def collect_reports(keys: dict) -> dict:
    """{rung: run_key} -> each rung's ParseBench report.json, as the harness wrote it."""
    data_volume.reload()
    root = Path(DATA_PATH) / "parsebench_runs"
    out: dict[str, dict] = {}
    for rung, key in keys.items():
        path = root / key / "report.json"
        out[rung] = {"key": key, "path": str(path), "found": path.exists(),
                     "payload": json.loads(path.read_text()) if path.exists() else None}
    return out


def _headline(payload: dict, dim: str):
    entry = ((payload or {}).get("dimensions") or {}).get(dim) or {}
    v = entry.get("headline")
    return v if isinstance(v, (int, float)) else None


def _metric(payload: dict, dim: str, key: str):
    v = (((payload or {}).get("dimensions") or {}).get(dim) or {}).get(
        "aggregate_metrics", {}).get(key)
    return v if isinstance(v, (int, float)) else None


def assemble_bundle(reports: dict, config: dict) -> dict:
    rungs = {}
    for rung, entry in reports.items():
        if not entry.get("found"):
            rungs[rung] = {"spec": RUNGS.get(rung), "status": "missing",
                           "key": entry.get("key"), "path": entry.get("path")}
            continue
        payload = entry["payload"]
        rungs[rung] = {
            "spec": RUNGS.get(rung), "status": "ok", "key": entry["key"],
            "path": entry["path"],
            "overall": payload.get("overall_no_layout", payload.get("overall")),
            "dimensions": {d: _headline(payload, d) for d in DIMS},
            "detail": {
                "table_grits_con": _metric(payload, "table", "avg_grits_con"),
                "table_record_match": _metric(payload, "table", "avg_table_record_match"),
                "table_tables_expected": _metric(payload, "table", "avg_tables_expected"),
                "table_tables_actual": _metric(payload, "table", "avg_tables_actual"),
                "text_content_faithfulness": _metric(
                    payload, "text_content", "avg_content_faithfulness"),
                "text_normalized_order": _metric(
                    payload, "text_content", "avg_normalized_order"),
                "chart_micro_rule_pass_rate": _metric(
                    payload, "chart", "micro_rule_pass_rate"),
            },
        }
    return {
        "experiment": "vision token budget vs ParseBench — trained soup checkpoint",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "px_per_merged_token": QWEN35_PX_PER_TOKEN,
        "export": EXPORT,
        "rungs": rungs,
        "config": config,
    }


def _fmt(v, nd: int = 4) -> str:
    return "—" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))


def markdown_tables(bundle: dict) -> str:
    rungs = bundle["rungs"]
    ok = [r for r in RUNGS if (rungs.get(r) or {}).get("status") == "ok"]
    if not ok:
        return "(no rungs scored yet)"
    head = "| rung | " + " | ".join(ok) + " |"
    rule = "|---|" + "---|" * len(ok)
    rows = [f"## ParseBench — {bundle['export']}, 4 parse dims", "", head, rule,
            "| nominal tokens | " + " | ".join(
                str(RUNGS[r]["nominal_tokens"] or "native") for r in ok) + " |",
            "| render DPI | " + " | ".join(
                str(RUNGS[r]["dpi"] or RENDER_DPI) for r in ok) + " |",
            "| **overall (no layout)** | " + " | ".join(
                _fmt(rungs[r]["overall"]) for r in ok) + " |"]
    for d in DIMS:
        rows.append(f"| {d} | " + " | ".join(
            _fmt(rungs[r]["dimensions"].get(d)) for r in ok) + " |")
    for k in ("table_grits_con", "table_record_match", "table_tables_expected",
              "table_tables_actual", "text_content_faithfulness", "text_normalized_order",
              "chart_micro_rule_pass_rate"):
        rows.append(f"| {k} | " + " | ".join(
            _fmt(rungs[r]["detail"].get(k)) for r in ok) + " |")
    return "\n".join(rows + [""])


@app.local_entrypoint()
def main(verify: bool = False, engine_size_tokens: int = 0, collect: bool = False,
         rungs: str = ",".join(RUNGS), launch: bool = False, census: bool = False):
    import hashlib

    prompt_path = PIPELINE_DIR / "prompts" / "dataprep_cost_effective.json"
    prompt = json.loads(prompt_path.read_text())["prompt"]
    rung_list = [r for r in rungs.split(",") if r]
    unknown = set(rung_list) - set(RUNGS)
    if unknown:
        raise SystemExit(f"unknown rungs {sorted(unknown)}")

    if verify:
        size = _cap(engine_size_tokens) if engine_size_tokens else None
        report = verify_knob.remote(prompt, size)
        prev = json.loads(KNOB_PATH.read_text()) if KNOB_PATH.exists() else {}
        prev[f"engine_{engine_size_tokens or 'none'}"] = report
        KNOB_PATH.write_text(json.dumps(prev, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        print(f"[pb-budget] wrote {KNOB_PATH}")
    if census:
        report = token_census.remote(rung_list)
        prev = json.loads(KNOB_PATH.read_text()) if KNOB_PATH.exists() else {}
        # merge per rung: censusing one rung after a ladder change must not drop the others
        cur = prev.setdefault("token_census", {"rungs": {}})
        cur["n_docs"] = report["n_docs"]
        cur.setdefault("rungs", {}).update(report["rungs"])
        KNOB_PATH.write_text(json.dumps(prev, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    if launch:
        for r in rung_list:
            size = RUNGS[r]["size"]
            env = [f"PB_MM_SIZE='{json.dumps({'size': size}, separators=(',', ':'))}'"] if size else []
            if RUNGS[r]["dpi"]:
                env.append(f"PB_RENDER_DPI={RUNGS[r]['dpi']}")
            print(f"PARSEBENCH_WEIGHTS_FROM={EXPORT} " + " ".join(env)
                  + f" ./eval_recipe.sh --recipe dataprep_qwen35_4b_os --version v14f_nsh_fmt_do"
                    f" --export-name parsebench__{run_key(r)} --no-stage")
    if collect:
        keys = {r: run_key(r) for r in rung_list}
        config = {
            "export": EXPORT,
            "keys": keys,
            "rungs": {r: RUNGS[r] for r in rung_list},
            "serving": f"{SERVE_IMAGE} vLLM serve, greedy, enable_thinking=false; ParseBench "
                       f"harness inference + genuine parse_bench scorers (eval_recipe.sh)",
            "knob": "vllm serve --mm-processor-kwargs {'size': {shortest_edge, longest_edge}} "
                    "(pixel AREAS -> smart_resize)",
            "render_dpi_default": RENDER_DPI,
            "prompt_sha256": hashlib.sha256(prompt_path.read_bytes()).hexdigest(),
            "knob_verification": (json.loads(KNOB_PATH.read_text())
                                  if KNOB_PATH.exists() else None),
        }
        bundle = assemble_bundle(collect_reports.remote(keys), config)
        LOCAL_OUT_PATH.write_text(json.dumps(bundle, indent=2) + "\n")
        print(f"[pb-budget] wrote {LOCAL_OUT_PATH}")
        print(markdown_tables(bundle))
