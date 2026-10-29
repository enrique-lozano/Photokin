import { IconMoodEmpty } from '@tabler/icons-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { PhotoInGallery } from '@/components/photo-in-gallery/PhotoInGallery';
import { computeSegmentLayout } from '@/components/timeline-gallery/galleryLayout';
import '@/components/timeline-gallery/timelineGallery.css';
import { LightboxImageContext, LightboxOrigin } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useAppStore } from '@/stores/appState';

/**
 * Renders an explicit, caller-ordered list of asset ids as a justified photo
 * grid (relevance order, not date). Reuses the timeline's tile, layout and
 * lightbox so it stays visually consistent; navigation inside the lightbox is
 * scoped to the same id set.
 */
export function OrderedAssetGallery({ assetIds, isLoading }: { assetIds: string[]; isLoading?: boolean }) {
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);
  const layoutMode = useAppStore((state) => state.layoutMode);
  const setDisplayedElementsCount = useAppStore((state) => state.setDisplayedElementsCount);
  const setDisplayedElementsSizeBytes = useAppStore((state) => state.setDisplayedElementsSizeBytes);
  const setGallerySelectionScope = useAppStore((state) => state.setGallerySelectionScope);
  const { openLightbox } = useContext(LightboxImageContext);

  const [assets, setAssets] = useState<AssetInClient[]>([]);
  const [containerWidth, setContainerWidth] = useState(550);
  const containerRef = useRef<HTMLDivElement>(null);

  const idsKey = assetIds.join(',');

  useEffect(() => {
    if (assetIds.length === 0) {
      setAssets([]);
      return;
    }
    let cancelled = false;
    AssetsService.getFiles({ assetIds }).then((loaded) => {
      if (cancelled) return;
      const byId = new Map(loaded.map((asset) => [asset.id, asset]));
      setAssets(assetIds.map((id) => byId.get(id)).filter((asset): asset is AssetInClient => Boolean(asset)));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setGallerySelectionScope({ assetIds });
    setDisplayedElementsCount(assets.length);
    setDisplayedElementsSizeBytes(assets.reduce((sum, asset) => sum + asset.filesize, 0));
    return () => {
      setGallerySelectionScope(null);
      setDisplayedElementsCount(0);
      setDisplayedElementsSizeBytes(0);
    };
  }, [idsKey, assets, setGallerySelectionScope, setDisplayedElementsCount, setDisplayedElementsSizeBytes]);

  const layout = useMemo(() => {
    const sizes = assets.map((asset) => ({ width: asset.metadata.width, height: asset.metadata.height }));
    return computeSegmentLayout(layoutMode, sizes, {
      containerWidth,
      targetRowHeight: galleryThumbnailSize,
      boxSpacing: 4,
      containerPadding: 0,
    });
  }, [assets, layoutMode, containerWidth, galleryThumbnailSize]);

  const handleImgClick = (img: AssetInClient, origin?: LightboxOrigin) =>
    openLightbox(img, origin, { assetIds, preserveOrder: true });

  // The container must stay mounted even while empty/loading: its width is
  // measured by a `[]`-deps ResizeObserver, so early-returning a different tree
  // here would leave `containerWidth` stuck at its initial default (and the grid
  // rendering at a fraction of the page width).
  const showEmpty = !isLoading && assetIds.length === 0;

  return (
    <div ref={containerRef} className="photo-grid__sections">
      {showEmpty ? (
        <NoResultsIndicator
          icon={<IconMoodEmpty size={64} strokeWidth={1} />}
          title="No results"
          description="Try a different search or adjust the filters"
        />
      ) : (
        <div
          className="section relative"
          style={{ width: `${containerWidth}px`, height: `${layout.containerHeight}px` }}
        >
          {layout.boxes.map((box, index) => {
            const file = assets[index];
            if (!file) return null;
            return (
              <div
                key={file.id}
                className={layoutMode === 'card' ? 'tile tile--card' : 'tile'}
                style={{
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                  left: `${box.left}px`,
                  top: `${box.top}px`,
                }}
              >
                <PhotoInGallery img={file} onImgClick={handleImgClick} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
