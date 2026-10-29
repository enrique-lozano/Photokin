/** Shown when an edit was attempted and rejected, so it asks for a retry. */
export const METADATA_SCAN_PENDING_MESSAGE =
  'Photo details are still being read. Try again when scanning is complete.';

/** Metadata edits are safe once the initial file read has produced a scan time. */
export function hasScannedMetadata(asset: { metadata: { lastScanned: string | null } }): boolean {
  return asset.metadata.lastScanned !== null;
}

export function metadataEditErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === METADATA_SCAN_PENDING_MESSAGE
    ? METADATA_SCAN_PENDING_MESSAGE
    : fallback;
}
