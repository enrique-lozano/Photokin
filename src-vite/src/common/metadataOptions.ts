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

export function isWriteBackTiming(value: unknown): value is WriteBackTiming {
  return (Object.values(WriteBackTiming) as unknown[]).includes(value);
}
