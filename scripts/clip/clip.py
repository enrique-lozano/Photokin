"""Encode images and text into a shared CLIP embedding space with ONNX Runtime.

Two subcommands:

* ``image <files_to_parse_json> --model-dir DIR``: embed each ``{path, id}`` and
  print one line per asset.
* ``image-session --model-dir DIR``: keep the visual model loaded and accept
  newline-delimited ``{batchId, items}`` requests on stdin.
* ``text "<query>" --model-dir DIR``: embed a single query and print one line.

Each embedding is emitted to **stdout** as::

    ========> EMB: {"id": "...", "embedding": [...]}

(``id`` is omitted in text mode.) Progress/diagnostics go to **stderr**. The
model dir follows the published ONNX ``<model>`` layout: a ``visual/`` and a
``textual/`` folder each with ``model.onnx`` plus their config, downloaded to
the app data dir on first use. Vectors are emitted raw; the Rust side
unit-normalizes them.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import platform
import sys
import threading
from typing import Any, Callable, cast

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from tokenizers import Tokenizer

OPENAI_MEAN = [0.48145466, 0.4578275, 0.40821073]
OPENAI_STD = [0.26862954, 0.26130258, 0.27577711]
EMB_OUTPUT_PREFIX = "========> EMB: "
BATCH_OUTPUT_PREFIX = "========> BATCH: "
# The text model takes ~1 GB of memory, so its session exits after this long unused.
TEXT_SESSION_IDLE_SECONDS = 5 * 60

log = logging.getLogger("clip")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf8") as file:
        return json.load(file)


def index_threads() -> int:
    """Threads for image indexing: every physical core but two, so searches and
    the app stay responsive while a long indexing run is going."""
    logical = os.cpu_count() or 4
    # Apple silicon has no SMT; elsewhere assume two hardware threads per core.
    is_apple_silicon = sys.platform == "darwin" and platform.machine() == "arm64"
    physical = logical if is_apple_silicon else max(1, logical // 2)
    return max(1, physical - 2)


def session(
    model_dir: str, kind: str, threads: int | None = None
) -> ort.InferenceSession:
    model_path = os.path.join(model_dir, kind, "model.onnx")
    if not os.path.exists(model_path):
        sys.exit(f"Error: {kind} model not found at {model_path}")
    options = ort.SessionOptions()
    if threads:
        options.intra_op_num_threads = threads
    return ort.InferenceSession(
        model_path, sess_options=options, providers=["CPUExecutionProvider"]
    )


def np_dtype(onnx_type: str) -> np.dtype:
    return {"tensor(int64)": np.int64, "tensor(int32)": np.int32}.get(
        onnx_type, np.int64
    )


def emit(payload: dict) -> None:
    print(EMB_OUTPUT_PREFIX + json.dumps(payload, indent=None), flush=True)


def emit_batch_complete(batch_id: int) -> None:
    print(BATCH_OUTPUT_PREFIX + json.dumps({"batchId": batch_id}), flush=True)


# --- Image ------------------------------------------------------------------


def preprocess(image: Image.Image, cfg: dict) -> np.ndarray:
    size = cfg.get("size", 224)
    side = size[0] if isinstance(size, (list, tuple)) else size
    mean = np.array(cfg.get("mean", OPENAI_MEAN), dtype=np.float32)
    std = np.array(cfg.get("std", OPENAI_STD), dtype=np.float32)

    image = ImageOps.exif_transpose(image).convert("RGB")
    if cfg.get("resize_mode", "shortest") == "shortest":
        scale = side / min(image.size)
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.Resampling.BICUBIC,
        )
        left = (image.width - side) // 2
        top = (image.height - side) // 2
        image = image.crop((left, top, left + side, top + side))
    else:
        image = image.resize((side, side), Image.Resampling.BICUBIC)

    pixels = (np.asarray(image, dtype=np.float32) / 255.0 - mean) / std
    return np.expand_dims(pixels.transpose(2, 0, 1), 0)


def embed_image_entries(files: list, visual: ort.InferenceSession, cfg: dict) -> None:
    input_name = visual.get_inputs()[0].name

    for index, entry in enumerate(files):
        log.info("Embedding %s [%d/%d]", entry["path"], index + 1, len(files))
        try:
            with Image.open(entry["path"]) as image:
                tensor = preprocess(image, cfg)
        except (
            Exception
        ) as error:  # noqa: BLE001 - a single bad file must not abort the batch
            log.warning("Could not read %s: %s", entry["path"], error)
            continue
        embedding = cast(np.ndarray, visual.run(None, {input_name: tensor})[0])[0]
        emit({"id": entry["id"], "embedding": embedding.astype(float).tolist()})


def embed_images(files_json: str, model_dir: str) -> None:
    visual = session(model_dir, "visual", index_threads())
    cfg = load_json(os.path.join(model_dir, "visual", "preprocess_cfg.json"))
    embed_image_entries(load_json(files_json), visual, cfg)


def run_image_session(model_dir: str) -> None:
    """Keep the visual model loaded while processing newline-delimited batches."""
    visual = session(model_dir, "visual", index_threads())
    cfg = load_json(os.path.join(model_dir, "visual", "preprocess_cfg.json"))

    for line in sys.stdin:
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            log.warning("Invalid image-session request: %s", error)
            continue

        if request.get("type") == "shutdown":
            return

        batch_id = request.get("batchId")
        files = request.get("items")
        if not isinstance(batch_id, int) or not isinstance(files, list):
            log.warning("Invalid image-session request shape")
            continue

        try:
            embed_image_entries(files, visual, cfg)
        finally:
            emit_batch_complete(batch_id)


# --- Text -------------------------------------------------------------------


def context_length(textual: ort.InferenceSession, tokenizer_cfg: dict) -> int:
    """Token count the textual model was exported with.

    The ONNX graph is the authoritative source: every published model freezes
    this dimension (77 for CLIP, 64 for the SigLIP family) and feeding a
    different length is a hard shape error, not a soft mismatch. The published
    ``tokenizer_config.json`` does not carry it, so it can only be a fallback
    for a hypothetical model exported with a dynamic sequence axis.
    """
    declared = textual.get_inputs()[0].shape[1]
    if isinstance(declared, int):
        return declared
    return tokenizer_cfg.get("context_length", 77)


def padding(tokenizer: Tokenizer, tokenizer_cfg: dict) -> tuple[str, int]:
    """The token every query is padded with, as the model expects.

    SigLIP pools the *last* position of the padded sequence, so padding with
    the wrong token silently changes the embedding. CLIP masks attention
    causally and is therefore indifferent, which is why the default works there.
    """
    pad_token = tokenizer_cfg.get("pad_token")
    pad_id = tokenizer.token_to_id(pad_token) if isinstance(pad_token, str) else None
    if pad_token is None or pad_id is None:
        log.warning("No usable pad token in tokenizer config, padding with id 0")
        return "[PAD]", 0
    return pad_token, pad_id


def text_encoder(model_dir: str) -> Callable[[str], list[float]]:
    """Load the textual model once and return a function that embeds a query."""
    textual = session(model_dir, "textual")
    tokenizer = Tokenizer.from_file(
        os.path.join(model_dir, "textual", "tokenizer.json")
    )

    config_path = os.path.join(model_dir, "textual", "tokenizer_config.json")
    tokenizer_cfg = load_json(config_path) if os.path.exists(config_path) else {}

    length = context_length(textual, tokenizer_cfg)
    pad_token, pad_id = padding(tokenizer, tokenizer_cfg)

    tokenizer.enable_truncation(max_length=length)
    tokenizer.enable_padding(length=length, pad_token=pad_token, pad_id=pad_id)

    def encode(query: str) -> list[float]:
        encoded = tokenizer.encode(query)
        feeds = {}
        for inp in textual.get_inputs():
            values = (
                encoded.attention_mask if "mask" in inp.name.lower() else encoded.ids
            )
            feeds[inp.name] = np.array([values], dtype=np_dtype(inp.type))
        embedding = cast(np.ndarray, textual.run(None, feeds)[0])[0]
        return embedding.astype(float).tolist()

    return encode


def embed_text(query: str, model_dir: str) -> None:
    emit({"embedding": text_encoder(model_dir)(query)})


def run_text_session(model_dir: str) -> None:
    """Keep the textual model loaded and answer newline-delimited ``{id, text}``
    queries, so only the first search pays for loading it. The process exits on
    its own once idle, so the ~1 GB model never outlives the app's interest."""
    encode = text_encoder(model_dir)

    def idle_timer() -> threading.Timer:
        timer = threading.Timer(TEXT_SESSION_IDLE_SECONDS, lambda: os._exit(0))
        timer.daemon = True
        timer.start()
        return timer

    timer = idle_timer()
    try:
        for line in sys.stdin:
            timer.cancel()
            timer = idle_timer()
            try:
                request = json.loads(line)
            except json.JSONDecodeError as error:
                log.warning("Invalid text-session request: %s", error)
                continue

            if request.get("type") == "shutdown":
                return

            query_id = request.get("id")
            text = request.get("text")
            if not isinstance(query_id, str) or not isinstance(text, str):
                log.warning("Invalid text-session request shape")
                continue

            emit({"id": query_id, "embedding": encode(text)})
    finally:
        timer.cancel()


def main() -> None:
    # Tauri exchanges UTF-8 over pipes, including in the frozen Windows build.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(message)s")

    parser = argparse.ArgumentParser(
        description="CLIP image/text embeddings via ONNX Runtime."
    )
    parser.add_argument("mode", choices=["image", "image-session", "text", "text-session"])
    parser.add_argument(
        "input",
        nargs="?",
        help="JSON file of {path,id} for image mode, or the query for text mode",
    )
    parser.add_argument(
        "--model-dir",
        required=True,
        help="Directory with visual/ and textual/ ONNX models",
    )
    args = parser.parse_args()

    if args.mode == "image":
        if args.input is None:
            parser.error("image mode requires an input JSON file")
        embed_images(args.input, args.model_dir)
    elif args.mode == "image-session":
        run_image_session(args.model_dir)
    elif args.mode == "text-session":
        run_text_session(args.model_dir)
    else:
        if args.input is None:
            parser.error("text mode requires a query")
        embed_text(args.input, args.model_dir)


if __name__ == "__main__":
    main()
