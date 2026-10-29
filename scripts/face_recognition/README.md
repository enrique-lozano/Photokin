# Face recognition

This Python script identifies and tags faces in images using OpenCV's
**YuNet** detector and **SFace** recognizer. Both models run through OpenCV's
DNN module (no TensorFlow / DeepFace), so the only runtime dependencies are
`opencv-python-headless` and `numpy` — which keeps the bundled binary small.

It extracts face embeddings from user-confirmed regions and compares them with
faces detected in new images using cosine similarity. Inputs are provided as
JSON files: the images to scan and the known regions.

For each detected face, a machine-readable line is written to **stdout**
(`========> FACE: {...}`) which the app parses; all progress/diagnostics go to
**stderr**. The script can also draw bounding boxes (`--draw_results_path`).

## Requirements

- Python 3.8 or later (must be on your `PATH`)

## How it ships in the app

This script is bundled as a **Tauri sidecar**, exactly like FFmpeg. There is no
upstream release to download (it's our own implementation), so it is **built
locally with PyInstaller** the first time it is missing.

The build is fully automated by `scripts/setup_face_recognition_sidecar.mjs`,
which runs automatically via the `predev` / `prebuild` npm hooks. It:

1. Downloads the YuNet + SFace ONNX models into `models/` (from the OpenCV Zoo).
2. Creates a virtual environment in `env/` and installs `requirements.txt` + PyInstaller.
3. Bundles the models inside the executable (`--add-data`) so the sidecar works
   **offline** with no runtime downloads. At runtime the models are loaded from
   the PyInstaller bundle (`sys._MEIPASS/models`), or from `models/` in dev.
4. Produces `src-tauri/resources/face_recognition/face_recognition-<target-triple>[.exe]`.

The build is skipped when the binary for the current target triple already exists.

### Manual build / rebuild

```bash
# from the Photokin/ project root
node scripts/setup_face_recognition_sidecar.mjs          # build if missing
node scripts/setup_face_recognition_sidecar.mjs --force  # force a rebuild
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

# Make sure the models are present (the setup script also does this):
node ../setup_face_recognition_sidecar.mjs   # downloads models/ then builds

python face_recognition.py files_to_parse.json --known_regions_json known_regions.json
```
