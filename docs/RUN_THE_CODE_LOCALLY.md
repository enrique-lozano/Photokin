# Run Photokin locally

Photokin is a Tauri desktop application, not a web service. The React frontend
relies on native commands and a local SQLite database. Use a separate test library
and backed-up photos while developing.

## Prerequisites

- **Node.js and pnpm.** Node 22 LTS is a starting point; the project does not
  currently pin an exact Node or pnpm version. Use pnpm and the committed lockfile.
- **Rust and Cargo**, using the toolchain required by
  [Tauri 2](https://v2.tauri.app/start/prerequisites/).
- **Native platform tools.** On Windows, install Microsoft C++ Build Tools
  (Desktop development with C++) and WebView2 as described in Tauri's guide.
  Windows is the current configured installer target; macOS/Linux releases are
  not yet promised.
- **Python 3.11+ on PATH**, with `venv` and `pip`, to build the face-recognition
  and CLIP sidecars. Choose a Python version supported by their pinned packages.
- **Internet access for initial setup**, including package, sidecar, and model
  downloads.

VS Code with the Tauri and rust-analyzer extensions is recommended, not required.
No ImageMagick installation is needed.

## Get the source and dependencies

The canonical repository is
[enrique-lozano/Photokin](https://github.com/enrique-lozano/Photokin). It is
preparing to become public; access is required until then.

```powershell
git clone https://github.com/enrique-lozano/Photokin.git
Set-Location Photokin
pnpm install
```

You can also download and extract the repository ZIP when it is accessible.
Run the remaining commands from the extracted project root.

## Start the desktop app

```powershell
pnpm run tauri dev
```

Tauri starts Vite through `pnpm dev`. Its `predev` hook:

1. Downloads missing FFmpeg/FFprobe binaries for the current platform.
2. Builds the face-recognition sidecar with PyInstaller and bundles its models.
3. Builds the CLIP sidecar with PyInstaller. Search models are downloaded
   separately through the app.

The first startup may take several minutes. Later starts reuse existing sidecar
binaries. See the [script index](../scripts/README.md) for manual rebuilds.

### ExifTool

ExifTool reads and writes the details embedded in photo files.

- On Windows, onboarding offers **Install automatically** or **Locate manually**.
  Automatic installation downloads ExifTool and saves its location for future
  launches.
- You can also install [ExifTool](https://exiftool.org/) yourself and make it
  available on `PATH`; check with `exiftool -ver` in a new terminal.
- Browsing can continue without it, but metadata-dependent features need it.
  The System tab in Settings reports availability.

The editor integration tests use the development dependency's bundled ExifTool,
independently of the app's ExifTool configuration.

## Build

```powershell
pnpm run build
pnpm run tauri build --no-sign
```

The first command type-checks production frontend files and builds frontend
assets; it does not create a desktop installer. The second builds the desktop
app, running the frontend build through Tauri's configuration. Its current bundle
target is a Windows NSIS installer. `--no-sign` skips signing the in-app update
files, which needs the release key; local installers work without it.
Signing/distribution credentials are not needed for local development; do not
put them in the repository.

## Releases and in-app updates

Photokin updates itself from signed GitHub releases using the
[Tauri updater](https://v2.tauri.app/plugin/updater/). Installed copies read
`https://github.com/enrique-lozano/Photokin/releases/latest/download/latest.json`,
so updates only reach users once a release is **published** in the public
repository.

1. Bump `version` in `package.json` (`tauri.conf.json` reads it from there) and
   push it to `main`.
2. Run the Release workflow with **Publish release** checked, from
   **Actions > Release > Run workflow** or with
   `gh workflow run release.yml -f publish_release=true`. It stops if
   `v<version>` is already released, then builds each platform, signs the
   update files, and attaches them plus `latest.json` to a draft release.
3. Write the release notes and publish the draft. Publishing creates the
   `v<version>` tag on the built commit; never tag by hand.

Without **Publish release**, the workflow is a test build: installers are kept
as workflow artifacts and no release is touched.

The workflow signs with the `TAURI_SIGNING_PRIVATE_KEY` repository secret (and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one). Its public half is
`plugins > updater > pubkey` in `tauri.conf.json`. Keep a backup of the private
key outside the repository: if it is lost, installed copies can no longer verify,
and therefore never receive, new updates.

## Development tools

`pnpm run dev` starts the frontend tooling on port 1420, but it is not a fully
functional browser edition. Native features require Tauri.

In development builds, the footer's **UI kit** button opens the component gallery
in a separate window. Clicking again focuses the existing window without leaving
the gallery.

See [Testing](TESTING.md) for checks and [Code contributions](CODE_CONTRIBUTING.md)
for architecture and conventions.

## Troubleshooting

| Problem                                  | Check                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python or a wheel cannot be found        | Check `python --version` and PATH; use a Python version supported by the pinned sidecar packages.                                                                       |
| A sidecar download fails                 | Check connectivity and release access. FFmpeg currently downloads from the Photokin repository's `ffmpeg-sidecars` release. Do not replace it with an untrusted binary. |
| A changed Python script seems ignored    | Rebuild that sidecar with `--force`; existing binaries are otherwise reused.                                                                                            |
| Rust fails to compile or link on Windows | Check the MSVC Rust toolchain, C++ Build Tools, Windows SDK, and Tauri prerequisites.                                                                                   |
| Port 1420 is occupied                    | Stop only the development process you own, or reuse your existing dev session. Vite intentionally fails rather than changing ports.                                     |
| ExifTool is unavailable                  | Complete onboarding setup, locate the executable, or verify PATH and restart the app.                                                                                   |
| Native tests report locked sidecar files | Close your running Photokin development app before retrying.                                                                                                            |
