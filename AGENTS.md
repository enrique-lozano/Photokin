# AGENTS.md

AI agent guide for **Photokin** — a local-first desktop photo gallery (Tauri +
React). Covers behavioral rules, architecture, and common task playbooks.

---

## Skills & Precedence

Reusable Agent Skills live under `.cursor/skills/`. They are helpful defaults,
**but this `AGENTS.md` and the actual patterns in the codebase always win.**
When a skill conflicts with the project, follow the project.

Known conflicts:

- **Data**: Photokin is local-first (SQLite via `@tauri-apps/plugin-sql` +
  Kysely). Do not introduce REST backends, cloud sync, or telemetry unless the
  prompt explicitly asks.
- **DB reads in React**: use `useLiveQuery` / existing services, not ad-hoc
  `useEffect` + fetch loops. See `.cursor/skills/react-useeffect/`.
- **Heavy image work**: decode, hash, thumbnail, trash, and clipboard bitmap
  copy belong in **Rust Tauri commands**, not in the frontend. Keep IPC payloads
  small (paths, not pixel buffers).
- **UI primitives**: use `src/components/ui/` (Radix + Tailwind) before adding
  new libraries or raw HTML controls.
- **Routing**: `react-router-dom` + `AppRoutes` in `src/router.tsx`. Do not add
  another router.
- **State**: Zustand (`stores/appState.ts`) for UI/session state; RxJS table
  observables for DB invalidation. Do not add Redux/React Query unless asked.

If a skill is useful but conflicts on details, adapt its intent to Photokin.

---

## Behavioral Guidelines

These come first because they prevent the most mistakes.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don’t pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it. _"Don't walk away from complexity, run!"_
- Don’t comment the obvious. Keep comments short; skip them on simple code.

### 3. Surgical Changes

- Don’t “improve” adjacent code, comments, or formatting.
- Don’t refactor things that aren’t broken.
- Match existing style, even if you’d do it differently.
- If you notice unrelated issues, mention them — don’t fix them.
- Remove only what **your** changes made unused.

### 4. Goal-Driven Execution

- Transform tasks into verifiable goals.
- For multi-step tasks, state a brief plan with verification steps.
- Unverified work is incomplete work.

### 5. Output Precision

- Lead with findings, not process descriptions.
- Use structured formats (lists, tables, code blocks).
- Include absolute file paths — never relative.

---

## Overview

- **Frontend**: React 19 + Vite + TypeScript + Tailwind 4 + Radix / Base UI (`components/ui`)
- **Desktop**: Tauri 2 (`src-tauri/`) — Rust commands for filesystem,
  thumbnails, hashing, trash, clipboard
- **Persistence**: SQLite (`@tauri-apps/plugin-sql`) + Kysely query builder
- **UI state**: Zustand
- **Live queries**: `useLiveQuery` + RxJS table observables
- **Sidecars**: ffmpeg (video/HEIC previews), face-recognition Python sidecar,
  ExifTool (must be installed on the machine)

There is no web server mode. Don’t add one.

## Audience

Photokin serves two audiences at once — design every surface for **both**:

- **Non-technical users** who don’t know what photo“metadata” is (EXIF, IPTC, XMP...). Use plain language, safe defaults, and progressive disclosure; never require metadata knowledge to finish a task.
- **Professional photographers & metadata experts** who care about exact fields, provenance (e.g. embedded-in-file vs app-derived), and standards (EXIF/IPTC/XMP). Give them precise detail and control on demand.

Rule of thumb: plain-language primary UI, with expert detail one hover/click away (tooltip, secondary row, “advanced” affordance) rather than on the surface.

## Code Layout

```
src/
├── main.tsx              # React entry
├── router.tsx            # createBrowserRouter + AppRoutes
├── pages/                # Route pages (albums, people, tags, …)
├── components/           # Shared UI (gallery, lightbox, shell, ui/)
├── db/
│   ├── connection/       # DB open, Kysely, useLiveQuery
│   ├── api/services/     # Domain services (AlbumsService, …)
│   └── models/           # DTOs + SqliteDbStructure
├── media/                # Metadata (ExifTool), thumbnails, previews
├── system/               # OS/Tauri wrappers (clipboard, trash, disk)
├── stores/               # Zustand
├── common/               # Search/filter query parsing
├── hooks/                # Shared hooks
└── styles/               # Global / shared CSS
src-tauri/
└── src/commands/         # Tauri IPC (thin; heavy work in Rust)
scripts/                  # Sidecar setup (ffmpeg, face recognition)
website/                  # Public website + user guide (VitePress, GitHub Pages)
screenshots/              # README/website screenshot capture + slide template
```

