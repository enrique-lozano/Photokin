"""Pick a match cutoff for a CLIP model from labelled queries on demo/showcase.

Usage (from the repo root, with the sidecar's venv):
  python scripts/clip/calibrate.py <model-dir> cos
  python scripts/clip/calibrate.py <model-dir> sigmoid:<logit_scale>:<logit_bias>

`cos` scores raw cosine similarity (plain CLIP models); `sigmoid:` scores the
SigLIP match probability using the checkpoint's (log) scale and bias. Prints the
lowest true matches, the highest non-matches and the cutoff with the best F1.
"""
import sys, os, glob, json, io, contextlib, math
sys.path.insert(0, r"scripts\clip")
import clip, numpy as np
from PIL import Image

md, kind = sys.argv[1], sys.argv[2]  # kind: "cos" or "sigmoid:<log_scale>:<bias>"
LABELS = {
    "giraffe": ["kenya-giraffes"], "zebra": ["kenya-zebras"], "lion": ["kenya-lions"],
    "elephant": ["kenya-elephant"], "monkey": ["japan-snow-monkey"], "puffin": ["iceland-puffin"],
    "llama": ["peru-llama"], "camel": ["morocco-merzouga-camels"], "waterfall": ["iceland-skogafoss"],
    "the moon": ["full-moon", "earthset"], "bamboo forest": ["japan-arashiyama-bamboo"],
    "torii gates": ["japan-fushimi-inari"], "astronaut": ["koch-artemis-portrait", "koch-destiny-module", "koch-harmony-module", "hansen-artemis-portrait", "hansen-orion-training"],
    "northern lights": ["norway-northern-lights"], "fjord": ["norway-geirangerfjord", "norway-reine"],
    "safari animals": ["kenya-giraffes", "kenya-zebras", "kenya-lions", "kenya-elephant"],
    "glacier lagoon": ["iceland-jokulsarlon"], "blue painted street": ["morocco-chefchaouen"],
    "dog": [], "car": [], "birthday cake": [], "swimming pool": [], "bicycle": [], "city at night": [],
}
IGNORE = {"astronaut": ["earth-from-orion", "koch-iceland-geology"], "the moon": ["earth-from-orion"], "safari animals": [], "dog": [], "fjord": []}

cfg = clip.load_json(os.path.join(md, "visual", "preprocess_cfg.json"))
visual = clip.session(md, "visual", 6)
name = visual.get_inputs()[0].name
files = sorted(glob.glob(r"demo\showcase\*.jpg"))
names = [os.path.basename(f)[:-4] for f in files]
imgs = []
for f in files:
    x = clip.preprocess(Image.open(f), cfg)
    v = visual.run(None, {name: x[None] if x.ndim == 3 else x})[0][0]
    imgs.append(v / np.linalg.norm(v))
imgs = np.array(imgs)
encode = clip.text_encoder(md)

def score(cos):
    if kind == "cos": return cos
    _, log_scale, bias = kind.split(":")
    return 1 / (1 + np.exp(-(math.exp(float(log_scale)) * cos + float(bias))))

pos, neg = [], []
for q, positives in LABELS.items():
    t = np.array(encode(q)); t /= np.linalg.norm(t)
    s = score(imgs @ t)
    for n, v in zip(names, s):
        if n in IGNORE.get(q, []): continue
        (pos if n in positives else neg).append((v, q, n))
pos.sort(); neg.sort(reverse=True)
print("positives (lowest):", [(round(float(v), 4), q, n) for v, q, n in pos[:5]])
print("negatives (highest):", [(round(float(v), 4), q, n) for v, q, n in neg[:5]])
best = None
for thr in sorted({float(v) for v, _, _ in pos + neg}):
    tp = sum(v >= thr for v, _, _ in pos); fp = sum(v >= thr for v, _, _ in neg)
    prec = tp / (tp + fp) if tp + fp else 1; rec = tp / len(pos)
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    if not best or f1 > best[0]: best = (f1, thr, prec, rec)
print(f"best F1 {best[0]:.2f} at {best[1]:.4f} (precision {best[2]:.2f}, recall {best[3]:.2f}); {len(pos)} positives, {len(neg)} negatives")
