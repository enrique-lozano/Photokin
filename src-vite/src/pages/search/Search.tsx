import { describeFilter } from '@/common/query/filters/FilterLabels';
import { decodeQueryValue } from '@/common/query/queryLexer';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { addConditionsToQuery, hasCondition } from '@/common/searchQueryUtils';
import { useHasActiveLibraryFilters } from '@/components/app-shell/ClearLibraryFilters';
import { OrderedAssetGallery } from '@/components/ordered-gallery/OrderedAssetGallery';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { SearchFilterIcon } from '@/components/page-content/SearchFilterIcon';
import { SmartSearchHint } from '@/components/smart-search/SmartSearchHint';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { useAppStore } from '@/stores/appState';
import {
  IconAlertTriangle,
  IconCheck,
  IconFilterPlus,
  IconInfoCircle,
  IconLoader2,
  IconSearch,
} from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import './secondaryTitleAndScrollableContent.css';
import './search.css';
import { useSearchResults } from './useSearchResults';

export function Search() {
  const [urlSearchParams, setSearchParams] = useSearchParams();
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const libraryQuery = useAppStore((state) => state.searchQuery);
  const setLibraryQuery = useAppStore((state) => state.setSearchQuery);
  const query = urlSearchParams.get('q') ?? '';

  const {
    mode,
    searchQuery,
    queryFilters,
    assetIds,
    isSearching,
    error,
    retry,
    smartSearchFailed,
    canShowWeaker,
    showWeaker,
    parsed,
  } = useSearchResults(query);
  const weakerButton =
    canShowWeaker && !isSearching ? (
      <Button variant="outline" onClick={showWeaker}>
        Show weaker matches
      </Button>
    ) : undefined;

  const {
    data: timelineCount,
    error: countError,
    loading: countLoading,
  } = useLiveQuery(
    () =>
      mode === 'timeline' && !isSearching ? AssetsService.getCount({ searchQuery }) : Promise.resolve(null),
    ['assets', 'fileTags', 'tagRegionInfo'],
    { extDependencies: [mode, searchQuery, isSearching] },
  );
  const resultCount =
    isSearching || error ? null : mode === 'ordered' ? assetIds.length : countLoading ? null : timelineCount;
  const visibleError =
    error ??
    (mode === 'timeline' && !isSearching && !countLoading && countError
      ? `Couldn't count results: ${countError.message}`
      : null);

  const interpretation = parsed.filterTokens.flatMap((token) =>
    parseSearchBarInput(token.text).filters.map((filter) => ({
      filter,
      label: /^(has|no)$/i.test(token.key?.text ?? '')
        ? `${token.key?.text.toLowerCase() === 'has' ? 'Has' : 'No'} ${decodeQueryValue(token.value?.text ?? '').toLowerCase() === 'tag' ? 'assigned tags' : 'detected faces'}`
        : describeFilter(filter),
    })),
  );
  const filtersAdded = queryFilters.length > 0 && hasCondition(libraryQuery, queryFilters);
  const editSearch = () => document.getElementById('global-search-input')?.focus();
  const emptyActions = (
    <>
      <Button variant="outline" onClick={editSearch}>
        Edit search
      </Button>
      {weakerButton}
      {parsed.filters.length > 0 && (
        <Button variant="outline" onClick={() => setSearchParams({ q: parsed.textQuery })}>
          Clear query filters
        </Button>
      )}
    </>
  );

  usePageChrome('photos');

  return (
    <div className="search-page">
      <header className="main-page-header">
        <IconSearch size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <h4 className="search-page__title font-semibold">Results for &quot;{query}&quot;</h4>
      </header>

      <Separator className="separator"></Separator>

      <main className="scrollable-content">
        <div className="search-summary">
          {interpretation.length > 0 && (
            <Collapsible key={query} className="search-interpretation">
              <div className="search-interpretation__header">
                <div className="search-interpretation__label">
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">Applied filters</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground"
                        aria-label="About these filters"
                        title="About these filters"
                      >
                        <IconInfoCircle size={14} aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-80 max-w-[calc(100vw-2rem)] space-y-3 text-sm"
                      aria-label="About these filters"
                    >
                      <h5 className="font-semibold">About these filters</h5>
                      <p className="text-muted-foreground">
                        Results must match all applied filters. Add them as library filters to use them across
                        other library views too.
                      </p>
                      {hasLibraryFilters && (
                        <p className="text-muted-foreground">
                          Library filters also apply. You can change or clear them in the Library filters
                          banner.
                        </p>
                      )}
                      {parsed.filterTokens.some((token) => /^(has|no)$/i.test(token.key?.text ?? '')) && (
                        <>
                          <p className="text-muted-foreground">
                            Assigned tags count file tags, not face associations.
                          </p>
                          <p className="text-muted-foreground">
                            Detected faces include unnamed faces and follow the count-unverified-faces
                            setting. No detected faces does not mean nobody is in the photo.
                          </p>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <CollapsibleTrigger className="search-interpretation__toggle">
                  <span>
                    {parsed.filterTokens.length} detected{' '}
                    {parsed.filterTokens.length === 1 ? 'filter' : 'filters'}
                  </span>
                  <CollapsibleChevron size={14} />
                </CollapsibleTrigger>
              </div>
              <CollapsiblePanel keepMounted>
                <div className="search-interpretation__details">
                  <div className="search-interpretation__filters">
                    {interpretation.map(({ filter, label }, index) => (
                      <span className="search-interpretation__pill" key={`${index}-${label}`}>
                        <SearchFilterIcon filter={filter} />
                        {label}
                      </span>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="search-interpretation__action"
                    disabled={isSearching || Boolean(error) || queryFilters.length === 0 || filtersAdded}
                    onClick={() => setLibraryQuery(addConditionsToQuery(libraryQuery, queryFilters))}
                    title="Apply these filters across your library without changing the search text"
                  >
                    {filtersAdded ? <IconCheck size={14} /> : <IconFilterPlus size={14} />}
                    {filtersAdded ? 'Added to library filters' : 'Add as library filters'}
                  </Button>
                </div>
              </CollapsiblePanel>
            </Collapsible>
          )}

          {parsed.notices.map((notice) => (
            <p key={notice} className="search-fallback-note" role="status">
              {notice}
            </p>
          ))}

          {smartSearchFailed && (
            <p className="search-fallback-note" role="status">
              <IconAlertTriangle size={14} className="text-warning" />
              Smart search isn&apos;t working right now, so only file names, tags and people were matched.
            </p>
          )}

          {parsed.freeText && <SmartSearchHint />}
        </div>

        {visibleError ? (
          <EmptyState
            icon={IconAlertTriangle}
            title="Search couldn't finish"
            description={visibleError}
            action={
              <Button variant="outline" onClick={retry}>
                Retry search
              </Button>
            }
          />
        ) : isSearching && assetIds.length === 0 ? (
          <EmptyState
            icon={IconLoader2}
            title="Searching your library…"
            className="[&_svg]:motion-safe:animate-spin"
          />
        ) : (
          isSearching && (
            <div className="search-loading" role="status">
              <IconLoader2 className="search-loading__spinner text-primary" size={16} />
              <span>{assetIds.length > 0 ? 'Looking for more matches…' : 'Searching…'}</span>
            </div>
          )
        )}

        {!visibleError && mode === 'ordered' ? (
          <>
            <OrderedAssetGallery assetIds={assetIds} isLoading={isSearching} emptyAction={emptyActions} />
            {weakerButton && assetIds.length > 0 && (
              <div className="flex justify-center py-6">{weakerButton}</div>
            )}
          </>
        ) : !visibleError && !isSearching && !countLoading && resultCount === 0 ? (
          <EmptyState
            icon={IconSearch}
            title="No results"
            description="Nothing matches these filters. Edit the search or remove a query filter."
            action={emptyActions}
          />
        ) : !visibleError && !isSearching && !countLoading ? (
          <TimelineGallery searchQuery={searchQuery} />
        ) : null}
      </main>
    </div>
  );
}
