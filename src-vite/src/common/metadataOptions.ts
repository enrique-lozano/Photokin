/**
 * How Photokin is allowed to interact with the metadata embedded in your
 * original files (EXIF/IPTC/XMP), independent of the always-safe database.
 *
 * In every mode Photokin freely reads metadata from files into its database.
 * The mode only controls whether changes made inside Photokin (tags,
 * geolocation, ratings…) are ever written *back* into the original files.
 */
export enum MetadataMode {
  /** Never modify original files. Edits live only in the Photokin database. */
  ReadOnly = 'readonly',
  /** Riskier: edits are also written back into the original files' metadata. */
  Full = 'full',
}

export const DEFAULT_METADATA_MODE: MetadataMode = MetadataMode.ReadOnly;

export interface MetadataModeOption {
  value: MetadataMode;
  label: string;
  description: string;
}

export const METADATA_MODE_OPTIONS: MetadataModeOption[] = [
  {
    value: MetadataMode.ReadOnly,
    label: 'Library only',
    description: 'Your edits stay in Photokin’s library and your photo files are never touched.',
  },
  {
    value: MetadataMode.Full,
    label: 'Library and photo files',
    description:
      'Photokin also writes tags, ratings, titles, descriptions and locations into each photo’s metadata (EXIF, IPTC, XMP), so other apps can read them.',
  },
];

export function isMetadataMode(value: unknown): value is MetadataMode {
  return (Object.values(MetadataMode) as unknown[]).includes(value);
}

/**
 * When, in {@link MetadataMode.Full} mode, Photokin flushes edits made in the
 * app back into the original files. Has no effect in read-only mode.
 */
export enum WriteBackTiming {
  /** Accumulate edits and write them to files during the next library sync. */
  DeferredOnSync = 'deferred-on-sync',
  /** Write each edit into the file as soon as it is made in the app. */
  ImmediateOnEdit = 'immediate-on-edit',
}

export const DEFAULT_WRITE_BACK_TIMING: WriteBackTiming = WriteBackTiming.DeferredOnSync;

export interface WriteBackTimingOption {
  value: WriteBackTiming;
  label: string;
  description: string;
}

export const WRITE_BACK_TIMING_OPTIONS: WriteBackTimingOption[] = [
  {
    value: WriteBackTiming.DeferredOnSync,
    label: 'On sync',
    description: 'Collect edits and write them to files in one batch when you sync the library.',
  },
  {
    value: WriteBackTiming.ImmediateOnEdit,
    label: 'Immediately',
    description: 'Write each change into the file the moment you make it in Photokin.',
  },
];

export function isWriteBackTiming(value: unknown): value is WriteBackTiming {
  return (Object.values(WriteBackTiming) as unknown[]).includes(value);
}
