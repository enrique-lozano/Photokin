# Code contributions

Start with [local setup](RUN_THE_CODE_LOCALLY.md) and the
[community contribution guide](../CONTRIBUTING.md). Keep changes focused and
preserve existing behavior unless the change intentionally updates it.

## Contributor workflow

1. Fork/clone the repository and create a focused working branch from the
   current development base. Check the repository's current default branch and
   maintainer guidance; do not assume a separate `develop` branch.
2. Run the app with a separate test library before making changes.
3. Implement the smallest complete solution, reusing existing helpers and UI.
4. Add regression tests for nontrivial behavior and update related docs.
5. Run the [relevant checks](TESTING.md), then open a PR explaining the change,
   exact validation commands/results, and any remaining gaps.

No additional branch protection or Conventional Commits policy is established
by this guide. Follow repository requirements when submitting. AI-generated
commits must include an `Includes-AI-Code: true` trailer.

Contributions are subject to the [CLA](../CLA.md). Never commit credentials,
personal libraries, or private photo metadata.

## Architecture at a glance

```text
React UI -> domain services / system wrappers -> SQLite or Tauri commands
                       |
               table observables -> live queries
```

| Area              | Location / pattern                                                    |
| ----------------- | --------------------------------------------------------------------- |
| Pages and routes  | `src/pages/`, `src/router.tsx`, `AppRoutes`                           |
| Shared interface  | `src/components/`, primitives in `src/components/ui/`                 |
| Local persistence | `src/db/models/`, Kysely services in `src/db/api/services/`           |
| Reactive reads    | `useLiveQuery` / existing live-asset hooks and RxJS table observables |
| Writes            | `executeInDB(...)` so subscribed views are invalidated                |
| UI/session state  | Existing Zustand stores under `src/stores/`                           |
| Photo processing  | `src/media/`, native commands in `src-tauri/src/commands/`            |
| OS integrations   | `src/system/`                                                         |
| Sidecars          | `scripts/` and `src-tauri/resources/`                                 |

There is no REST backend or cloud library. Do not introduce one as part of a
local-data feature. Use existing services and reactive queries rather than
ad-hoc fetch effects.

## TypeScript and UI

- Keep strict types and match nearby naming, imports, and formatting.
- Reuse shared buttons, dialogs, menus, tooltips, and toast helpers.
- Use the Components gallery's typography, semantic colors, and theme tokens.
  Inherit defaults; justify exceptions instead of adding one-off scales.
- Keep primary wording understandable without metadata knowledge; put precise
  EXIF/IPTC/XMP details in secondary copy or progressive disclosure.
- Surface failures through existing feedback patterns; do not pretend a failed
  operation succeeded.

### Large sidebar lists

Use `SeparatedListView` from `src/components/ui/separated-list-view.tsx` rather
than mapping every row into a scroll container. Like Flutter's
`ListView.separated`, it builds visible rows plus a small buffer; separators
are optional. TanStack Virtual handles viewport tracking and row measurement.

Supply `items`, a stable `itemKey`, `renderItem`, an approximate `estimateSize`
(pixels, including the separator), and an accessible `aria-label`. Place it
inside a bounded-height flex column; the list owns scrolling and fills the
remaining space. Rows can have different heights. Group headings should be
rendered with their first row, not as separate non-interactive items.

Use `separatorBuilder` for gaps or dividers and `emptyState` for no results.
Give the component a new React `key` on filter/sort changes to reset scrolling;
do not key it by selection. Each row should contain a focusable control:
Tab/Shift+Tab, arrows, Home and End navigate unmounted rows too, and focused
rows stay mounted during mouse scrolling. Keep interactive row state outside
the row because offscreen rows unmount.

The Components page includes a 10,000-row variable-height example. Duplicate
sets and Places use this primitive; other lists can adopt it independently.

## Native work

Decode, hash, thumbnail, and other heavy image work belongs in Rust or the
existing native sidecars, not JavaScript pixel buffers. Prefer paths and small
IPC payloads. Check existing Tauri plugins and shared Rust helpers first.

For a new command, export it from the commands module, register it in
`src-tauri/src/main.rs`, add a typed TypeScript wrapper, and check the relevant
window's capabilities. Follow existing `Result` error handling and blocking-work
patterns. Never log photo contents, GPS, or face data.

Rust command tests follow the existing `src-tauri/src/tests/` layout.

## Database and metadata changes

Do not change schema incidentally. An approved schema change must follow the
[migration guide](../src/db/migrations/README.md) and update matching DTO/types
and tests. Never delete a user's library to make a migration pass.

Before changing file writes, read [Photo safety](PHOTO_SAFETY.md) and the
[ExifTool writing reference](../src/media/metadata/exiftool/write/writing-with-exiftool.md).
Preserve the distinction between library edits, metadata write-back, explicit
editor saves, and destructive filesystem operations.

## Reference documentation

- [Testing](TESTING.md)
- [Sidecar setup](../scripts/README.md)
- [Color system](../src/styles/color-system.md)
- [Privacy and network access](PRIVACY_POLICY.md)

Agent-specific instructions remain in [AGENTS.md](../AGENTS.md); contributors do
not need an AI tool to work on Photokin.
