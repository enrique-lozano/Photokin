import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { embedText } from './clipSidecar';
import { searchAssets, SearchHit } from './embeddingStore';
import { CLIP_MODELS } from './models';

// A small LRU of recent text embeddings so repeated queries skip the sidecar
// (and a reload of the text model if its session has gone idle).
const TEXT_EMBEDDING_CACHE_SIZE = 100;
const textEmbeddingCache = new Map<string, number[]>();

/**
 * For SigLIP models: the match probability a photo needs to count as a match.
 * On labelled demo queries every true match scored above 1.5% and every
 * non-match below 0.4% (`scripts/clip/calibrate.py`).
 */
const MIN_MATCH_PROBABILITY = 0.01;

/** Lowest cosine similarity that still counts as a match for `modelId`. */
export function minMatchSimilarity(modelId: string): number {
  const match = CLIP_MODELS.find((model) => model.id === modelId)?.match;
  if (!match) return -Infinity;
  if ('minSimilarity' in match) return match.minSimilarity;
  // Invert sigmoid(scale * similarity + bias) at the minimum probability.
  const logit = Math.log(MIN_MATCH_PROBABILITY / (1 - MIN_MATCH_PROBABILITY));
  return (logit - match.bias) / match.scale;
}

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

/**
 * Rank assets by semantic similarity to `query`, optionally within a scope.
 * Only matches are returned, unless `includeWeak` asks for everything ranked.
 */
export async function smartSearch(
  query: string,
  options: { candidateIds?: string[]; limit: number; offset?: number; includeWeak?: boolean },
): Promise<SearchHit[]> {
  const modelId = useSmartSearchSettingsStore.getState().activeModel;
  const embedding = await _encodeQuery(modelId, query.trim());
  const { includeWeak, ...rest } = options;
  return searchAssets(embedding, {
    ...rest,
    maxDistance: includeWeak ? undefined : 1 - minMatchSimilarity(modelId),
  });
}
