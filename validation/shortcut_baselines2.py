"""Round 2: nonlinear coordinate baselines (kNN), corpus-wide label
distributions, multi-series-only slice for series_id, palette-consistency
check, and per-slice pl2 coordinate prior."""
import json
import hashlib
import collections
import numpy as np
from sklearn.neighbors import KNeighborsClassifier

ROOT = "/Users/aman/programs/experimental/encoder-experiments/data/pilot_1k"


def is_test(doc_id):
    return int(hashlib.md5(doc_id.encode()).hexdigest(), 16) % 5 == 0


rows = collections.defaultdict(list)
with open(f"{ROOT}/probes.jsonl") as f:
    for line in f:
        r = json.loads(line)
        if r["probe"] in ("glyph_id", "cell_row", "cell_col", "series_id", "pl1_class", "pl2_extent"):
            rows[r["probe"]].append(r)

print("== corpus-wide label majority fraction ==")
for fam in ("glyph_id", "cell_row", "cell_col", "series_id"):
    labs = [r["label"] for r in rows[fam]]
    c = collections.Counter(labs)
    top = c.most_common(1)[0]
    print(fam, "n:", len(labs), "n_classes:", len(c), "majority:", top[0], f"{top[1]/len(labs):.4f}")

print("\n== kNN(50) on coordinates ==")
for fam in ("glyph_id", "cell_row", "cell_col", "series_id", "pl1_class"):
    rs = rows[fam]
    X = np.array([r["point_xy"] for r in rs])
    labs = sorted({r["label"] for r in rs})
    lut = {l: i for i, l in enumerate(labs)}
    y = np.array([lut[r["label"]] for r in rs])
    split = np.array([is_test(r["doc_id"]) for r in rs])
    knn = KNeighborsClassifier(n_neighbors=50).fit(X[~split], y[~split])
    acc = float((knn.predict(X[split]) == y[split]).mean())
    maj = collections.Counter(y[split]).most_common(1)[0][1] / split.sum()
    print(fam, f"knn_acc: {acc:.4f}  test_majority: {maj:.4f}")

print("\n== series_id restricted to n_series > 1 ==")
rs = [r for r in rows["series_id"] if r["meta"].get("n_series", 1) > 1]
print("n rows:", len(rs), "of", len(rows["series_id"]))
X = np.array([r["point_xy"] for r in rs])
labs = sorted({r["label"] for r in rs})
lut = {l: i for i, l in enumerate(labs)}
y = np.array([lut[r["label"]] for r in rs])
split = np.array([is_test(r["doc_id"]) for r in rs])
maj = collections.Counter(y[split]).most_common(1)[0][1] / split.sum()
knn = KNeighborsClassifier(n_neighbors=50).fit(X[~split], y[~split])
acc = float((knn.predict(X[split]) == y[split]).mean())
print(f"multi-series slice: knn_coord_acc {acc:.4f}  test_majority {maj:.4f}  n_test {int(split.sum())}")

print("\n== palette consistency: window color by series label (multi-series charts) ==")
from PIL import Image
paths = {}
with open(f"{ROOT}/images.jsonl") as f:
    for line in f:
        r = json.loads(line)
        paths[r["image_id"]] = r["image_path"]
by_img = collections.defaultdict(list)
for i, r in enumerate(rs):
    by_img[r["image_id"]].append(i)
C = np.zeros((len(rs), 3))
for img_id, idxs in by_img.items():
    p = paths[img_id]
    if not p.startswith("/"):
        p = f"{ROOT}/{p}"
    im = np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
    H, W = im.shape[:2]
    for i in idxs:
        x, yy = rs[i]["point_xy"]
        cx, cy = int(x * W), int(yy * H)
        win = im[max(0, cy - 4):cy + 5, max(0, cx - 4):cx + 5]
        C[i] = win.reshape(-1, 3).mean(0) / 255.0
for lab in sorted(set(y))[:4]:
    m = C[y == lab]
    print(f"label {lab}: n {len(m)}  mean RGB {m.mean(0).round(3)}  per-channel std {m.std(0).round(3)}")
knn = KNeighborsClassifier(n_neighbors=50).fit(C[~split], y[~split])
acc = float((knn.predict(C[split]) == y[split]).mean())
print(f"multi-series color kNN acc: {acc:.4f} (majority {maj:.4f})")
Xb = np.hstack([C, X])
knn = KNeighborsClassifier(n_neighbors=50).fit(Xb[~split], y[~split])
acc = float((knn.predict(Xb[split]) == y[split]).mean())
print(f"multi-series color+coord kNN acc: {acc:.4f}")

print("\n== pl2 coordinate prior by generator ==")
from sklearn.linear_model import Ridge
rs2 = rows["pl2_extent"]
gens = collections.Counter(r["meta"].get("generator", "?") for r in rs2)
print("generators:", dict(gens))


def iou(a, b):
    ax1, ay1 = a[:, 0] + a[:, 2], a[:, 1] + a[:, 3]
    bx1, by1 = b[:, 0] + np.clip(b[:, 2], 0, None), b[:, 1] + np.clip(b[:, 3], 0, None)
    ix = np.clip(np.minimum(ax1, bx1) - np.maximum(a[:, 0], b[:, 0]), 0, None)
    iy = np.clip(np.minimum(ay1, by1) - np.maximum(a[:, 1], b[:, 1]), 0, None)
    inter = ix * iy
    union = a[:, 2] * a[:, 3] + np.clip(b[:, 2], 0, None) * np.clip(b[:, 3], 0, None) - inter
    return inter / np.maximum(union, 1e-9)


X = np.array([r["point_xy"] for r in rs2])
Y = np.array([r["label"] for r in rs2], dtype=np.float64)
split = np.array([is_test(r["doc_id"]) for r in rs2])
reg = Ridge().fit(X[~split], Y[~split])
scores = iou(Y[split], reg.predict(X[split]))
print(f"pl2 coord Ridge mIoU (recheck): {scores.mean():.4f}  IoU@0.5: {(scores >= 0.5).mean():.4f}")
med = np.sqrt(Y[split][:, 2] * Y[split][:, 3])
for lo, hi, tag in ((0, 0.1, "small"), (0.1, 0.25, "medium"), (0.25, 1.0, "large")):
    m = (med >= lo) & (med < hi)
    if m.sum():
        print(f"  {tag} elements (sqrt-area {lo}-{hi}): mIoU {scores[m].mean():.4f}  n {int(m.sum())}")
