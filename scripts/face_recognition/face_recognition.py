"""Detect and recognise faces in images using OpenCV's YuNet + SFace models.

The tool reads two JSON inputs:

* ``files_to_parse_json`` (positional): images to scan for new faces.
* ``--known_regions_json``: user-confirmed face regions used as the reference
  set ("who is this person").

For every detected face that is not already tagged, a single machine-readable
line is written to **stdout**::

    ========> FACE: {"face_id": "...", "img_id": "...", "area": {...}, "distance": 0.31}

All human-readable progress/diagnostics go to **stderr** so they never pollute
that contract. The matching pipeline is fully offline: both ONNX models are
loaded from the ``models/`` directory next to this script (or from the
PyInstaller bundle when frozen).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import cv2
import numpy as np

# --- Model configuration -----------------------------------------------------

DETECTOR_MODEL_FILENAME = "face_detection_yunet_2023mar.onnx"
RECOGNIZER_MODEL_FILENAME = "face_recognition_sface_2021dec.onnx"

# YuNet keeps every detection scoring above this value; per-scan filtering uses
# the (stricter) ``--min_face_confidence`` so known regions can still be matched
# with a more permissive score.
BASE_DETECTION_SCORE = 0.5

# Running YuNet at a camera original's full resolution is prohibitively slow
# and provides little extra landmark accuracy. Detection uses this in-memory
# cap; returned boxes/landmarks are scaled back to original-image coordinates.
# Scans can override it with ``--detection_size`` (lower is faster but misses
# small faces); reference faces always use this default.
DETECTION_MAX_LONGEST_SIDE = 1920

# libjpeg can decode straight to 1/2, 1/4 or 1/8 scale, far cheaper than a full
# decode followed by a resize. The largest factor that still leaves the image at
# or above the detection cap is used, so detection sees the same resolution.
JPEG_EXTENSIONS = (".jpg", ".jpeg", ".jpe", ".jfif")
REDUCED_JPEG_DECODE_FLAGS = (
    (8, cv2.IMREAD_REDUCED_COLOR_8),
    (4, cv2.IMREAD_REDUCED_COLOR_4),
    (2, cv2.IMREAD_REDUCED_COLOR_2),
)

# Default SFace cosine similarity above which two faces are considered the same
# person (value recommended by the OpenCV face recognition sample). The actual
# threshold is configurable via ``--recognition_threshold`` so it can be kept in
# sync with the front-end "Match strictness" setting.
RECOGNITION_SIMILARITY_THRESHOLD = 0.363

# Skip detections that overlap an already-tagged region by more than this ratio.
# Rescans shift boxes by a few pixels, so this must stay loose enough to catch
# them; keep in sync with `SAME_FACE_OVERLAP` in regions.service.ts.
ALREADY_TAGGED_OVERLAP_THRESHOLD = 0.5

# Minimum overlap for a detected face to be accepted as a known region's face.
KNOWN_REGION_OVERLAP_THRESHOLD = 0.30

FACE_OUTPUT_PREFIX = "========> FACE: "
REFERENCE_OUTPUT_PREFIX = "========> REFERENCE: "
REFERENCE_FAILED_OUTPUT_PREFIX = "========> REFERENCE_FAILED: "
REFERENCES_READY_OUTPUT = "========> REFERENCES_READY"

log = logging.getLogger("face_recognition")


# --- Data types --------------------------------------------------------------


@dataclass
class AreaBox:
    """A face bounding box stored as its center point plus width/height."""

    w: float
    h: float
    x: float  # center x
    y: float  # center y

    def left(self) -> float:
        return self.x - self.w / 2

    def top(self) -> float:
        return self.y - self.h / 2

    def right(self) -> float:
        return self.x + self.w / 2

    def bottom(self) -> float:
        return self.y + self.h / 2

    def area(self) -> float:
        return self.w * self.h

    def overlap_area_with(self, other: "AreaBox") -> float:
        left = max(self.left(), other.left())
        right = min(self.right(), other.right())
        top = max(self.top(), other.top())
        bottom = min(self.bottom(), other.bottom())
        return max(0.0, right - left) * max(0.0, bottom - top)

    def overlap_percentage_with(self, other: "AreaBox") -> float:
        intersection = self.overlap_area_with(other)
        if self.area() <= 0 or other.area() <= 0:
            return 0.0
        return max(intersection / self.area(), intersection / other.area())

    def scaled(self, factor: float) -> "AreaBox":
        return AreaBox(w=self.w * factor, h=self.h * factor, x=self.x * factor, y=self.y * factor)

    @staticmethod
    def from_top_left(x: float, y: float, w: float, h: float) -> "AreaBox":
        return AreaBox(w=w, h=h, x=x + w / 2, y=y + h / 2)


@dataclass
class KnownFace:
    face_id: str
    embedding: np.ndarray


@dataclass
class ImageWithTaggedAreas:
    path: str
    id: str
    areas_already_tagged: list[AreaBox]
    # Longest side of the original in pixels, used to pick a reduced JPEG decode.
    longest_side: Optional[int] = None
    # Existing regions (id, original-pixel box) that still lack an embedding.
    regions_to_embed: list[tuple[str, AreaBox]] = field(default_factory=list)


@dataclass
class ScanTimings:
    photos: int = 0
    faces: int = 0
    decode_seconds: float = 0.0
    detect_seconds: float = 0.0
    embed_seconds: float = 0.0

    def log_summary(self) -> None:
        if self.photos == 0:
            return

        def per_photo_ms(seconds: float) -> float:
            return round(seconds * 1000 / self.photos, 1)

        log.info(
            "Scan timings over %d photo(s), %d face(s): decode %.1f ms, detect %.1f ms, embed %.1f ms per photo",
            self.photos,
            self.faces,
            per_photo_ms(self.decode_seconds),
            per_photo_ms(self.detect_seconds),
            per_photo_ms(self.embed_seconds),
        )


# --- Model / IO helpers -------------------------------------------------------


def models_dir() -> str:
    """Directory holding the ONNX models (bundle dir when frozen)."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "models")


