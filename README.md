# Photokin

**Your photos, organized on your own computer.**

Photokin is a local-first desktop photo gallery for browsing, organizing, and
rediscovering your photos and videos. Your library lives on your device, without
a cloud account or analytics.

> **Coming soon:** Photokin is preparing to become public and ship its first
> release. Expect changes while it is in development. Try it with backed-up
> copies of your photos, not your only originals.

[Features](#why-photokin) · [Getting started](#getting-started) ·
[Contributing](#contributing) · [Support](#support-the-project) · [License](#license)

## Why Photokin?

- **Browse your collection** through albums, a timeline, and a calendar.
- **Find the right photo** with filters, tags, ratings, and natural-language
  search powered by a locally running model.
- **Put names to faces** with on-device face detection and recognition, with
  suggestions you can review.
- **Explore places** using the locations stored in your photos.
- **Review duplicates** before deciding what to keep.
- **Make photo edits** such as crop, rotation, and resize, then save a copy or
  explicitly replace a supported original.
- **Choose where photo details live:** keep changes in Photokin's library, or
  enable writing supported metadata back to your photo files.

You do not need to know what EXIF, IPTC, or XMP means to organize your photos.
For photographers who do, Photokin also exposes detailed metadata and controls
for writing it.

## Local-first, with clear online boundaries

Photo processing, face recognition, and semantic search run on your computer.
There is no cloud library or analytics. Some features still use the internet:
map tiles, elevation lookups, and downloading search models or dependencies.
Elevation lookups send coordinates to the provider.

See [Privacy and network access](docs/PRIVACY_POLICY.md) and
[Photo safety](docs/PHOTO_SAFETY.md) before working with sensitive or irreplaceable
photos. "Library only" metadata mode is not a general filesystem write lock:
explicit editor saves and Trash actions can still change files.

## Getting started

### Use the app

The first public release is coming soon. When published, downloads will be
announced on the [releases page](https://github.com/enrique-lozano/Photokin/releases).
The current installer configuration targets Windows (NSIS); macOS and Linux
release support is not yet promised.

### Run from source

Follow the [local setup guide](docs/RUN_THE_CODE_LOCALLY.md) for the native
toolchain, Python sidecars, and ExifTool setup. Once prerequisites are installed:

```powershell
pnpm install
pnpm run tauri dev
```

The first startup downloads/builds missing sidecars and can take several minutes.
Photokin is a desktop app; running Vite alone is not a standalone browser version.

## Built with

- **React + TypeScript** for the interface, with Tailwind and shared UI primitives.
- **Tauri + Rust** for the desktop shell and native image/filesystem work.
- **SQLite + Kysely** for local data, with live queries and Zustand for UI state.
- **ExifTool, FFmpeg, and Python sidecars** for metadata, previews, face
  recognition, and semantic search.

## Contributing

Bug reports, documentation, design feedback, and code contributions are welcome.
Start with the [contribution guide](CONTRIBUTING.md), or go straight to the
[developer guide](docs/CODE_CONTRIBUTING.md).

Please use sanitized examples when reporting photo-related problems: images and
logs can reveal faces, GPS coordinates, names, and personal file paths.

### Documentation

- [Run locally](docs/RUN_THE_CODE_LOCALLY.md)
- [Code contributions and architecture](docs/CODE_CONTRIBUTING.md)
- [Testing](docs/TESTING.md)
- [Privacy and network access](docs/PRIVACY_POLICY.md)
- [Photo safety](docs/PHOTO_SAFETY.md)
- [Sidecar scripts](scripts/README.md)

## Support the project

If you find Photokin useful, an optional donation helps support its development:

- [Donate with PayPal](https://paypal.me/lozanoelc?country.x=ES&locale.x=es_ES)
- [Buy Me a Coffee](https://www.buymeacoffee.com/enrique.lozano)
- [Donate with Liberapay](https://liberapay.com/enrique-lozano/donate)

The heart **Donate** badge appears in the main window's footer on approximately
30% of launches. The same card is always available in **Settings > About**.
Payments take place on
third-party services, not inside Photokin. Reporting bugs, improving docs, and
sharing feedback are equally welcome ways to help.

## License

Photokin's source code is free software under the
[GNU AGPL-3.0-only](LICENSE). The maintainer also offers commercial licensing;
pre-built, signed releases are planned. Contributions are accepted under the
[Contributor License Agreement](CLA.md).
