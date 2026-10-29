# CLIP embeddings (semantic search)

This Python script encodes images and text into a shared **CLIP** embedding
space using **ONNX Runtime**. The resulting vectors power Photokin's semantic
(natural-language) search: image vectors are indexed per asset, and a query is
encoded into the same space so the closest images can be ranked by cosine
similarity.

Its runtime dependencies are `onnxruntime`, `pillow` (image preprocessing) and
`tokenizers` (text) — a completely different stack from the `face_recognition`
sidecar (OpenCV), which is why the two are kept as separate projects/binaries.

It has three modes:

- `image <files_to_parse_json> --model-dir DIR` — embed each `{path, id}` entry.
- `image-session --model-dir DIR` — keep the model loaded and read newline-delimited
  `{batchId, items}` requests from stdin, emitting `========> BATCH: {"batchId": ...}`
  after each batch.
- `text "<query>" --model-dir DIR` — embed a single query string.

For each embedding a machine-readable line is written to **stdout**
(`========> EMB: {...}`) which the app parses; all progress/diagnostics go to
**stderr**. Vectors are emitted raw (not normalized); the app unit-normalizes
them before storing (see `src/media/embeddings.ts`).

All three standard streams use UTF-8 explicitly, including in the Windows
PyInstaller build. Tauri expects UTF-8; using the Windows code page for photo
paths in diagnostics can otherwise abort indexing with an `invalid utf-8 sequence`
error. After changing the script, rebuild the existing sidecar with `--force`
(see below); the normal setup skips binaries that already exist.

Run the stream-encoding regression tests with the sidecar's virtual environment:

```powershell
.\scripts\clip\env\Scripts\python.exe -m unittest discover -s scripts\clip -p test_clip.py
```

## Requirements

- Python 3.11 or later (must be on your `PATH`) — the pinned
  `numpy` / `onnxruntime` / `tokenizers` wheels target CPython 3.11+.

## Models

Unlike the face recognition sidecar (which bundles its models), CLIP models are
**large and multiple**, so they are **not** bundled. The app downloads the
active model to its data dir on first use (`appLocalData/clip-models/<model-id>`).

A model directory has this layout (a `visual/` and a `textual/` half):

```
<model-id>/
  visual/
    model.onnx
    preprocess_cfg.json
  textual/
    model.onnx
    tokenizer.json
    tokenizer_config.json
```

The default model is `ViT-B-32__laion2b-s34b-b79k`, published as ONNX at
<https://huggingface.co/immich-app>. See `src/media/smartSearch/models.ts` for
the curated list and `modelDownload.ts` for the download logic.

## How it ships in the app

This script is bundled as a **Tauri sidecar**, exactly like FFmpeg and the face
recognition script. There is no upstream release to download (it's our own
implementation), so it is **built locally with PyInstaller** the first time it
is missing.

The build is automated by `scripts/setup_clip_sidecar.mjs`, which runs via the
`predev` / `prebuild` npm hooks. It:

1. Creates a virtual environment in `env/` and installs `requirements.txt` + PyInstaller.
2. Runs PyInstaller with `--collect-all onnxruntime` and `--collect-all tokenizers`
   so their native libraries and data files are included.
3. Produces `src-tauri/resources/clip/clip-<target-triple>[.exe]`.

The build is skipped when the binary for the current target triple already exists.

### Manual build / rebuild

```bash
# from the Photokin/ project root
node scripts/setup_clip_sidecar.mjs          # build if missing
node scripts/setup_clip_sidecar.mjs --force  # force a rebuild
```

> PyInstaller only targets the host OS. To produce binaries for other platforms,
> run the same command on each target platform (e.g. a CI matrix).

## Local development of the script itself

To run / iterate on the Python directly (without building a binary):

```bash
# Create and activate a virtual environment
python -m venv env

# On Windows
.\env\Scripts\activate
# On macOS/Linux
source env/bin/activate

pip install -r requirements.txt
```

### Get a model to test against

Either point `--model-dir` at a model the app already downloaded
(`appLocalData/clip-models/ViT-B-32__laion2b-s34b-b79k`), or fetch the 5 files manually:

```bash
# from scripts/clip/
MODEL=ViT-B-32__laion2b-s34b-b79k
BASE=https://huggingface.co/immich-app/$MODEL/resolve/main
for f in visual/model.onnx visual/preprocess_cfg.json \
         textual/model.onnx textual/tokenizer.json textual/tokenizer_config.json; do
  mkdir -p "models/$MODEL/$(dirname "$f")"
  curl -L "$BASE/$f?download=true" -o "models/$MODEL/$f"
done
```

### Run it

```bash
# Text mode: prints one "========> EMB: {"embedding": [...]}" line
python clip.py text "a dog on the beach" --model-dir models/ViT-B-32__laion2b-s34b-b79k

# Image mode: create a small files_to_parse.json first, e.g.
#   [{ "path": "/absolute/path/to/photo.jpg", "id": "asset-1" }]
python clip.py image files_to_parse.json --model-dir models/ViT-B-32__laion2b-s34b-b79k
```

A quick sanity check: encode the same concept as text and as a matching image
and confirm their vectors have a high dot product (they're the same length and,
once normalized, cosine-close).
