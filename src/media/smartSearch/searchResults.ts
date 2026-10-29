import { selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { isModelDownloaded } from './models';
import { smartSearch } from './search';

const DEFAULT_LIMIT = 250;

/**
 * Split a free-text query into the words a literal match must contain. Every
 * word has to appear in the *same* field, but order does not matter, so
 * "beach sunset" still matches `sunset_beach.jpg`.
 */
function _getQueryTerms(query: string): string[] {
  return [...new Set(query.split(/\s+/).filter(Boolean))];
}

/**
 * Live asset ids whose filename, tag name, or confirmed person name contains
 * every word of `query`. These are treated as strong matches and shown before
 * semantic hits.
 */
async function _getContainsMatchIds(query: string, candidateIds?: string[]): Promise<string[]> {
  const terms = _getQueryTerms(query);
  if (terms.length === 0) return [];
  const scope = candidateIds?.length ? candidateIds : null;
  const likes = terms.map((term) => `%${term}%`);

  const [filenameRows, tagRows, personRows] = await Promise.all([
    selectFromDB(
      kyselyDB
        .selectFrom('assets')
        .select('assets.id as id')
        .where('assets.trashedAt', 'is', null)
        .where((eb) => eb.and(likes.map((like) => eb('assets.filename', 'like', like))))
        .$if(!!scope, (qb) => qb.where('assets.id', 'in', scope!)),
    ),
    selectFromDB(
      kyselyDB
        .selectFrom('fileTags')
        .innerJoin('tags', 'tags.id', 'fileTags.tagId')
        .innerJoin('assets', 'assets.id', 'fileTags.assetId')
        .select('assets.id as id')
        .where('assets.trashedAt', 'is', null)
        .where((eb) => eb.and(likes.map((like) => eb('tags.name', 'like', like))))
        .$if(!!scope, (qb) => qb.where('assets.id', 'in', scope!)),
    ),
    selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .innerJoin('tags', 'tags.id', 'tagRegionInfo.tagId')
        .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select('assets.id as id')
        .where('assets.trashedAt', 'is', null)
        .where('tagRegionInfo.confirmed', '=', 1)
        .where((eb) => eb.and(likes.map((like) => eb('tags.name', 'like', like))))
        .$if(!!scope, (qb) => qb.where('assets.id', 'in', scope!)),
    ),
  ]);

  return [...new Set([...filenameRows, ...tagRows, ...personRows].map((row) => row.id))];
}

/** Deduplicate ids preserving order, capped at `limit`. */
function _orderedUnique(ids: string[], limit: number): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

/**
 * Resolve a free-text query into a relevance-ordered list of asset ids: exact
 * filename/tag/person matches first, then CLIP semantic hits. Falls back to
 * text matches only when no model is downloaded or the sidecar is unavailable.
 *
 * The (fast) text matches are emitted through `onPartial` as soon as they are
 * available so the UI can render them while the slower sidecar text-encode runs.
 */
export async function resolveSearchResults(
  query: string,
  options: { candidateIds?: string[]; limit?: number; onPartial?: (ids: string[]) => void } = {},
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = options.limit ?? DEFAULT_LIMIT;

  const containsIds = await _getContainsMatchIds(trimmed, options.candidateIds);
  options.onPartial?.(_orderedUnique(containsIds, limit));

  let semanticIds: string[] = [];
  const modelId = useSmartSearchSettingsStore.getState().activeModel;
  if (await isModelDownloaded(modelId)) {
    try {
      const hits = await smartSearch(trimmed, { candidateIds: options.candidateIds, limit });
      semanticIds = hits.map((hit) => hit.assetId);
    } catch (error) {
      console.error('Semantic search failed; showing text matches only:', error);
    }
  }

  return _orderedUnique([...containsIds, ...semanticIds], limit);
}
