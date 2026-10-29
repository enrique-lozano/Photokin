import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { joinPathSync } from './diskManager';

/**
 * Name of the app-managed Trash folder. It lives next to the thumbnail cache
 * (both hold large media and belong in local, non-roaming app data) rather than
 * in the OS recycle bin, so trashed photos can be listed, restored and purged by
 * the app itself.
 */
export const TRASH_DIR_NAME = 'trash';

let cachedTrashDir: string | null = null;
let trashDirPromise: Promise<string> | null = null;

/** Absolute path of the app-managed Trash directory. */
export function getTrashDir(): Promise<string> {
  trashDirPromise ??= appLocalDataDir().then((dir) => {
    cachedTrashDir = joinPathSync(dir, TRASH_DIR_NAME);
    return cachedTrashDir;
  });

  return trashDirPromise;
}

/**
 * Same as {@link getTrashFilePath} without the IPC round-trip, for hydrating many
 * rows at once. Requires {@link getTrashDir} to have resolved once.
 */
export function getTrashFilePathSync(id: string, filename: string): string {
  if (!cachedTrashDir) {
    throw new Error('The Trash directory is not resolved yet. Await getTrashDir() first.');
  }

  return joinPathSync(cachedTrashDir, id, filename);
}

/**
 * Absolute path a trashed asset's file is stored at. Each asset gets its own
 * `{id}/` subfolder so the original filename is preserved for restore and two
 * assets that share a name never collide.
 */
export async function getTrashFilePath(id: string, filename: string): Promise<string> {
  return join(await getTrashDir(), id, filename);
}

/** Absolute path of a trashed asset's own subfolder (removed on purge/restore). */
export async function getTrashItemDir(id: string): Promise<string> {
  return join(await getTrashDir(), id);
}
