import { useEffect, useMemo, useState } from 'react';
import { SearchQuery } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { ParsedSearchInput, parsedSearchFilters, parseSearchBarInput } from '@/common/query/searchInput';
import { addConditionsToQuery, getConditions } from '@/common/searchQueryUtils';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import { TagsService } from '@/db/api/services/tags.service';
import { resolveSearchResults } from '@/media/smartSearch/searchResults';
import { useAppStore } from '@/stores/appState';
import { isIn } from '@/utils/array.utils';

/**
 * How the results are rendered: `timeline` for a purely structured query (the
 * normal date-grouped gallery), `ordered` when a semantic pass ranked them.
 */
type SearchResultsMode = 'timeline' | 'ordered';

interface UseSearchResultsResult {
  mode: SearchResultsMode;
  /** Structured query the `timeline` mode renders (drawer filters + typed ones). */
  searchQuery: SearchQuery;
  /** Relevance-ordered ids for `ordered` mode. */
  assetIds: string[];
  isSearching: boolean;
  /** The filters matched nothing, so these results come from a semantic retry. */
  didFallBack: boolean;
  parsed: ParsedSearchInput;
}

/** Criteria whose typed values are names that must be resolved to tag entities. */
const ENTITY_CRITERIA = [FilterCriteria.person, FilterCriteria.tag] as const;

/**
 * Swap the names in entity filters (`person:"Ana"`) for the tags they refer to,
 * matching either a leaf name or a full path. A name that resolves to nothing
 * leaves an empty filter, which matches no assets — and therefore falls back to
 * a semantic search rather than silently ignoring what the user typed.
 */
async function _resolveEntityFilters(filters: SearchFilter[]): Promise<SearchFilter[]> {
  const typedNames = filters.flatMap((filter) =>
    isIn(ENTITY_CRITERIA, filter.filterCriteria)
      ? (filter.value as unknown[]).filter((value): value is string => typeof value === 'string')
      : [],
  );

  if (typedNames.length === 0) {
    return filters;
  }

  const tags = await TagsService.findByNamesOrPaths(typedNames);
  const byKey = new Map(
    tags.flatMap(
      (tag) =>
        [
          [tag.name.toLowerCase(), tag],
          [tag.fullPath.toLowerCase(), tag],
        ] as const,
    ),
  );

  return filters.map((filter) => {
    if (!isIn(ENTITY_CRITERIA, filter.filterCriteria)) return filter;

    const value = (filter.value as unknown[])
      .map((entry) => (typeof entry === 'string' ? byKey.get(entry.trim().toLowerCase()) : entry))
      .filter(Boolean);

    return { ...filter, value } as SearchFilter;
  });
}

/**
 * Resolve the search bar text into renderable results.
 *
 * The text is split by {@link parseSearchBarInput} into structured filters and
 * free text, which are answered by different engines: filters narrow the
 * candidate set in SQL, free text is ranked semantically. A query of only
 * `key:value` tokens therefore never runs a semantic pass, while `beach
 * rating>3` ranks "beach" within the highly-rated photos.
 *
 * Whenever the filters end up matching nothing, the raw words are retried
 * semantically over the whole library, so a guessed intent ("videos") or an
 * over-narrow filter never leaves the user on an empty page.
 */
export function useSearchResults(query: string): UseSearchResultsResult {
  const globalSearchQuery = useAppStore((state) => state.searchQuery);
  const filterKey = useMemo(() => JSON.stringify(globalSearchQuery ?? null), [globalSearchQuery]);
  const trimmed = query.trim();

  const parsed = useMemo(() => parseSearchBarInput(trimmed), [trimmed]);

  const [mode, setMode] = useState<SearchResultsMode>('timeline');
  const [searchQuery, setSearchQuery] = useState<SearchQuery>(globalSearchQuery);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [didFallBack, setDidFallBack] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const showTimeline = () => {
      setMode('timeline');
      setAssetIds([]);
      setDidFallBack(false);
    };

    setIsSearching(true);
    setAssetIds([]);
    setDidFallBack(false);

    (async () => {
      const filters = await _resolveEntityFilters(parsedSearchFilters(parsed));
      if (cancelled) return;

      const scope = filters.length > 0 ? addConditionsToQuery(globalSearchQuery, filters) : globalSearchQuery;
      const hasFilters = getConditions(scope).some((condition) => condition.filters.length > 0);
      setSearchQuery(scope);

      /** Rank everything typed, dropping the filters that matched nothing. */
      const runFallback = async () => {
        const ids = await resolveSearchResults(parsed.fallbackText || parsed.freeText);
        if (cancelled) return;
        setMode('ordered');
        setAssetIds(ids);
        setDidFallBack(true);
      };

      // Nothing to rank: an empty box, or only explicit `key:value` tokens whose
      // meaning is unambiguous. The timeline renders them directly.
      if (!parsed.freeText && parsed.intents.length === 0) {
        showTimeline();
        return;
      }

      // Only guessed intents ("videos"): keep the timeline while they match
      // something, otherwise treat the words as a semantic query instead.
      if (!parsed.freeText) {
        const count = await AssetsService.getCount({ searchQuery: scope });
        if (cancelled) return;

        if (count > 0) showTimeline();
        else await runFallback();
        return;
      }

      const candidateIds = hasFilters
        ? await AssetsService.getScopedAssetIds({ searchQuery: scope })
        : undefined;
      if (cancelled) return;

      if (candidateIds?.length !== 0) {
        const ids = await resolveSearchResults(parsed.freeText, {
          candidateIds,
          // Render the fast filename/tag/person matches while the semantic
          // (sidecar) pass is still running.
          onPartial: (partial) => {
            if (cancelled) return;
            setMode('ordered');
            setAssetIds(partial);
          },
        });
        if (cancelled) return;

        if (ids.length > 0 || !hasFilters) {
          setMode('ordered');
          setAssetIds(ids);
          return;
        }
      }

      await runFallback();
    })()
      .catch((error) => {
        if (cancelled) return;
        toast.error(`Search failed: ${String(error)}`);
        setMode('ordered');
        setAssetIds([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trimmed, filterKey]);

  return { mode, searchQuery, assetIds, isSearching, didFallBack, parsed };
}
