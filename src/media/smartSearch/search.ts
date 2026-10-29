import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { embedText } from './clipSidecar';
import { searchAssets, SearchHit } from './embeddingStore';

// A small LRU of recent text embeddings so repeated queries skip re-encoding
// (the ephemeral sidecar reloads the model on each spawn).
const TEXT_EMBEDDING_CACHE_SIZE = 100;
const textEmbeddingCache = new Map<string, number[]>();

/** How far above the average similarity of the searched library an image must
 * score to count as a semantic match, in standard deviations. Below this the
 * tail is just noise, so we drop it instead of padding results with irrelevant
 * photos. This is deliberately expressed relative to the library rather than as
 * a raw similarity, because the absolute scale differs by an order of magnitude
 * between models (see `_weakTailCutoff`). Raise it for stricter results or lower
 * it if matches go missing.
 */
const MIN_RELEVANCE_SIGMA = 2.5;

async function _encodeQuery(modelId: string, query: string): Promise<number[]> {
  const key = `${modelId}::${query}`;
  const cached = textEmbeddingCache.get(key);
  if (cached) {
    textEmbeddingCache.delete(key);
    textEmbeddingCache.set(key, cached);
    return cached;
  }

  const embedding = await embedText(modelId, query);
  textEmbeddingCache.set(key, embedding);
  if (textEmbeddingCache.size > TEXT_EMBEDDING_CACHE_SIZE) {
    textEmbeddingCache.delete(textEmbeddingCache.keys().next().value!);
  }
  return embedding;
}

/** Rank assets by semantic similarity to `query`, optionally within a scope. */
export async function smartSearch(
  query: string,
  options: { candidateIds?: string[]; limit: number; offset?: number },
): Promise<SearchHit[]> {
  const modelId = useSmartSearchSettingsStore.getState().activeModel;
  const embedding = await _encodeQuery(modelId, query.trim());
  return searchAssets(embedding, { ...options, minSigma: MIN_RELEVANCE_SIGMA });
}
