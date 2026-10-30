/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: keeps the library in `profiles/<name>/` (see `pnpm dev:demo` and `screenshots/README.md`). */
  readonly VITE_PHOTOKIN_PROFILE?: string;
  /** Dev-only: overrides the OS locale used for country names (set by `pnpm screenshots`). */
  readonly VITE_PHOTOKIN_LOCALE?: string;
}

// Older @fontsource-variable packages ship CSS only, with no type declarations.
declare module '@fontsource-variable/*';