## Run Targets

| Task            | Command                                |
| --------------- | -------------------------------------- |
| Install         | `pnpm install`                         |
| Desktop dev     | `pnpm run tauri dev`                   |
| Frontend only   | `pnpm run dev`                         |
| Typecheck/build | `pnpm run build` (`tsc && vite build`) |
| Tests           | `pnpm test`                            |
| Lint            | `pnpm lint` / `pnpm lint:fix`          |
| Format          | `pnpm prettier`                        |

Check [Tauri 2 docs](https://v2.tauri.app/) before inventing new native
capabilities.

---

## Agent Playbook

### Adding a feature with local data

1. **Model** → DTO / `SqliteDbStructure` in `src/db/models/`.
2. **Service** → methods on the matching `src/db/api/services/*`. Follow the
   existing singleton (`export const FooService = new _FooService()`). Writes
   go through `executeInDB(...)` so table observables fire.
3. **UI** → page under `src/pages/` or shared component. Subscribe with
   `useLiveQuery` / `useLiveAsset`, not a one-off fetch effect.
4. **Route** → wire `AppRoutes` + `createBrowserRouter` in `router.tsx` if it is
   a top-level page.
5. **Test** → Vitest next to the module (`*.test.ts`) when logic is non-trivial.

Schema changes go in a new file under `src/db/migrations/` (see its
`README.md`). Do not add one unless the prompt explicitly asks.

### Adding a Tauri command (native work)

1. Implement in `src-tauri/src/commands/<domain>.rs`. Put reusable helpers in
   `src-tauri/src/shared/` (image decode, `run_blocking`, …).
2. `pub use` the command from `commands/mod.rs` and add it to `invoke_handler`
   in `src-tauri/src/main.rs`.
3. Wrap `invoke('command_name', { … })` in a small TS helper under `src/system/`
   or the relevant domain folder (see `clipboard.ts`).
4. Prefer passing **file paths**; do CPU/IO in Rust (`run_blocking` when needed).
5. Unit tests live in `src-tauri/src/tests/<domain>.rs`, included with
   `#[cfg(test)] #[path = "../tests/<domain>.rs"]` from the module they test.

Check whether a Tauri plugin already covers it (`plugin-fs`, `plugin-dialog`,
`plugin-clipboard-manager`, …) before a custom command.

### UI patterns

- Primitives: `src/components/ui/` (button, dialog, context-menu, …).
- Feedback: existing toast helpers, not ad-hoc alerts.
- Theme/tokens: existing CSS variables and Tailwind; don’t hardcode a one-off
  palette unless designing a new surface (then use the `frontend-design` skill).
- Typography: use the Components page's scale and semantic colors; inherit defaults.
  Keep one-off text styles in JSX, reuse shared UI, and justify exceptions.
- Colocate component CSS next to the component when that is the local pattern.
- Gallery/lightbox: reuse `TimelineGallery`, `PhotoInGallery`, `Lightbox*`
  rather than new grid implementations.

### Architecture

```
React UI  →  TS services / system wrappers  →  invoke() or plugin-sql
                ↓                              ↓
         Kysely + SQLite                  Rust commands (image, hash, trash)
                ↓
         tableObservables → useLiveQuery
```

---

## Conventions

### TypeScript / React

- Functional components, named exports where neighbors use them.
- Strict TypeScript; don’t add `any` to silence errors.
- Prefer existing hooks (`useLiveQuery`, selection hooks) over new Effect graphs.
- Directory names: lowercase / existing folder names.

### Rust

- Keep Tauri commands focused; share helpers in `src-tauri/src/shared/`
  (e.g. image decode used by thumbnails, hashing, and clipboard).
- Return `Result<T, String>` (or existing error style) at the IPC boundary.
- Don’t log full file contents or user photo paths in noisy loops.

### Privacy

- Library data stays on-device. No cloud, no analytics, no phone-home.
- Never log EXIF, GPS, or face data.

---

## Validation Checklist

Before completing any task:

- [ ] `pnpm test` for logic you changed, or a targeted Vitest file.
- [ ] Lint/format if you added nontrivial TS.
- [ ] If UI changed: exercise the flow (dev app / browser tools when available).
- [ ] If you added IPC: command registered in `main.rs` and wrapped in TS.
- [ ] Changes are minimal and surgical.

---

## Git

- Do not create commits unless explicitly asked.
- When asked to commit AI-generated work, add the trailer
  `Includes-AI-Code: true`.

---

## Plan Mode

- Make plans extremely concise. Sacrifice grammar for brevity.
- End with unresolved questions, if any.

---

When in doubt, follow the nearest existing pattern.
