import { isSupportedVideoPath } from '@/common/supportedFormats';
import { getTableObservable } from '@/db/api/tableObservables';
import { selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { cosineDistance, decodeEmbedding } from '@/media/embeddings';
import { useFaceScanSettingsStore } from '@/stores/faceScanSettingsStore';
import { selectDiverseReferences } from './faceEmbeddingStore';

export type FaceBestMatch = { tagId: string; similarity: number };

type References = { maxRefsPerTag: number; byTag: Promise<Map<string, Float32Array[]>> };

/**
 * Confirmed faces per person, decoded once and reused while the popover is
 * opened face after face. Subscribed at import so the cache is dropped before
 * any live query re-runs on the same write.
 */
let references: References | null = null;
getTableObservable('tagRegionInfo').subscribe(() => (references = null));
getTableObservable('faceEmbeddings').subscribe(() => (references = null));

async function _loadReferences(maxRefsPerTag: number): Promise<Map<string, Float32Array[]>> {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('tagRegionInfo')
      .innerJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
      .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
      .select([
        'tagRegionInfo.tagId as tagId',
        'faceEmbeddings.embedding as embedding',
        'assets.filename as filename',
      ])
      .where('tagRegionInfo.confirmed', '=', 1)
      .where('tagRegionInfo.tagId', 'is not', null),
  );

  const byTag = new Map<string, Float32Array[]>();
  for (const row of rows) {
    if (!row.tagId || (row.filename && isSupportedVideoPath(row.filename))) continue;
    const list = byTag.get(row.tagId) ?? [];
    list.push(decodeEmbedding(row.embedding));
    byTag.set(row.tagId, list);
  }
  for (const [tagId, refs] of byTag) {
    byTag.set(
      tagId,
      selectDiverseReferences(refs, (embedding) => embedding, maxRefsPerTag),
    );
  }
  return byTag;
}

function _references(maxRefsPerTag: number): Promise<Map<string, Float32Array[]>> {
  if (references?.maxRefsPerTag !== maxRefsPerTag) {
    const byTag = _loadReferences(maxRefsPerTag);
    references = { maxRefsPerTag, byTag };
    byTag.catch(() => (references = null));
  }
  return references.byTag;
}

/** The closest person to `embedding`, when within `maxDistance` (cosine). */
export function bestMatchAmong(
  embedding: ArrayLike<number>,
  refsByTag: ReadonlyMap<string, readonly ArrayLike<number>[]>,
  maxDistance: number,
): FaceBestMatch | null {
  let best: FaceBestMatch | null = null;
  for (const [tagId, refs] of refsByTag) {
    for (const reference of refs) {
      const similarity = 1 - cosineDistance(embedding, reference);
      if (similarity >= 1 - maxDistance && (!best || similarity > best.similarity)) {
        best = { tagId, similarity };
      }
    }
  }
  return best;
}

/**
 * Who a face most looks like among confirmed people, using the same distance
 * and reference count as Recognize faces. `null` without an embedding or when
 * nobody is close enough.
 */
export async function findBestMatch(regionId: string): Promise<FaceBestMatch | null> {
  const row = await selectFirstFromDB(
    kyselyDB.selectFrom('faceEmbeddings').select('embedding').where('regionId', '=', regionId),
  );
  if (!row) return null;

  const { matchMaxDistance, knownEmbeddingsPerTag } = useFaceScanSettingsStore.getState();
  const refsByTag = await _references(knownEmbeddingsPerTag);
  return bestMatchAmong(decodeEmbedding(row.embedding), refsByTag, matchMaxDistance);
}
