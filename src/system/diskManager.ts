import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as path from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { epochMsToDate } from '@/utils/date.utils';

export interface TauriFileStat {
  /**
   * Timestamp of last modification (UNIX epoch time, in milliseconds), or
   * `null` when the platform/filesystem does not expose it.
   */
  mtime: number | null;
  /**
   * Creation timestamp (UNIX epoch time, in milliseconds), or `null` when the
   * platform/filesystem does not expose it.
   */
  ctime: number | null;
  /** Is this a directory. */
  isDir: boolean;
  /** Is this a regular file. */
  isFile: boolean;
  /** File size in bytes. */
  size: number;
  /**
   * Stable, rename-proof file identity (inode on Unix, file index on Windows),
   * as a string to stay safe across the JS number range. `null` when the
   * platform/filesystem does not expose it.
   */
  inode: string | null;
}

/** A directory child paired with the metadata the library sync relies on. */
export interface TauriDirEntryStat {
  name: string;
  isDir: boolean;
  isFile: boolean;
  /** Modification time (UNIX epoch ms), or `null` when unavailable. */
  mtime: number | null;
  /** Creation time (UNIX epoch ms), or `null` when the platform omits it. */
  ctime: number | null;
  size: number;
  /** Stable file identity (see {@link TauriFileStat.inode}). */
  inode: string | null;
}

export interface FileTimestamps {
  created: Date | null;
  modified: Date | null;
}

/** Return your current platform-specific path segment separator:

- `\` on Windows
- `/` on POSIX 
*/
export const currentOsPathSep = path.sep();

export const normalizedPathSep = '/';

export async function tauriFileStat(filename: string): Promise<TauriFileStat> {
  return invoke<TauriFileStat>('filestat', { filename });
}

/**
 * Bytes free on the filesystem that holds `path`. The path need not exist yet —
 * the backend walks up to the nearest existing ancestor before querying.
 */
export async function availableDiskSpace(path: string): Promise<number> {
  return invoke<number>('available_disk_space', { path });
}

/**
 * Lists the direct children of a directory together with their modification
 * time, size and stable file identity in a single native call. Much cheaper
 * than `readDir` + a `filestat` per entry, and the only reliable way to read the
 * file index on Windows.
 */
export async function tauriDirEntriesStat(dir: string): Promise<TauriDirEntryStat[]> {
  return invoke<TauriDirEntryStat[]>('dir_entries_stat', { dir });
}

export interface ImportPreviewScan {
  totalFiles: number;
  supportedFilesCount: number;
  supportedFilesSize: number;
  unsupportedFilesCount: number;
  unsupportedFilesSize: number;
  unsupportedExtensions: { extension: string; count: number }[];
  directoriesWithSupportedFiles: string[];
  directoriesWithoutSupportedFiles: string[];
}

export interface DiscoveredImportFile {
  absolutePath: string;
  relativeDir: string;
  filename: string;
  mtime: number | null;
  ctime: number | null;
  directoryMtime: number | null;
  size: number;
  inode: string | null;
  width: number | null;
  height: number | null;
  orientation: number;
}

type ImportDiscoveryEvent =
  | { event: 'chunk'; data: { files: DiscoveredImportFile[]; discovered: number } }
  | { event: 'finished'; data: { discovered: number } };

/**
 * Recursively counts supported vs unsupported files in selected folders, in a
 * single native walk. Avoids one `filestat` IPC (and Windows file-index open)
 * per file — the Add-albums modal only needs names, sizes, and counts.
 */
export async function tauriScanImportPreview(
  directories: string[],
  supportedExtensions: string[],
): Promise<ImportPreviewScan> {
  return invoke<ImportPreviewScan>('scan_import_preview', {
    directories,
    supportedExtensions,
  });
}

/** Stream a native recursive walk while preserving chunk order for async DB writes. */
export async function discoverImportFiles(
  root: string,
  supportedExtensions: string[],
  onChunk: (files: DiscoveredImportFile[], discovered: number) => Promise<void>,
): Promise<number> {
  const onEvent = new Channel<ImportDiscoveryEvent>();
  let writes = Promise.resolve();
  onEvent.onmessage = (message) => {
    if (message.event === 'chunk') {
      writes = writes.then(() => onChunk(message.data.files, message.data.discovered));
    }
  };

  const discovered = await invoke<number>('discover_import_files', {
    root,
    supportedExtensions,
    onEvent,
  });
  await writes;
  return discovered;
}

export async function tauriFileLastModified(filePath: string) {
  return epochMsToDate((await tauriFileStat(filePath)).mtime) ?? new Date(0);
}

/** Filesystem creation/modification dates, read on demand (not persisted). */
export async function tauriFileTimestamps(filePath: string): Promise<FileTimestamps> {
  const stat = await tauriFileStat(filePath);
  return {
    created: epochMsToDate(stat.ctime),
    modified: epochMsToDate(stat.mtime),
  };
}

/** Normalize a path by converting its path separator. Given the path `path\to\my\path`, will return `path/to/my/path` */
export function normalizeAllPathSep(filePath: string) {
  return filePath.replaceAll(/[/\\]/g, normalizedPathSep);
}

/**
 * Joins path segments with the OS-native separator, like Tauri's `join()` but
 * without the IPC round-trip. Use it when building many paths out of DB rows:
 * `await join(...)` per row turns a single query into thousands of sequential
 * IPC calls. Same normalization as `AlbumInClient.fullPath`, so the results stay
 * interchangeable.
 */
export function joinPathSync(...segments: string[]): string {
  return segments
    .map((segment, index) =>
      index === 0 ? segment.replace(/[/\\]+$/g, '') : segment.replace(/^[/\\]+|[/\\]+$/g, ''),
    )
    .filter(Boolean)
    .join(currentOsPathSep)
    .replaceAll(/[/\\]/g, currentOsPathSep);
}

export function pathToImageSrc(filePath: string) {
  return convertFileSrc(filePath);
}

/**
 * Reveal a file in the OS file explorer, opening its containing folder with the
 * file selected. Uses the Tauri opener plugin's `revealItemInDir`.
 */
export async function openContainingFolder(filePath: string) {
  await revealItemInDir(filePath);
}
