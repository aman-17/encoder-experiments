"""One-shot authoritative fetch of /vol/frontier dirs via a container mount.

The `modal volume ls/get` CLI has been serving inconsistent (stale) views of
the encoder-anatomy-pilot volume during concurrent commits; a container mount
after reload() sees the latest committed state. Returns file contents inline
(small text files) so no CLI download is involved.
"""
from __future__ import annotations

import modal

app = modal.App("encoder-anatomy-frontier-fetch")
vol = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
image = modal.Image.debian_slim(python_version="3.12")


@app.function(image=image, volumes={"/vol": vol}, timeout=600)
def fetch(subdirs: list[str]) -> dict:
    from pathlib import Path

    vol.reload()
    out: dict[str, dict[str, str]] = {}
    for sub in subdirs:
        d = Path("/vol/frontier") / sub
        files = {}
        if d.exists():
            for p in sorted(d.iterdir()):
                if p.is_file():
                    files[p.name] = p.read_text(encoding="utf-8", errors="replace")
        out[sub] = files
    return out


@app.local_entrypoint()
def main(subdirs: str = "qwen3_vl@196,qwen3_vl@784,deepseek_ocr@256",
         dest: str = "frontier_fetch"):
    import json
    from pathlib import Path

    got = fetch.remote([s for s in subdirs.split(",") if s])
    root = Path(dest)
    counts = {}
    for sub, files in got.items():
        d = root / sub
        d.mkdir(parents=True, exist_ok=True)
        for name, content in files.items():
            (d / name).write_text(content, encoding="utf-8")
        counts[sub] = sum(1 for n in files if n.endswith(".md"))
    print(json.dumps(counts))
