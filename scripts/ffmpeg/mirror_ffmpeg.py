#!/usr/bin/env python3
"""Download prebuilt static ffmpeg/ffprobe builds and name them as Tauri sidecars.

    python3 scripts/ffmpeg/mirror_ffmpeg.py [--output DIR]

Output: <output>/ffmpeg-<target-triple>[.exe], ffprobe-<target-triple>[.exe] and
SHA256SUMS.txt. Run by .github/workflows/release-ffmpeg.yml, which publishes the
result as a GitHub release that scripts/download_ffmpeg_sidecar.mjs downloads.

Upstream builds (these are GPL builds, see the release notes):
  macOS / Linux   https://ffmpeg.martin-riedl.de
  Windows x64     https://www.gyan.dev/ffmpeg/builds
  Windows arm64   https://github.com/BtbN/FFmpeg-Builds
"""

import argparse
import hashlib
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

RIEDL = "https://ffmpeg.martin-riedl.de/redirect/latest"
GYAN = "https://www.gyan.dev/ffmpeg/builds"
BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"


def riedl(os_name, arch):
    base = f"{RIEDL}/{os_name}/{arch}/release"
    return f"{base}/ffmpeg.zip", f"{base}/ffprobe.zip"


# triple -> (ffmpeg zip, ffprobe zip or None when the same zip contains both)
TARGETS = {
    "aarch64-apple-darwin": riedl("macos", "arm64"),
    "x86_64-apple-darwin": riedl("macos", "amd64"),
    "aarch64-unknown-linux-gnu": riedl("linux", "arm64"),
    "x86_64-unknown-linux-gnu": riedl("linux", "amd64"),
    "x86_64-pc-windows-msvc": (f"{GYAN}/ffmpeg-release-essentials.zip", None),
    "aarch64-pc-windows-msvc": (f"{BTBN}/ffmpeg-n8.1-latest-winarm64-gpl-8.1.zip", None),
}


def fetch_and_find(url, tmp, name):
    archive = tmp / "pkg.zip"
    print(f"  Downloading {url}")
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=120) as response, open(archive, "wb") as f:
        shutil.copyfileobj(response, f)
    extracted = tmp / "ext"
    shutil.rmtree(extracted, ignore_errors=True)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(extracted)
    for path in extracted.rglob(name):
        if path.is_file() and not path.is_symlink():
            return path
    raise RuntimeError(f"{name} not found in {url}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=Path("binaries"))
    output = parser.parse_args().output.resolve()
    shutil.rmtree(output, ignore_errors=True)
    output.mkdir(parents=True)

    for triple, (ffmpeg_url, ffprobe_url) in TARGETS.items():
        print(f"\n>>> {triple}")
        ext = ".exe" if "windows" in triple else ""
        with tempfile.TemporaryDirectory() as t:
            tmp = Path(t)
            ffmpeg_zip_dir = tmp / "ffmpeg"
            ffmpeg_zip_dir.mkdir()
            sources = {"ffmpeg": fetch_and_find(ffmpeg_url, ffmpeg_zip_dir, f"ffmpeg{ext}")}
            if ffprobe_url:
                probe_dir = tmp / "ffprobe"
                probe_dir.mkdir()
                sources["ffprobe"] = fetch_and_find(ffprobe_url, probe_dir, f"ffprobe{ext}")
            else:
                sources["ffprobe"] = next(sources["ffmpeg"].parent.rglob(f"ffprobe{ext}"))
            for tool, src in sources.items():
                dest = output / f"{tool}-{triple}{ext}"
                shutil.copy2(src, dest)
                if os.name != "nt":
                    dest.chmod(0o755)
                print(f"  Saved {dest.name}")

    sums = [f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}" for f in sorted(output.iterdir())]
    (output / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n")
    print(f"\nDone: {output}")


if __name__ == "__main__":
    main()
