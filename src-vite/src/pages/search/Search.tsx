import { IconAlertTriangle, IconLoader2, IconSparkles } from '@tabler/icons-react';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { OrderedAssetGallery } from '@/components/ordered-gallery/OrderedAssetGallery';
import { SmartSearchHint } from '@/components/smart-search/SmartSearchHint';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/separator';
import { describeFilter } from '@/common/query/filters/FilterLabels';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { useSearchParams } from 'react-router-dom';
import { useSearchResults } from './useSearchResults';
import './secondaryTitleAndScrollableContent.css';

export function Search() {
  const [urlSearchParams] = useSearchParams();
  const query = urlSearchParams.get('q') ?? '';

  const {
    mode,
    searchQuery,
    assetIds,
    isSearching,
    didFallBack,
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

  const { data: timelineCount } = useLiveQuery(
    () => (mode === 'timeline' ? AssetsService.getCount({ searchQuery }) : Promise.resolve(null)),
    ['assets'],
    { extDependencies: [mode, searchQuery] },
  );
  const resultCount = isSearching ? null : mode === 'ordered' ? assetIds.length : timelineCount;

  // What the query was understood to mean, so a guessed intent ("videos") or a
  // typed keyword is never applied invisibly.
  const interpretation = [
    ...parsed.filters.map((filter) => describeFilter(filter)),
    ...parsed.intents.map((intent) => intent.label),
  ].filter(Boolean);

  usePageChrome('photos');

  return (
    <div className="search-page">
      <header className="main-page-header">
        <h4 className="font-semibold">Results for &quot;{query}&quot;</h4>
        {resultCount != null && (
          <span className="ml-2 text-sm text-muted-foreground">
            {resultCount.toLocaleString()} item{resultCount === 1 ? '' : 's'}
          </span>
        )}
      </header>

      <Separator className="separator"></Separator>

      <main className="scrollable-content">
        {interpretation.length > 0 && (
          <div className="search-interpretation">
            <span className="text-xs text-muted-foreground">Interpreted as</span>
            {interpretation.map((label) => (
              <span className="search-interpretation__pill" key={label}>
                {label}
              </span>
            ))}
          </div>
        )}

        {didFallBack && (
          <p className="search-fallback-note">
            <IconSparkles size={14} />
            No photos matched your filters. Showing similar photos instead; these may not match the filters.
          </p>
        )}

        {smartSearchFailed && (
          <p className="search-fallback-note" role="status">
            <IconAlertTriangle size={14} className="text-warning" />
            Smart search isn&apos;t working right now, so only file names, tags and people were matched.
          </p>
        )}

        {parsed.freeText && <SmartSearchHint />}

        {isSearching && mode === 'ordered' && assetIds.length === 0 ? (
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

        {mode === 'ordered' ? (
          <>
            <OrderedAssetGallery assetIds={assetIds} isLoading={isSearching} emptyAction={weakerButton} />
            {weakerButton && assetIds.length > 0 && (
              <div className="flex justify-center py-6">{weakerButton}</div>
            )}
          </>
        ) : (
          <TimelineGallery searchQuery={searchQuery} />
        )}
      </main>
    </div>
  );
}
