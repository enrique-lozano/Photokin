# Testing Photokin

Use the smallest check covering your change. Keep test photos separate from your
real library and never use your only originals.

## Common checks

Run from the repository root:

| Purpose                                  | Command                                           |
| ---------------------------------------- | ------------------------------------------------- |
| Focused frontend tests                   | `pnpm test --run <test-file-or-directory>`        |
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

Frontend test selectors are relative to `src-vite/`, because the root test
command runs Vitest in that workspace package. For example, `src\media\edit`
selects `src-vite\src\media\edit`. For direct frontend tools, use
`pnpm --dir src-vite exec <tool> ...`.

For a focused TypeScript change, lint/format the changed files rather than
rewriting unrelated files. Documentation-only edits need link/anchor and rendered
Markdown checks, not a native rebuild.

## Photo-library query editor

```powershell
pnpm test --run src\common\query src\components\toolbar\search-bar src\stores\recentSearchesStore.test.ts src\pages\search src\media\smartSearch\searchResults.test.ts src\db\api\services\assets\getScopedAssetIds.test.ts
```

The query bar is draft-only until Enter. Verify cursor-local replacement
in the middle of a mixed query, quoted values and comma-separated names,
keyboard-highlighted Enter/Tab completion, Escape/Down reopening, native undo/redo
after completion and clear, IME composition, and Back/Forward restoring the
submitted query. Check loading, catalog errors with Retry, no matching values,
and the 50-value truncation message. Test both themes and a narrow window.

Focus an empty field: show at most three recent queries above filters. Typing
filters the full retained history by case-insensitive substring before limiting
to three, newest first. Check ordinary text, filter values, quoted drafts and no
matches; history must work even without a syntax-completion context. Mouse or highlighted
Enter/Tab restores a draft without navigating; Enter then submits it. Only
submitted, non-empty queries are saved; repeating one moves it to the top, with
20 retained locally across reloads. Check remove-one, Clear history, and Tab from
the empty input into history actions. Clearing history must not affect results
or library filters. With no text there is no clear or submit button; hover the
clear and library-filter controls and verify they stay inside the field, including
paused filters and narrow windows.

Query and library filters must never be relaxed automatically. Test missing
people, contradictory filters and zero candidate IDs; Show weaker matches must
retain the same scope. Bare words stay text, and invalid known filters stay text
with an explanation. Search failures must offer Retry rather than claim no results.
Clear query filters must retain library filters and quoted ordinary text.

Presence uses existing counts: assigned file tags, and detected faces including
unnamed faces according to Count unverified faces. The focused SQLite tests
verify those actual query semantics.

Browser checks with local service mocks validate editor behavior, not native IPC
or semantic sidecar execution. Also verify the results flow in Tauri on an
isolated demo profile when the development executable is available. Do not close
another running Photokin instance without its owner's permission.

## Detail-page navigation

```powershell
pnpm test --run src\components\page-content\EntityDetailRoute.test.tsx src\pages\people\PersonDetail.test.tsx src\components\timeline-gallery\TimelineScrubber.test.tsx
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
pnpm test --run src\pages\settings\SettingsAbout.test.tsx src\components\support-project\SupportProject.test.tsx
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
pnpm test --run src\system\appUpdater.test.ts src\pages\settings\SettingsUpdates.test.tsx
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
pnpm test --run src\media\smartSearch\models.test.ts src\media\smartSearch\modelDownload.test.ts src\components\settings\SettingsRadioCard.test.tsx src\components\dependencies\DependencyStatusCards.test.tsx
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

## Managed ExifTool setup checks

```powershell
pnpm test --run src\system\exiftoolSetup.test.ts src\components\dependencies\DependencyStatusCards.test.tsx src\pages\onboarding\steps\DependenciesStep.test.tsx src\pages\onboarding\steps\ExiftoolSetupCard.test.tsx
cargo test --manifest-path src-tauri\Cargo.toml exiftool_setup
cargo test --manifest-path src-tauri\Cargo.toml exiftool_setup -- --ignored
```

The final command downloads the pinned official platform archive and the Perl
distribution into temporary directories, verifies their checksums, and runs
real metadata write/read checks with the platform executable.
It requires internet access and Perl on macOS/Linux. It does not change
Photokin's configured installation or the system ExifTool. Run it on each
supported platform before changing the managed version. Unit tests also cover
Perl archive extraction, invalid checksums and preservation of the previous
copy/selection after failure. Manually check the existing setup progress and
retry flow, **Install tested version** in Settings, and selecting an
extensionless ExifTool file on macOS/Linux.

To exercise the frontend metadata regression tests against the managed version
rather than the default vendored test dependency, set
`$env:PHOTOKIN_TEST_EXIFTOOL_PATH` to the full path of that version's executable
before running the metadata tests below. Remove the environment variable
afterwards; this override only affects tests, not Photokin's configuration.

## Photo editor regression tests

```powershell
pnpm test --run src\media\edit src\db\api\services\assets\assetImageEdit.test.ts
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
