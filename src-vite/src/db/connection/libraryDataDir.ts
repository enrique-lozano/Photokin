import { appLocalDataDir, join } from '@tauri-apps/api/path';

/**
 * Dev builds can run on a separate library profile (`pnpm dev:demo`,
 * `pnpm screenshots`), so testing never touches the real library.
 */
const DEV_PROFILE = import.meta.env.DEV ? import.meta.env.VITE_PHOTOKIN_PROFILE : undefined;

/**
 * Folder holding the library: database, thumbnails and Trash. Downloaded search
 * models live in `appLocalDataDir()` directly, so every profile shares them.
 */
export async function getLibraryDataDir(): Promise<string> {
  const base = await appLocalDataDir();
  return DEV_PROFILE ? join(base, 'profiles', DEV_PROFILE) : base;
}