def create_detector(score_threshold: float = BASE_DETECTION_SCORE) -> cv2.FaceDetectorYN:
    model_path = os.path.join(models_dir(), DETECTOR_MODEL_FILENAME)
    if not os.path.exists(model_path):
        sys.exit(f"Error: detector model not found at {model_path}")
    return cv2.FaceDetectorYN.create(model_path, "", (320, 320), score_threshold, 0.3, 5000)


def create_recognizer() -> cv2.FaceRecognizerSF:
    model_path = os.path.join(models_dir(), RECOGNIZER_MODEL_FILENAME)
    if not os.path.exists(model_path):
        sys.exit(f"Error: recognizer model not found at {model_path}")
    return cv2.FaceRecognizerSF.create(model_path, "")


def _reduced_decode(
    path: str, longest_side: Optional[int], detection_size: int
) -> Optional[tuple[int, int]]:
    """The (factor, flag) of the cheapest JPEG decode that stays at the detection size."""
    if not longest_side or not path.lower().endswith(JPEG_EXTENSIONS):
        return None
    for factor, flag in REDUCED_JPEG_DECODE_FLAGS:
        if longest_side / factor >= detection_size:
            return factor, flag
    return None


def read_image(
    path: str,
    longest_side: Optional[int] = None,
    detection_size: int = DETECTION_MAX_LONGEST_SIDE,
) -> tuple[Optional[np.ndarray], float]:
    """Read an image as BGR, tolerating non-ASCII paths on Windows.

    Returns the image and the factor that maps its pixel coordinates back to the
    original's (1.0 unless a reduced JPEG decode was used).
    """
    try:
        raw = np.fromfile(path, dtype=np.uint8)
    except OSError as error:
        log.warning("Could not open %s: %s", path, error)
        return None, 1.0
    if raw.size == 0:
        return None, 1.0

    reduced = _reduced_decode(path, longest_side, detection_size)
    if reduced is not None:
        image = cv2.imdecode(raw, reduced[1])
        if image is not None:
            return image, longest_side / max(image.shape[:2])

    return cv2.imdecode(raw, cv2.IMREAD_COLOR), 1.0


def write_image(path: str, image: np.ndarray) -> None:
    ok, buffer = cv2.imencode(".jpg", image)
    if ok:
        buffer.tofile(path)


# --- Detection / recognition --------------------------------------------------


