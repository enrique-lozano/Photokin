# Testing Photokin

Use the smallest check covering your change. Keep test photos separate from your
real library and never use your only originals.

## Common checks

Run from the repository root:

| Purpose                                  | Command                                           |
| ---------------------------------------- | ------------------------------------------------- |
| Focused frontend tests                   | `pnpm exec vitest run <test-file-or-directory>`   |
| All frontend tests, once                 | `pnpm test --run`                                 |
| Interactive frontend tests               | `pnpm test`                                       |
| Production frontend type-check and build | `pnpm run build`                                  |
| Type-check including tests               | `pnpm run typecheck`                              |
| Lint                                     | `pnpm lint`                                       |
| Check source formatting                  | `pnpm prettier:check`                             |
| Rust tests                               | `cargo test --manifest-path src-tauri\Cargo.toml` |

The production build excludes test files; it is not a substitute for checking
new test types. The build also runs sidecar setup through `prebuild`; see
[local setup](RUN_THE_CODE_LOCALLY.md).

For a focused TypeScript change, lint/format the changed files rather than
rewriting unrelated files. Documentation-only edits need link/anchor and rendered
Markdown checks, not a native rebuild.

## Detail-page navigation

```powershell
pnpm exec vitest run src\components\page-content\EntityDetailRoute.test.tsx src\pages\people\PersonDetail.test.tsx src\components\timeline-gallery\TimelineScrubber.test.tsx
```

People and Tags reset the entire detail subtree when the route's entity ID
changes. Check person-to-person and tag-to-tag navigation after scrolling,
selecting a filter chip, or opening a dialog. The new item must not show the
previous item's photos, counts, dates, filters or open dialogs, and its scroll
position starts at the top. The catalog sidebar and its selection stay mounted.
With the same item selected, background database updates must refresh the page
without resetting its scroll position, active chips or dialogs. The saved
Photos/Faces preference and the Tags "Include subtags" preference still apply.

While switching people and toggling chips or Photos/Faces, check that there is
exactly one `#grid` in Photos mode and none in Faces mode. The gallery and
profile-photo dialog must not share sibling React keys: duplicate keys can
leave orphaned grids, blank space, and observers attached to the wrong grid.
Check scrolling within a single month as well as across months; both need the
right-hand timeline indicator whenever the gallery overflows the viewport.

## About and donation links

```powershell
pnpm exec vitest run src\pages\settings\SettingsAbout.test.tsx src\components\support-project\SupportProject.test.tsx
```

Tests cover the header version, license and system lines, copying system info,
the canonical project links, all three donation destinations, no unsolicited
browser launch, and visible errors when launch fails. They mock native browser
opening: also check **Settings > About** and the heart **Donate** badge in the
main footer. Verify that both the badge and the About page's **Donate** button
open a chooser without opening a browser, that Escape dismisses it and restores
focus, and that platform links work with the keyboard and open in the system
browser. Check light/dark themes and narrow windows. Never complete a payment as
part of testing.

The donation line closes the About page. The title is "Donate a little love".
Hearts should be red in both themes. The About heart keeps pulsing while
visible. With reduced motion enabled, heartbeat animations must not run. The
footer badge itself retains its brief interaction-only heartbeat.

The footer badge has a 30% chance of appearing at main-window startup. Its choice
stays stable across navigation, re-renders, and component remounts; About remains
available regardless. Tests use fixed random draws on both sides of the exact
0.3 threshold, not a flaky statistical sample.

## In-app updates

```powershell
pnpm exec vitest run src\system\appUpdater.test.ts src\pages\settings\SettingsUpdates.test.tsx
```

Tests cover the check on app start (skipped in dev builds and when turned off),
quiet failures when offline, remembering the latest answer for the running
version, the About updates line (not checked, up to date, update available),
refusing to install while library tasks run, and the download → install →
restart order. They mock the updater plugin. An end-to-end check needs two
published releases: install the older one, publish a newer tag, then use
**Settings > About > Check for updates** and confirm Photokin restarts on the
new version.

## Smart search model selection

```powershell
pnpm exec vitest run src\media\smartSearch\models.test.ts src\media\smartSearch\modelDownload.test.ts src\components\settings\SettingsRadioCard.test.tsx src\components\dependencies\DependencyStatusCards.test.tsx
```

In onboarding, check both language choices and select cards with the keyboard.
All choice cards (including metadata and settings) should have their radio
indicator on the right. Model cards show indexing speed and search accuracy as
relative estimates, not benchmark measurements.

In **Settings > System**, Smart search comes first, followed by Photo tools,
Storage and Danger zone. Only the active search model is shown; its **Change**
button opens `/settings/smart-search/models` within the settings shell.
Storage lists the database, thumbnail and search-model folders, each with an
open-folder button.
Photo tool rows show readiness and version; expand a row to see its complete
installed location and open its folder. Check keyboard expansion and that
collapsed folder actions are not focusable. Missing-tool errors stay visible.
Check the In use, Downloaded, Not downloaded, and Downloading groups with
downloaded and missing models. Empty groups are hidden. Each model belongs to
exactly one group; a downloading active model belongs to Downloading.
Navigate back and forth during a download and verify progress is retained,
completion moves the model to the correct group, and failed downloads can be
retried. Use model must only be available for downloaded models. Switching
rebuilds the local search index. Check narrow windows and both themes.

Browser checks with native IPC mocked validate presentation and navigation only;
real downloads, opening folders, and indexing must also be checked in Tauri.

## Photo editor regression tests

```powershell
pnpm exec vitest run src\media\edit src\db\api\services\assets\assetImageEdit.test.ts
cargo test --manifest-path src-tauri\Cargo.toml
```

The editor integration tests use the development dependency's bundled ExifTool,
not an executable on `PATH`. They run the production metadata arguments through
UTF-8 argfiles against `demo/exif-samples`. All writes use temporary directories;
the tests verify that source bytes remain unchanged. Close the desktop app before
native tests if Windows reports locked sidecar files.

Coverage includes all eight EXIF orientations in portrait and landscape, the
JPEG/PNG/WebP encoders, rotation/flip pixels, crop and resize, ICC profiles,
camera/capture/GPS metadata, XMP provenance, face-region replacement and removal,
stale thumbnails, Unicode paths and names, transparency, 16-bit PNG, preview
fallback, read-only originals, collisions, changed sources, sidecars, and failed
metadata writes.

Compatibility assertions distinguish successful preservation from safe rejection:
the malformed-XMP, HEIC, RAW, and AVIF samples that emit metadata warnings must
not be committed by the save service. Non-standard IPTC-in-PNG also warns. WebP
does not store legacy IPTC; its supported XMP equivalents are checked separately.
These tests exercise native commands and the save service independently, not the
complete desktop confirmation/window lifecycle or the FFmpeg preview generator.

## Manual checks and reporting

For UI changes, exercise the actual affected flow in Tauri, check keyboard
navigation and both light/dark themes, and confirm errors are visible. Browser
component checks can help with layout but do not verify native capabilities.

For photo writes, test supported formats and rejection paths with disposable
copies. Verify the saved output and original bytes where appropriate; a
successful command alone does not prove metadata preservation.

In a PR, report each exact command and whether it passed or failed. Distinguish
unit tests, browser checks with mocks, and real desktop validation. State
unverified behavior explicitly.
