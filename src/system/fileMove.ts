import { copyFile, remove, rename } from '@tauri-apps/plugin-fs';

/**
 * Moves a single file. `rename` is atomic and instant on the same volume but
 * fails across volumes/drives, so fall back to copy + delete of the original.
 */
export async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch {
    await copyFile(source, destination);
    await remove(source);
  }
}

/**
 * Renames a directory on the same filesystem. Deliberately has no copy/delete
 * fallback: album hierarchy moves are restricted to one library root and must
 * remain a single filesystem operation.
 */
export async function moveDirectory(source: string, destination: string): Promise<void> {
  await rename(source, destination);
}
