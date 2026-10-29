import { IconLoader2, IconSparkles } from '@tabler/icons-react';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { OrderedAssetGallery } from '@/components/ordered-gallery/OrderedAssetGallery';
import { SmartSearchHint } from '@/components/smart-search/SmartSearchHint';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Separator } from '@/components/ui/separator';
import { describeFilter } from '@/common/query/filters/FilterLabels';
import { useSearchParams } from 'react-router-dom';
import { useSearchResults } from './useSearchResults';
import './secondaryTitleAndScrollableContent.css';

export function Search() {
  const [urlSearchParams] = useSearchParams();
  const query = urlSearchParams.get('q') ?? '';

  const { mode, searchQuery, assetIds, isSearching, didFallBack, parsed } = useSearchResults(query);

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

        {parsed.freeText && <SmartSearchHint />}

        {isSearching && (
          <div className="search-loading">
            <IconLoader2 className="search-loading__spinner" size={20} />
            <span>Searching…</span>
          </div>
        )}

        {mode === 'ordered' ? (
          <OrderedAssetGallery assetIds={assetIds} isLoading={isSearching} />
        ) : (
          <TimelineGallery searchQuery={searchQuery} />
        )}
      </main>
    </div>
  );
}
