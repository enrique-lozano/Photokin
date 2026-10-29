import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';

export interface CachedAssetFingerprints {
  size: number;
  pHash?: string;
  contentHash?: string;
}

export type AssetFingerprintCache = Map<string, CachedAssetFingerprints>;

/**
 * Loads only fingerprints whose source size and mtime still match the asset
 * row. Stale rows remain harmless until the next write replaces them.
 */
export async function getValidAssetFingerprints(assetIds?: string[]): Promise<AssetFingerprintCache> {
  if (assetIds?.length === 0) return new Map();

  let query = kyselyDB
    .selectFrom('assetFingerprints')
    .innerJoin('assets', 'assets.id', 'assetFingerprints.assetId')
    .select([
      'assetFingerprints.assetId as assetId',
      'assetFingerprints.sourceSize as size',
      'assetFingerprints.perceptualHash as pHash',
      'assetFingerprints.contentHash as contentHash',
    ])
    .whereRef('assetFingerprints.sourceSize', '=', 'assets.filesize')
    .whereRef('assetFingerprints.sourceMtime', '=', 'assets.fileMtime');

  if (assetIds) query = query.where('assetFingerprints.assetId', 'in', assetIds);

  const rows = await selectFromDB(query);
  return new Map(
    rows.map((row) => [
      row.assetId,
      {
        size: row.size,
        ...(row.pHash ? { pHash: row.pHash } : {}),
        ...(row.contentHash ? { contentHash: row.contentHash } : {}),
      },
    ]),
  );
}

/**
 * Persists a complete in-memory fingerprint cache using the current asset
 * identity as its validity stamp.
 */
export async function saveAssetFingerprints(cache: AssetFingerprintCache): Promise<void> {
  if (cache.size === 0) return;

  const ROWS_PER_WRITE = 1_000;
  const assetIds = [...cache.keys()];
  for (let index = 0; index < assetIds.length; index += ROWS_PER_WRITE) {
    const chunkIds = assetIds.slice(index, index + ROWS_PER_WRITE);
    const identities = await selectFromDB(
      kyselyDB.selectFrom('assets').select(['id', 'filesize', 'fileMtime']).where('id', 'in', chunkIds),
    );
    const rows = identities.map((asset) => {
      const cached = cache.get(asset.id)!;
      return {
        assetId: asset.id,
        sourceSize: asset.filesize,
        sourceMtime: asset.fileMtime,
        perceptualHash: cached.pHash ?? null,
        contentHash: cached.contentHash ?? null,
      };
    });
    if (rows.length === 0) continue;

    await executeInDB(
      kyselyDB
        .insertInto('assetFingerprints')
        .values(rows)
        .onConflict((oc) =>
          oc.column('assetId').doUpdateSet((eb) => ({
            sourceSize: eb.ref('excluded.sourceSize'),
            sourceMtime: eb.ref('excluded.sourceMtime'),
            perceptualHash: eb.ref('excluded.perceptualHash'),
            contentHash: eb.ref('excluded.contentHash'),
          })),
        ),
      'assetFingerprints',
    );
  }
}

/** Stores a pHash produced while an asset was already being decoded for a thumbnail. */
export async function storeAssetPerceptualHash(assetId: string, pHash: string): Promise<void> {
  const cache = await getValidAssetFingerprints([assetId]);
  const existing = cache.get(assetId);
  cache.set(assetId, { size: existing?.size ?? 0, ...existing, pHash });
  await saveAssetFingerprints(cache);
}

export async function clearAssetFingerprints(): Promise<void> {
  await executeInDB(kyselyDB.deleteFrom('assetFingerprints'), 'assetFingerprints');
}
