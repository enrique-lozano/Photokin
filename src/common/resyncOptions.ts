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

export interface ResyncModeOption {
  value: ResyncMode;
  label: string;
  description: string;
}

export const RESYNC_MODE_OPTIONS: ResyncModeOption[] = [
  {
    value: ResyncMode.Off,
    label: 'New & removed only',
    description: 'Only finds new, renamed and removed files. Existing photo details in Photokin stay as-is.',
  },
  {
    value: ResyncMode.Mtime,
    label: 'Modified time',
    description:
      'Re-reads details when a file’s modified time changes. Details stored only in Photokin may be replaced.',
  },
  {
    value: ResyncMode.SizeMtime,
    label: 'Modified time + File size',
    description:
      'Most thorough. Re-reads details when size or modified time changes; Photokin-only details may be replaced.',
  },
];

export function isResyncMode(value: unknown): value is ResyncMode {
  return (Object.values(ResyncMode) as unknown[]).includes(value);
}
