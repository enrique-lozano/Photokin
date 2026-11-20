/**
 * How the library sync decides whether an already-indexed file has changed on
 * disk and needs re-reading. Rename detection (via the stable file identity) is
 * always active and independent of this mode.
 */
export enum ResyncMode {
  /** Never re-read existing files; only add new and remove deleted ones. */
  Off = 'off',
  /** Re-read a file when its modification time changed. */
  Mtime = 'mtime',
  /** Re-read a file when its modification time or size changed (most thorough). */
  SizeMtime = 'size-mtime',
}

export const DEFAULT_RESYNC_MODE: ResyncMode = ResyncMode.Off;

export function isResyncMode(value: unknown): value is ResyncMode {
  return (Object.values(ResyncMode) as unknown[]).includes(value);
}
