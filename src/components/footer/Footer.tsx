import { IconComponents, IconGrid3x3, IconSquare } from '@tabler/icons-react';
import { getConditions } from '../../common/searchQueryUtils';
import { AssetsService } from '../../db/api/services/assets.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { useAppStore } from '../../stores/appState';
import { formatBytes } from '../../utils/numberFormatter';
import { openComponentsWindow } from '../../utils/openComponentsWindow';
import { ProcessFooterIndicator } from '../process-center/ProcessFooterIndicator';
import { DonateBadge } from '../support-project/SupportProject';
import { Badge } from '../ui/badge';
import { Slider } from '../ui/slider';
import { VerticalDivider } from '../ui/verticalDivider';
import { MetadataModeChip } from './MetadataModeChip';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useLibrarySync } from './useLibrarySync';
import './footer.css';

export function OutletFooter() {
  const { sync, isSyncing } = useLibrarySync();
  const searchQuery = useAppStore((state) => state.searchQuery);
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);
  const setGalleryThumbnailSize = useAppStore((state) => state.setGalleryThumbnailSize);
  const displayedElementsCount = useAppStore((state) => state.displayedElementsCount);
  const displayedElementsSizeBytes = useAppStore((state) => state.displayedElementsSizeBytes);
  const pageChrome = useAppStore((state) => state.pageChrome);

  const isFiltered = getConditions(searchQuery).length > 0;

  // Unfiltered library total, used to render "X of Y" while filters are active.
  const { data: libraryTotal } = useLiveQuery(async () => {
    const sections = await AssetsService.getFileCountByMonth({});
    return sections.reduce((acc, section) => acc + section.totalImages, 0);
  }, ['assets']);

  const photosLabel = displayedElementsCount === 1 ? 'photo' : 'photos';
  const total = libraryTotal ?? null;
  const showOfTotal = isFiltered && total !== null && total > displayedElementsCount;

  const status = pageChrome?.status;
  // A page's own slider (e.g. Duplicates columns) wins; otherwise thumbnail zoom
  // shows only where the page renders photo or face thumbnails.
  const slider =
    status?.slider ??
    (pageChrome?.kind === 'photos' || pageChrome?.kind === 'faces'
      ? {
          value: galleryThumbnailSize,
          min: 140,
          max: 260,
          step: 10,
          ariaLabel: 'Thumbnail size',
          onChange: setGalleryThumbnailSize,
        }
      : undefined);

  let readout = null;
  if (status && (status.summary || status.totalBytes !== undefined)) {
    readout = (
      <span className="footer-count">
        {status.summary && <span>{status.summary}</span>}
        {status.summary && status.totalBytes !== undefined && (
          <span className="text-muted-foreground">·</span>
        )}
        {status.totalBytes !== undefined && <span>{formatBytes(status.totalBytes)}</span>}
      </span>
    );
  } else if (!status && pageChrome?.kind === 'photos') {
    readout = (
      <span className={`footer-count${isFiltered ? ' footer-count--filtered' : ''}`}>
        <span className="footer-count__num text-foreground font-semibold">
          {displayedElementsCount.toLocaleString()}
        </span>
        {showOfTotal && <span className="text-muted-foreground"> of {total.toLocaleString()}</span>}{' '}
        {photosLabel}
        <span className="text-muted-foreground">·</span>
        <span>{formatBytes(displayedElementsSizeBytes)}</span>
      </span>
    );
  }

  return (
    <footer className="outlet-footer">
      <div className="footer-content">
        <div className="footer-left">
          <SyncStatusIndicator sync={sync} isSyncing={isSyncing} />
          <VerticalDivider className="h-3.5" />
          <MetadataModeChip sync={sync} isSyncing={isSyncing} />
          <ProcessFooterIndicator />
          {status?.pending && (
            <span className="footer-page-pending">
              <span className="text-destructive-text font-semibold">
                {status.pending.count.toLocaleString()} to remove
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-success font-semibold">
                frees {formatBytes(status.pending.freesBytes)}
              </span>
            </span>
          )}
        </div>

        <div className="footer-right">
          {slider && (
            <div className="footer-gallery-size-control">
              <IconGrid3x3 size={14} className="text-muted-foreground" aria-hidden="true" />
              <Slider
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={[slider.value]}
                onValueChange={([next]) => slider.onChange(next)}
                className="footer-gallery-size-slider"
                aria-label={slider.ariaLabel}
              />
              <IconSquare size={14} className="text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          {slider && readout && <VerticalDivider className="h-3.5" />}
          {readout}
          <DonateBadge />
          {import.meta.env.DEV && (
            <Badge asChild variant="outline">
              <button
                type="button"
                title="Open component gallery in a new window (dev only)"
                onClick={() => void openComponentsWindow()}
              >
                <IconComponents />
                UI kit
              </button>
            </Badge>
          )}
        </div>
      </div>
    </footer>
  );
}
