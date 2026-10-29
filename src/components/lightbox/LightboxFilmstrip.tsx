import { Skeleton } from '@/components/ui/skeleton';
import { getTableObservable } from '@/db/api/tableObservables';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { pathToImageSrc } from '@/system/diskManager';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { useAppStore } from '@/stores/appState';
import clsx from 'clsx';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './lightboxFilmstrip.css';

/** Thumbnail box width in px. */
const ITEM_WIDTH = 76;
/** Gap between thumbnails in px. */
const ITEM_GAP = 8;
const ITEM_STRIDE = ITEM_WIDTH + ITEM_GAP;
/** Extra px rendered on each side of the viewport so scrolling stays smooth. */
const OVERSCAN_PX = 400;

/** Shared id→asset cache so scrolling back reuses resolved assets. */
const assetCache = new Map<string, AssetInClient>();

// Any write to the assets table can make a cached row stale (metadata edit,
// rename, reload); drop the cache so the next resolve re-reads fresh data.
getTableObservable('assets').subscribe(() => assetCache.clear());

async function resolveAsset(id: string): Promise<AssetInClient> {
  const cached = assetCache.get(id);
  if (cached) return cached;

  const asset = await AssetsService.getByUUID(id);
  assetCache.set(id, asset);
  return asset;
}

interface LightboxFilmstripProps {
  /** Ordered ids of every asset in the active scope (see {@link useScopedAssetIds}). */
  assetIds: string[];
  /** Id of the photo currently open, highlighted and kept in view. */
  currentId: string | null;
  /** Navigate to the picked asset. */
  onSelect: (asset: AssetInClient) => void;
}

/**
 * Horizontal, virtualized strip of every photo in the current page/filter.
 * Only the thumbnails inside (or near) the viewport are mounted, so a scope
 * with thousands of items scrolls without generating thousands of thumbnails.
 */
function LightboxFilmstripComponent({ assetIds, currentId, onSelect }: LightboxFilmstripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const currentIndex = currentId ? assetIds.indexOf(currentId) : -1;

  // Track the scroller size so the visible window is computed against the real
  // viewport, even as the info panel opens/closes and resizes the strip.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const update = () => setViewportWidth(scroller.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Center the open photo: snap on first paint / scope change, animate on navigation.
  const didInitialCenterRef = useRef(false);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || currentIndex < 0 || scroller.clientWidth === 0) return;

    const left = Math.max(0, currentIndex * ITEM_STRIDE - scroller.clientWidth / 2 + ITEM_WIDTH / 2);
    scroller.scrollTo({ left, behavior: didInitialCenterRef.current ? 'smooth' : 'auto' });
    didInitialCenterRef.current = true;
  }, [currentId, currentIndex]);

  useEffect(() => {
    didInitialCenterRef.current = false;
  }, [assetIds]);

  useHorizontalWheelScroll(scrollerRef);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (scroller) setScrollLeft(scroller.scrollLeft);
  };

  const total = assetIds.length;
  const totalWidth = total * ITEM_STRIDE;
  const firstVisible = Math.max(0, Math.floor((scrollLeft - OVERSCAN_PX) / ITEM_STRIDE));
  const lastVisible = Math.min(
    total - 1,
    Math.ceil((scrollLeft + viewportWidth + OVERSCAN_PX) / ITEM_STRIDE),
  );

  const visible: { id: string; index: number }[] = [];
  for (let index = firstVisible; index <= lastVisible; index++) {
    const id = assetIds[index];
    if (id) visible.push({ id, index });
  }

  return (
    <div className="lightbox-filmstrip" ref={scrollerRef} onScroll={onScroll}>
      <div className="lightbox-filmstrip__track" style={{ width: `${totalWidth}px` }}>
        {visible.map(({ id, index }) => (
          <FilmstripThumbnail
            key={id}
            id={id}
            isActive={id === currentId}
            left={index * ITEM_STRIDE}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export const LightboxFilmstrip = memo(LightboxFilmstripComponent);

interface FilmstripThumbnailProps {
  id: string;
  isActive: boolean;
  left: number;
  onSelect: (asset: AssetInClient) => void;
}

function FilmstripThumbnail({ id, isActive, left, onSelect }: FilmstripThumbnailProps) {
  const revision = useAppStore((state) => state.assetRevisions[id] ?? 0);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);

    void (async () => {
      try {
        const asset = await resolveAsset(id);
        const thumbnail = await resolveThumbnailPath(asset, ThumbnailSize.XS);
        if (!cancelled && thumbnail) setSrc(`${pathToImageSrc(thumbnail)}?v=${revision}`);
      } catch (error) {
        console.warn(`Failed to load filmstrip thumbnail for "${id}"`, error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, revision]);

  async function handleClick() {
    try {
      onSelect(await resolveAsset(id));
    } catch (error) {
      console.warn(`Failed to open filmstrip item "${id}"`, error);
    }
  }

  return (
    <button
      type="button"
      className={clsx('lightbox-filmstrip__item', isActive && 'is-active')}
      style={{ left: `${left}px`, width: `${ITEM_WIDTH}px` }}
      aria-label="Open photo"
      aria-current={isActive}
      onClick={() => void handleClick()}
    >
      {src ? (
        <img src={src} alt="" draggable={false} loading="lazy" />
      ) : (
        <Skeleton className="lightbox-filmstrip__placeholder" aria-hidden />
      )}
    </button>
  );
}
