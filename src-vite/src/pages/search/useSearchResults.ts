import { useEffect, useMemo, useState } from 'react';
import { SearchQuery } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { ParsedSearchInput, parseSearchBarInput } from '@/common/query/searchInput';
import { addConditionsToQuery, getConditions } from '@/common/searchQueryUtils';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import { TagsService } from '@/db/api/services/tags.service';
import { resolveSearchResults } from '@/media/smartSearch/searchResults';
import { useAppStore } from '@/stores/appState';

type SearchResultsMode = 'timeline' | 'ordered';

export async function resolveEntityFilters(filters: SearchFilter[]): Promise<SearchFilter[]> {
  const names = filters.flatMap((filter) =>
    filter.filterCriteria === FilterCriteria.person || filter.filterCriteria === FilterCriteria.tag
      ? filter.value.filter((value): value is string => typeof value === 'string')
      : [],
  );
  if (names.length === 0) return filters;
  const tags = await TagsService.findByNamesOrPaths(names);
  return filters.map((filter): SearchFilter => {
    if (filter.filterCriteria !== FilterCriteria.person && filter.filterCriteria !== FilterCriteria.tag)
      return filter;
    const values = filter.value.flatMap((entry) => {
      if (typeof entry !== 'string') return [entry];
      const key = entry.trim().toLowerCase();
      const paths = tags.filter((tag) => tag.fullPath.toLowerCase() === key);
      return paths.length ? paths : tags.filter((tag) => tag.name.toLowerCase() === key);
    });
    const unique = [...new Map(values.map((tag) => [tag.id, tag])).values()];
    return { ...filter, value: unique };
  });
}

/** Ranking may relax similarity, never the submitted or global filter scope. */
export async function resolveQuery(
  parsed: ParsedSearchInput,
  globalQuery: SearchQuery,
  options: Parameters<typeof resolveSearchResults>[1] & { isCancelled?: () => boolean } = {},
) {
  const filters = await resolveEntityFilters(parsed.filters);
  const scope = filters.length ? addConditionsToQuery(globalQuery, filters) : globalQuery;
  if (options.isCancelled?.() || !parsed.freeText) {
    return { mode: 'timeline' as const, scope, assetIds: [] };
  }
  const candidateIds = getConditions(scope).some((condition) => condition.filters.length)
    ? await AssetsService.getScopedAssetIds({ searchQuery: scope })
    : undefined;
  if (options.isCancelled?.() || candidateIds?.length === 0) {
    return { mode: 'ordered' as const, scope, assetIds: [] };
  }
  const assetIds = await resolveSearchResults(parsed.freeText, { ...options, candidateIds });
  return { mode: 'ordered' as const, scope, assetIds };
}

export function useSearchResults(query: string) {
  const globalSearchQuery = useAppStore((state) => state.searchQuery);
  const filterKey = useMemo(() => JSON.stringify(globalSearchQuery ?? null), [globalSearchQuery]);
  const trimmed = query.trim();
  const parsed = useMemo(() => parseSearchBarInput(trimmed), [trimmed]);
  const searchKey = `${trimmed}\0${filterKey}`;
  const [weakFor, setWeakFor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    mode: SearchResultsMode;
    searchQuery: SearchQuery;
    assetIds: string[];
    isSearching: boolean;
    smartSearchFailed: boolean;
    semanticRan: boolean;
    error: string | null;
  }>({
    key: '',
    mode: 'timeline',
    searchQuery: globalSearchQuery,
    assetIds: [],
    isSearching: true,
    smartSearchFailed: false,
    semanticRan: false,
    error: null,
  });
  const includeWeak = weakFor === searchKey;

  useEffect(() => {
    let cancelled = false;
    setResult({
      key: searchKey,
      mode: parsed.freeText ? 'ordered' : 'timeline',
      searchQuery: globalSearchQuery,
      assetIds: [],
      isSearching: true,
      smartSearchFailed: false,
      semanticRan: false,
      error: null,
    });
    void resolveQuery(parsed, globalSearchQuery, {
      includeWeak,
      isCancelled: () => cancelled,
      onSemanticError: () => {
        if (!cancelled) setResult((state) => ({ ...state, smartSearchFailed: true }));
      },
      onSemanticRan: () => {
        if (!cancelled) setResult((state) => ({ ...state, semanticRan: true }));
      },
      onPartial: (assetIds) => {
        if (!cancelled) setResult((state) => ({ ...state, mode: 'ordered', assetIds }));
      },
    })
      .then((resolved) => {
        if (!cancelled)
          setResult((state) => ({
            ...state,
            mode: resolved.mode,
            searchQuery: resolved.scope,
            assetIds: resolved.assetIds,
            isSearching: false,
          }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = `Search failed: ${error instanceof Error ? error.message : String(error)}`;
        toast.error(message);
        setResult((state) => ({ ...state, error: message, assetIds: [], isSearching: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [searchKey, includeWeak, revision]);

  const current = result.key === searchKey;
  return {
    ...result,
    assetIds: current ? result.assetIds : [],
    smartSearchFailed: current && result.smartSearchFailed,
    isSearching: !current || result.isSearching,
    error: current ? result.error : null,
    canShowWeaker: current && result.semanticRan && !includeWeak && !result.error,
    showWeaker: () => setWeakFor(searchKey),
    retry: () => setRevision((value) => value + 1),
    parsed,
  };
}
