import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

import clip


class StreamEncodingTests(unittest.TestCase):
    def test_cli_errors_are_utf8_even_with_legacy_pipe_encoding(self):
        for mode, arguments in [
            ("image", ["unused.json"]),
            ("image-session", []),
            ("text", ["caf\u00e9"]),
            ("text-session", []),
        ]:
            with self.subTest(mode=mode):
                result = subprocess.run(
                    [
                        sys.executable,
                        str(Path(clip.__file__)),
                        mode,
                        *arguments,
                        "--model-dir",
                        "missing-model-\u00e9",
                    ],
                    capture_output=True,
                    env={**os.environ, "PYTHONIOENCODING": "cp1252"},
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("missing-model-\u00e9", result.stderr.decode("utf-8"))
                self.assertIn("model not found", result.stderr.decode("utf-8"))

    def test_image_session_reads_unicode_paths_and_emits_utf8(self):
        entry = {"id": "photo-1", "path": "C:\\photos\\caf\u00e9-\u65e5\u672c.jpg"}
        request = json.dumps({"batchId": 1, "items": [entry]}, ensure_ascii=False) + "\n"
        with (
            io.TextIOWrapper(io.BytesIO(request.encode("utf-8")), encoding="cp1252") as stdin,
            io.TextIOWrapper(io.BytesIO(), encoding="cp1252") as stdout,
            io.TextIOWrapper(io.BytesIO(), encoding="cp1252") as stderr,
        ):
            def embed_entries(entries, _visual, _cfg):
                self.assertEqual(entries, [entry])
                print("Encoding caf\u00e9 [1/1]", file=sys.stderr, flush=True)
                clip.emit({"id": entries[0]["id"], "embedding": [1.0, 0.0]})

            with (
                patch.object(sys, "stdin", stdin),
                patch.object(sys, "stdout", stdout),
                patch.object(sys, "stderr", stderr),
                patch.object(sys, "argv", ["clip", "image-session", "--model-dir", "unused"]),
                patch.object(clip, "session"),
                patch.object(clip, "load_json", return_value={}),
                patch.object(clip, "embed_image_entries", side_effect=embed_entries),
            ):
                clip.main()
                stdout.flush()
                stderr.flush()
                output = stdout.buffer.getvalue().decode("utf-8")
                diagnostic = stderr.buffer.getvalue().decode("utf-8")

            self.assertIn('========> EMB: {"id": "photo-1"', output)
            self.assertIn('========> BATCH: {"batchId": 1}', output)
            self.assertIn("Encoding caf\u00e9 [1/1]", diagnostic)

    def test_text_session_loads_once_and_answers_each_query(self):
        requests = "".join(
            json.dumps(request, ensure_ascii=False) + "\n"
            for request in [
                {"id": "1", "text": "caf\u00e9"},
                {"id": "2", "text": "dog"},
                {"type": "shutdown"},
                {"id": "3", "text": "ignored after shutdown"},
            ]
        )
        loads = []

        def encoder(_model_dir):
            loads.append(True)
            return lambda text: [float(len(text))]

        with (
            io.TextIOWrapper(io.BytesIO(requests.encode("utf-8")), encoding="utf-8") as stdin,
            io.TextIOWrapper(io.BytesIO(), encoding="utf-8") as stdout,
        ):
            with (
                patch.object(sys, "stdin", stdin),
                patch.object(sys, "stdout", stdout),
                patch.object(sys, "argv", ["clip", "text-session", "--model-dir", "unused"]),
                patch.object(clip, "text_encoder", side_effect=encoder),
            ):
                clip.main()
                stdout.flush()
                output = stdout.buffer.getvalue().decode("utf-8")

        self.assertEqual(len(loads), 1)
        self.assertIn('========> EMB: {"id": "1", "embedding": [4.0]}', output)
        self.assertIn('========> EMB: {"id": "2", "embedding": [3.0]}', output)
        self.assertNotIn('"id": "3"', output)


if __name__ == "__main__":
    unittest.main()
