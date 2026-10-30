# Sidecar and setup scripts

Photokin's desktop build uses FFmpeg/FFprobe plus two Python sidecars. Run the
commands below from the repository root. No separate backend service is needed.

| Script                               | Purpose                                                                                                              | When it runs          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `download_ffmpeg_sidecar.mjs`        | Downloads missing FFmpeg/FFprobe binaries for the target triple from the Photokin `ffmpeg-sidecars` release.         | `predev` / `prebuild` |
| `setup_face_recognition_sidecar.mjs` | Downloads face models and builds the OpenCV/PyInstaller sidecar, including its models.                               | `predev` / `prebuild` |
| `setup_clip_sidecar.mjs`             | Builds the ONNX Runtime/PyInstaller sidecar for semantic search. Search models are downloaded separately by the app. | `predev` / `prebuild` |

`pnpm run tauri dev` and `pnpm run tauri build` reach these hooks through Tauri's
configured frontend commands. Initial setup needs internet access, Rust/native
build prerequisites, and Python 3.11+ with `venv` and `pip`. Existing binaries
are reused.

## Manual setup and rebuilds

```powershell
node scripts\download_ffmpeg_sidecar.mjs
node scripts\setup_face_recognition_sidecar.mjs
node scripts\setup_clip_sidecar.mjs

# Rebuild after changing Python code or its pinned dependencies:
node scripts\setup_face_recognition_sidecar.mjs --force
node scripts\setup_clip_sidecar.mjs --force
```

PyInstaller builds for the host OS; passing another target label does not
cross-compile Python sidecars. Release support must be verified on each platform.
Outputs live under `src-tauri/resources/`, with target-triple suffixes.

## Detailed guides

- [Screenshots](screenshots/README.md): capture the demo library and render
  README/website images with `pnpm screenshots`.
- [Face recognition](face_recognition/README.md): OpenCV models, protocol, and
  direct Python development.
- [CLIP semantic search](clip/README.md): model layout, protocol, and direct
  Python development.
- [Run Photokin locally](../docs/RUN_THE_CODE_LOCALLY.md): full toolchain,
  ExifTool, and troubleshooting.
- [Testing](../docs/TESTING.md)

ExifTool's Windows in-app installation is separate from these build hooks.
Image thumbnails use Rust image decoding and libwebp; FFmpeg handles video and
additional preview formats. ImageMagick is not required.
