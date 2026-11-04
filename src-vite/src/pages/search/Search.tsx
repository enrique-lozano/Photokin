import { describeFilter } from '@/common/query/filters/FilterLabels';
import { decodeQueryValue } from '@/common/query/queryLexer';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { useHasActiveLibraryFilters } from '@/components/app-shell/ClearLibraryFilters';
import { OrderedAssetGallery } from '@/components/ordered-gallery/OrderedAssetGallery';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { SmartSearchHint } from '@/components/smart-search/SmartSearchHint';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/separator';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { IconAlertTriangle, IconLoader2, IconSearch } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import './secondaryTitleAndScrollableContent.css';
import { useSearchResults } from './useSearchResults';

export function Search() {
  const [urlSearchParams, setSearchParams] = useSearchParams();
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const query = urlSearchParams.get('q') ?? '';

  const {
    mode,
    searchQuery,
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

  const interpretation = parsed.filterTokens.map((token) => {
    if (token.key?.text.toLowerCase() === 'has' || token.key?.text.toLowerCase() === 'no') {
      return `${token.key.text.toLowerCase() === 'has' ? 'Has' : 'No'} ${decodeQueryValue(token.value?.text ?? '').toLowerCase() === 'tag' ? 'assigned tags' : 'detected faces'}`;
    }
    return parseSearchBarInput(token.text).filters.map(describeFilter).join(', ');
  });
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
        <h4 className="font-semibold">Results for &quot;{query}&quot;</h4>
      </header>

      <Separator className="separator"></Separator>

      <main className="scrollable-content">
        {interpretation.length > 0 && (
          <div className="search-interpretation">
            <span className="text-xs text-muted-foreground">Applied filters</span>
            {interpretation.map((label, index) => (
              <span className="search-interpretation__pill" key={`${index}-${label}`}>
                {label}
              </span>
            ))}
          </div>
        )}

        {hasLibraryFilters && <p className="search-fallback-note">Library filters also apply.</p>}
        {parsed.filterTokens.some((token) => /^(has|no)$/i.test(token.key?.text ?? '')) && (
          <p className="search-fallback-note">
            Assigned tags count file tags, not face associations. Detected faces include unnamed faces and
            follow the count-unverified-faces setting; no detected faces does not mean nobody is in the photo.
          </p>
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