def detect_faces(
    detector: cv2.FaceDetectorYN,
    image: np.ndarray,
    detection_size: int = DETECTION_MAX_LONGEST_SIDE,
) -> np.ndarray:
    """Return original-coordinate detections (bbox, 5 landmarks, score)."""
    height, width = image.shape[:2]
    scale = min(1.0, detection_size / max(width, height))
    if scale < 1.0:
        detector_width = max(1, round(width * scale))
        detector_height = max(1, round(height * scale))
        detector_image = cv2.resize(
            image,
            (detector_width, detector_height),
            interpolation=cv2.INTER_AREA,
        )
    else:
        detector_width, detector_height = width, height
        detector_image = image

    detector.setInputSize((detector_width, detector_height))
    _, faces = detector.detect(detector_image)
    if faces is None:
        return np.empty((0, 15), dtype=np.float32)

    if scale < 1.0:
        faces = faces.copy()
        x_columns = [0, 2, 4, 6, 8, 10, 12]
        y_columns = [1, 3, 5, 7, 9, 11, 13]
        faces[:, x_columns] *= width / detector_width
        faces[:, y_columns] *= height / detector_height
    return faces


def detection_to_area(row: np.ndarray) -> AreaBox:
    x, y, w, h = (float(v) for v in row[:4])
    return AreaBox.from_top_left(x, y, w, h)


def extract_embedding(
    recognizer: cv2.FaceRecognizerSF, image: np.ndarray, row: np.ndarray
) -> np.ndarray:
    aligned = recognizer.alignCrop(image, row.astype(np.float32))
    feature = recognizer.feature(aligned)
    return np.asarray(feature, dtype=np.float32).flatten()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator == 0:
        return -1.0
    return float(np.dot(a, b) / denominator)


def best_overlapping_detection(
    faces: np.ndarray, target: AreaBox, min_overlap: float
) -> Optional[np.ndarray]:
    best_row: Optional[np.ndarray] = None
    best_overlap = min_overlap
    for row in faces:
        overlap = detection_to_area(row).overlap_percentage_with(target)
        if overlap >= best_overlap:
            best_overlap = overlap
            best_row = row
    return best_row


# --- Pipeline -----------------------------------------------------------------


def embed_known_region(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    image: np.ndarray,
    region: AreaBox,
) -> Optional[np.ndarray]:
    """Embed the face inside a user-tagged region.

    The detector runs on the full image first (best landmark accuracy); if no
    detection overlaps the region we fall back to detecting within a padded crop.
    """
    faces = detect_faces(detector, image)
    match = best_overlapping_detection(faces, region, KNOWN_REGION_OVERLAP_THRESHOLD)
    if match is not None:
        return extract_embedding(recognizer, image, match)

    height, width = image.shape[:2]
    pad_w, pad_h = region.w * 0.3, region.h * 0.3
    x1 = max(0, int(region.left() - pad_w))
    y1 = max(0, int(region.top() - pad_h))
    x2 = min(width, int(region.right() + pad_w))
    y2 = min(height, int(region.bottom() + pad_h))
    if x2 <= x1 or y2 <= y1:
        return None

    crop = image[y1:y2, x1:x2]
    crop_faces = detect_faces(detector, crop)
    if len(crop_faces) == 0:
        return None

    strongest = crop_faces[int(np.argmax(crop_faces[:, -1]))]
    return extract_embedding(recognizer, crop, strongest)


def emit_reference_failure(region_id: Optional[str], path: str, reason: str) -> None:
    if not region_id:
        log.info("Skipping reference face without a region id (%s): %s", path, reason)
        return

    payload = {"region_id": region_id, "path": path, "reason": reason}
    print(REFERENCE_FAILED_OUTPUT_PREFIX + json.dumps(payload, indent=None), flush=True)


