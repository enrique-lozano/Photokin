import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { cosineDistance, decodeEmbedding, encodeEmbedding, normalize } from '@/media/embeddings';

/** A relevance-ranked search result (lower `distance` = closer match). */
export type SearchHit = { assetId: string; distance: number };

// Decoded embeddings kept in memory so brute-force search never re-decodes
// base64 on the hot path. Dropped on any write so it stays in sync.
let embeddingCache: { assetId: string; embedding: Float32Array }[] | null = null;

/** Upsert CLIP image embeddings (stored unit-normalized as base64 float32). */
export async function storeAssetEmbeddings(items: { assetId: string; embedding: number[] }[]): Promise<void> {
  if (items.length === 0) return;

  await executeInDB(
    kyselyDB
      .insertInto('smartSearch')
      .values(items.map((item) => ({ assetId: item.assetId, embedding: encodeEmbedding(item.embedding) })))
      .onConflict((oc) =>
        oc.column('assetId').doUpdateSet((eb) => ({ embedding: eb.ref('excluded.embedding') })),
      ),
    ['smartSearch'],
  );
  embeddingCache = null;
}

/** Drop every stored embedding (used when the active model changes). */
export async function clearAssetEmbeddings(): Promise<void> {
  await executeInDB(kyselyDB.deleteFrom('smartSearch'), ['smartSearch']);
  embeddingCache = null;
}

async function _getEmbeddings() {
  if (!embeddingCache) {
    const rows = await selectFromDB(kyselyDB.selectFrom('smartSearch').select(['assetId', 'embedding']));
    embeddingCache = rows.map((row) => ({ assetId: row.assetId, embedding: decodeEmbedding(row.embedding) }));
  }
  return embeddingCache;
}

/**
 * Rank assets by cosine distance to `query`. When `candidateIds` is given the
 * results are restricted to those assets (e.g. the current filter scope).
 * `maxDistance` drops weak matches so the tail isn't padded with irrelevant
 * photos; the caller derives it from the model (see `smartSearch`).
 */
export async function searchAssets(
  query: number[],
  options: { candidateIds?: string[]; limit: number; offset?: number; maxDistance?: number },
): Promise<SearchHit[]> {
  const normalizedQuery = new Float32Array(normalize(query));
  const embeddings = await _getEmbeddings();
  const maxDistance = options.maxDistance ?? Infinity;
  const candidates = options.candidateIds ? new Set(options.candidateIds) : null;

  const hits: SearchHit[] = [];
  for (const { assetId, embedding } of embeddings) {
    if (candidates && !candidates.has(assetId)) continue;
    // An infinite distance means the stored vector has a different
    // dimensionality, so it was indexed with another model and simply isn't
    // comparable to this query.
    const distance = cosineDistance(embedding, normalizedQuery);
    if (Number.isFinite(distance) && distance <= maxDistance) hits.push({ assetId, distance });
  }

  hits.sort((a, b) => a.distance - b.distance);
  const offset = options.offset ?? 0;
  return hits.slice(offset, offset + options.limit);
}
