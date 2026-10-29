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

/** Below this many indexed assets the similarity spread is too noisy to cut a
 * tail from, so everything is returned ranked instead. */
const MIN_SAMPLES_FOR_CUTOFF = 20;

/**
 * Rank assets by cosine distance to `query`. When `candidateIds` is given the
 * results are restricted to those assets (e.g. the current filter scope).
 * `minSigma` drops weak matches so the tail isn't padded with irrelevant photos
 * (without it, a small library returns *every* asset ranked) — see
 * {@link _weakTailCutoff} for why the cutoff is relative and not a raw similarity.
 */
export async function searchAssets(
  query: number[],
  options: { candidateIds?: string[]; limit: number; offset?: number; minSigma?: number },
): Promise<SearchHit[]> {
  const normalizedQuery = new Float32Array(normalize(query));
  const embeddings = await _getEmbeddings();

  // Everything is scored, even outside the scope, because the cutoff below
  // needs the library-wide similarity spread to mean anything: a narrow scope
  // such as a single album is far too small a sample to derive it from.
  const scored: SearchHit[] = [];
  for (const { assetId, embedding } of embeddings) {
    const distance = cosineDistance(embedding, normalizedQuery);
    // An infinite distance means the stored vector has a different
    // dimensionality, so it was indexed with another model and simply isn't
    // comparable to this query.
    if (Number.isFinite(distance)) scored.push({ assetId, distance });
  }

  const maxDistance = _weakTailCutoff(scored, options.minSigma);
  const candidates = options.candidateIds ? new Set(options.candidateIds) : null;
  const hits = scored.filter(
    (hit) => hit.distance <= maxDistance && (!candidates || candidates.has(hit.assetId)),
  );

  hits.sort((a, b) => a.distance - b.distance);
  const offset = options.offset ?? 0;
  return hits.slice(offset, offset + options.limit);
}

/**
 * Distance beyond which a hit counts as noise: `minSigma` standard deviations
 * closer than the library's average distance to this query.
 *
 * The cutoff has to be relative, because the *absolute* scale of text↔image
 * similarity is a property of the model rather than of relevance. Over the same
 * photos CLIP ViT-B/32 centres its similarities around 0.20 and a strong match
 * reaches ~0.31, while SigLIP2 centres around 0.03 and a strong match reaches
 * only ~0.15 — so any fixed similarity floor keeps every photo for one model
 * and none for the other. How far a match stands out from the pack, on the
 * other hand, is comparable across models (and across queries).
 */
function _weakTailCutoff(hits: SearchHit[], minSigma?: number): number {
  if (minSigma === undefined || hits.length < MIN_SAMPLES_FOR_CUTOFF) return Infinity;

  const mean = hits.reduce((total, hit) => total + hit.distance, 0) / hits.length;
  const variance = hits.reduce((total, hit) => total + (hit.distance - mean) ** 2, 0) / hits.length;
  const deviation = Math.sqrt(variance);
  if (deviation <= Number.EPSILON) return Infinity;

  return mean - minSigma * deviation;
}