def load_known_faces(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    known_people: list[dict[str, Any]],
) -> list[KnownFace]:
    known_faces: list[KnownFace] = []
    pending = sum(
        1
        for person in known_people
        for image_data in person.get("images", [])
        if not image_data.get("embedding")
    )
    completed = 0
    # Several confirmed faces often share a photo. Decode each file once.
    images_by_path: dict[str, Optional[np.ndarray]] = {}

    for person in known_people:
        name = person["name"]

        for image_data in person.get("images", []):
            stored_embedding = image_data.get("embedding")
            if stored_embedding:
                known_faces.append(
                    KnownFace(
                        face_id=name,
                        embedding=np.asarray(stored_embedding, dtype=np.float32),
                    )
                )
                continue

            completed += 1
            log.info("Loading reference face [%d/%d]", completed, pending)

            path = image_data["path"]
            region_id = image_data.get("region_id")
            if path not in images_by_path:
                image, _ = read_image(path)
                images_by_path[path] = image
            image = images_by_path[path]
            if image is None:
                emit_reference_failure(region_id, path, "Could not read the photo")
                continue

            region_data = image_data["region"]
            region = AreaBox(
                w=region_data["w"],
                h=region_data["h"],
                x=region_data["x"],
                y=region_data["y"],
            )

            embedding = embed_known_region(detector, recognizer, image, region)
            if embedding is None:
                emit_reference_failure(region_id, path, "No face matched this region")
                continue

            known_faces.append(KnownFace(face_id=name, embedding=embedding))
            if region_id:
                payload = {
                    "region_id": region_id,
                    "embedding": embedding.astype(float).tolist(),
                }
                print(REFERENCE_OUTPUT_PREFIX + json.dumps(payload, indent=None), flush=True)

    return known_faces


def emit_face(
    face_id: str,
    img_id: str,
    area: AreaBox,
    distance: float,
    embedding: np.ndarray,
    score: float,
) -> None:
    payload = {
        "face_id": face_id,
        "img_id": img_id,
        "area": {"x": area.x, "y": area.y, "w": area.w, "h": area.h},
        "distance": round(distance, 3),
        "score": round(score, 4),
        "embedding": embedding.astype(float).tolist(),
    }
    print(FACE_OUTPUT_PREFIX + json.dumps(payload, indent=None), flush=True)


def scan_image(
    image_meta: ImageWithTaggedAreas,
    *,
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    known_faces: list[KnownFace],
    min_face_confidence: float,
    recognition_threshold: float,
    export_path: Optional[str],
    detection_size: int,
    timings: ScanTimings,
) -> None:
    started = time.perf_counter()
    image, scale = read_image(image_meta.path, image_meta.longest_side, detection_size)
    decoded = time.perf_counter()
    timings.decode_seconds += decoded - started
    if image is None:
        return

    annotated = image.copy() if export_path is not None else None
    faces = detect_faces(detector, image, detection_size)
    timings.detect_seconds += time.perf_counter() - decoded
    timings.photos += 1

    if annotated is not None:
        for tagged in image_meta.areas_already_tagged:
            draw_box(annotated, tagged.scaled(1 / scale), "--alreadyTagged--", color=(0, 255, 0))

    # The photo is already decoded and detected, so embedding an existing box
    # here costs one SFace pass instead of a separate read of the file.
    for region_id, region in image_meta.regions_to_embed:
        match = best_overlapping_detection(
            faces, region.scaled(1 / scale), KNOWN_REGION_OVERLAP_THRESHOLD
        )
        if match is None:
            continue
        payload = {
            "region_id": region_id,
            "embedding": extract_embedding(recognizer, image, match).astype(float).tolist(),
        }
        print(REFERENCE_OUTPUT_PREFIX + json.dumps(payload, indent=None), flush=True)

    for row in faces:
        score = float(row[-1])
        if score < min_face_confidence:
            continue

        # Detections are in decoded-image pixels; tagged areas and the emitted
        # area are in original-image pixels.
        area = detection_to_area(row).scaled(scale)

        if any(
            tagged.overlap_percentage_with(area) > ALREADY_TAGGED_OVERLAP_THRESHOLD
            for tagged in image_meta.areas_already_tagged
        ):
            continue

        embed_started = time.perf_counter()
        embedding = extract_embedding(recognizer, image, row)
        timings.embed_seconds += time.perf_counter() - embed_started
        timings.faces += 1

        face_id = "Unknown"
        best_similarity = -1.0
        for known in known_faces:
            similarity = cosine_similarity(embedding, known.embedding)
            if similarity > best_similarity:
                best_similarity = similarity
                face_id = known.face_id

        if best_similarity < recognition_threshold:
            face_id = "Unknown"

        distance = 1.0 - best_similarity

        if annotated is not None:
            draw_box(annotated, area.scaled(1 / scale), f"{face_id[:10]}-----{round(distance, 3)}")

        emit_face(face_id, image_meta.id, area, distance, embedding, score)

    if annotated is not None and export_path is not None:
        os.makedirs(export_path, exist_ok=True)
        write_image(os.path.join(export_path, f"img_{image_meta.id}_BOXES.jpg"), annotated)


