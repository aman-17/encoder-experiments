"""Shortcut baselines for the pilot probe table: labels predicted from
(x, y) coordinates alone, and series_id from local pixel color alone.
No encoder features involved. Doc-level split, same discipline as probe_fit."""
import json
import sys
import hashlib
import collections
import numpy as np
from sklearn.linear_model import LogisticRegression, Ridge

ROOT = "/Users/aman/programs/experimental/encoder-experiments/data/pilot_1k"
RNG = np.random.default_rng(0)


def is_test(doc_id):
    return int(hashlib.md5(doc_id.encode()).hexdigest(), 16) % 5 == 0


def load(families):
    rows = collections.defaultdict(list)
    with open(f"{ROOT}/probes.jsonl") as f:
        for line in f:
            r = json.loads(line)
            if r["probe"] in families:
                rows[r["probe"]].append(r)
    return rows


def fit_cls(X, y, split, shuffle=False):
    Xtr, ytr, Xte, yte = X[~split], y[~split], X[split], y[split]
    if shuffle:
        ytr = RNG.permutation(ytr)
    clf = LogisticRegression(max_iter=2000, n_jobs=-1)
    clf.fit(Xtr, ytr)
    return float((clf.predict(Xte) == yte).mean())


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[:, 0], a[:, 1], a[:, 0] + a[:, 2], a[:, 1] + a[:, 3]
    bx0, by0, bx1, by1 = b[:, 0], b[:, 1], b[:, 0] + b[:, 2], b[:, 1] + b[:, 3]
    ix = np.clip(np.minimum(ax1, bx1) - np.maximum(ax0, bx0), 0, None)
    iy = np.clip(np.minimum(ay1, by1) - np.maximum(ay0, by0), 0, None)
    inter = ix * iy
    union = a[:, 2] * a[:, 3] + np.clip(b[:, 2], 0, None) * np.clip(b[:, 3], 0, None) - inter
    return inter / np.maximum(union, 1e-9)


def main():
    fams = ["glyph_id", "cell_row", "cell_col", "series_id", "pl1_class", "pl2_extent"]
    rows = load(fams)
    out = {}

    for fam in fams:
        rs = rows[fam]
        X = np.array([r["point_xy"] for r in rs], dtype=np.float64)
        split = np.array([is_test(r["doc_id"]) for r in rs])
        if fam == "pl2_extent":
            y = np.array([r["label"] for r in rs], dtype=np.float64)
            reg = Ridge().fit(X[~split], y[~split])
            pred = reg.predict(X[split])
            out[fam] = {"coord_mIoU": float(iou(pred, y[split]).mean()),
                        "n_test": int(split.sum())}
        else:
            labs = sorted({r["label"] for r in rs})
            lut = {l: i for i, l in enumerate(labs)}
            y = np.array([lut[r["label"]] for r in rs])
            maj = collections.Counter(y[split]).most_common(1)[0][1] / split.sum()
            out[fam] = {"coord_acc": fit_cls(X, y, split),
                        "coord_acc_shuffled": fit_cls(X, y, split, shuffle=True),
                        "majority": float(maj), "n_test": int(split.sum())}
        print(fam, out[fam], flush=True)

    # color baseline: mean RGB in a 9x9 window at the point
    try:
        from PIL import Image
        paths = {}
        with open(f"{ROOT}/images.jsonl") as f:
            for line in f:
                r = json.loads(line)
                paths[r["image_id"]] = r["image_path"]
        rs = rows["series_id"]
        by_img = collections.defaultdict(list)
        for i, r in enumerate(rs):
            by_img[r["image_id"]].append(i)
        X = np.zeros((len(rs), 3))
        for img_id, idxs in by_img.items():
            p = paths[img_id]
            if not p.startswith("/"):
                p = f"{ROOT}/{p}"
            im = np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
            H, W = im.shape[:2]
            for i in idxs:
                x, y = rs[i]["point_xy"]
                cx, cy = int(x * W), int(y * H)
                win = im[max(0, cy - 4):cy + 5, max(0, cx - 4):cx + 5]
                X[i] = win.reshape(-1, 3).mean(0) / 255.0
        labs = sorted({r["label"] for r in rs})
        lut = {l: i for i, l in enumerate(labs)}
        y = np.array([lut[r["label"]] for r in rs])
        split = np.array([is_test(r["doc_id"]) for r in rs])
        out["series_id"]["color_acc"] = fit_cls(X, y, split)
        out["series_id"]["color_acc_shuffled"] = fit_cls(X, y, split, shuffle=True)
        Xb = np.hstack([X, np.array([r["point_xy"] for r in rs])])
        out["series_id"]["color_plus_coord_acc"] = fit_cls(Xb, y, split)
        print("series_id+color", out["series_id"], flush=True)
    except Exception as e:
        print("color baseline failed:", e, file=sys.stderr)

    with open(f"{sys.path[0]}/shortcut_baselines.json", "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
