/**
 * Regenerable hashes derived from an asset's file contents. The source file
 * identity is stored alongside them so stale rows are ignored after a sync.
 */
export interface AssetFingerprintDTO {
  assetId: string;
  sourceSize: number;
  sourceMtime: string;
  perceptualHash: string | null;
  contentHash: string | null;
}