def draw_box(
    image: np.ndarray, area: AreaBox, label: str, *, color: tuple[int, int, int] = (0, 0, 255)
) -> None:
    top_left = (int(area.left()), int(area.top()))
    bottom_right = (int(area.right()), int(area.bottom()))
    cv2.rectangle(image, top_left, bottom_right, color, 2)
    cv2.putText(
        image,
        label,
        (int(area.left()), int(area.bottom()) + 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        color,
        2,
        cv2.LINE_AA,
    )


def load_json(path: Optional[str], *, required: bool) -> Any:
    if not path:
        return []
    try:
        with open(path, "r", encoding="utf8") as file:
            return json.load(file)
    except FileNotFoundError:
        if required:
            sys.exit(f"Error: JSON file not found: {path}")
        return []
    except json.JSONDecodeError as error:
        sys.exit(f"Error: failed to parse JSON file {path}. Reason: {error}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(message)s")
    log.info("---- STARTING FACE_RECOGNITION ----")

    parser = argparse.ArgumentParser(
        description="Detect faces in images and match them against known regions."
    )
    parser.add_argument(
        "files_to_parse_json",
        help="Path to the JSON file listing image paths to scan for new faces",
    )
    parser.add_argument(
        "--known_regions_json",
        help="Path to the JSON file with known people and their face regions",
    )
    parser.add_argument(
        "--draw_results_path",
        help="Optional directory to export annotated images for debugging",
    )
    parser.add_argument(
        "--min_face_confidence",
        type=float,
        default=0.9,
        help="Minimum YuNet detection score for a face to be scanned (default: 0.9)",
    )
    parser.add_argument(
        "--recognition_threshold",
        type=float,
        default=RECOGNITION_SIMILARITY_THRESHOLD,
        help=(
            "Minimum SFace cosine similarity (0-1) for a detected face to be "
            f"auto-matched to a known person (default: {RECOGNITION_SIMILARITY_THRESHOLD})"
        ),
    )
    parser.add_argument(
        "--detection_size",
        type=int,
        default=DETECTION_MAX_LONGEST_SIDE,
        help=(
            "Longest side (px) photos are scaled down to before detection. Lower is "
            f"faster but misses small faces (default: {DETECTION_MAX_LONGEST_SIDE})"
        ),
    )
    args = parser.parse_args()

    detector = create_detector()
    recognizer = create_recognizer()

    known_people = load_json(args.known_regions_json, required=False)
    known_faces = load_known_faces(detector, recognizer, known_people)
    log.info("Loaded %d known face embedding(s)", len(known_faces))
    print(REFERENCES_READY_OUTPUT, flush=True)

    files_to_parse = load_json(args.files_to_parse_json, required=True)
    timings = ScanTimings()

    for index, file_to_parse in enumerate(files_to_parse):
        areas_already_tagged = [
            AreaBox(w=area["w"], h=area["h"], x=area["x"], y=area["y"])
            for area in file_to_parse.get("areas_already_tagged", [])
        ]
        image_meta = ImageWithTaggedAreas(
            path=file_to_parse["path"],
            id=file_to_parse["id"],
            areas_already_tagged=areas_already_tagged,
            longest_side=file_to_parse.get("longest_side"),
            regions_to_embed=[
                (area["id"], AreaBox(w=area["w"], h=area["h"], x=area["x"], y=area["y"]))
                for area in file_to_parse.get("regions_to_embed", [])
            ],
        )

        log.info("Scanning faces in %s [%d/%d]", image_meta.path, index + 1, len(files_to_parse))

        scan_image(
            image_meta,
            detector=detector,
            recognizer=recognizer,
            known_faces=known_faces,
            min_face_confidence=args.min_face_confidence,
            recognition_threshold=args.recognition_threshold,
            export_path=args.draw_results_path,
            detection_size=args.detection_size,
            timings=timings,
        )

    timings.log_summary()


if __name__ == "__main__":
    main()
