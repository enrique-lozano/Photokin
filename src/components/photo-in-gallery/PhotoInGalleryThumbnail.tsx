import { isSupportedVideoPath } from '@/common/supportedFormats';
import { Skeleton } from '@/components/ui/skeleton';
import { getCachedThumbnailPath, resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { useAppStore } from '@/stores/appState';
import { pathToImageSrc } from '@/system/diskManager';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { AssetInClient } from '../../db/models/AssetInClient';
import './photoInGallery.css';

type ImgLoadingState = 'loading' | 'loaded' | 'error';

type Props = {
  img: AssetInClient;
  isImageSelected: boolean;
};

const THUMBNAIL_GENERATION_DELAY_MS = 100;

export function PhotoInGalleryThumbnail({ img, isImageSelected }: Props) {
  const isVideo = isSupportedVideoPath(img.filename);
  // Bumped whenever the asset's row changes (e.g. after a rotation regenerates
  // its thumbnails in place). The thumbnail path is deterministic per asset, so
  // this query param is what forces the browser to reload the fresh pixels.
  const assetRevision = useAppStore((state) => state.assetRevisions[img.id] ?? 0);
  const versionedSrc = (path: string) => `${pathToImageSrc(path)}?v=${assetRevision}`;
  // Videos have no DEFAULT thumbnail; their single (poster) thumbnail is XS.
  const largeSize = isVideo ? ThumbnailSize.XS : ThumbnailSize.DEFAULT;

  // Hydrate synchronously from the in-memory path cache so a tile that remounts
  // during scrolling paints its already-generated thumbnail immediately instead
  // of flashing the grey placeholder while it re-resolves the path over IPC.
  const cachedSmall = getCachedThumbnailPath(img.id, ThumbnailSize.XS);
  const cachedLarge = getCachedThumbnailPath(img.id, largeSize);

  const [smallSRC, setSmallSRC] = useState<string | null>(cachedSmall);
  const [largeSRC, setLargeSRC] = useState<string | null>(cachedLarge);

  // Always start in "loading" so the image fades in via CSS once it paints,
  // even on a cache hit: the src is set synchronously, so `onLoad` fires almost
  // immediately and the fade is a quick polish rather than a lingering grey box.
  const [smallImageState, setSmallImageState] = useState<ImgLoadingState>('loading');
  const [largeImageState, setLargeImageState] = useState<ImgLoadingState>('loading');

  const [hideSmallThumbnail, setHideSmallThumbnail] = useState(false);

  // The visible layer is the sharp thumbnail when present, otherwise the XS one.
  const topImageState = largeSRC ? largeImageState : smallImageState;
  // Only shimmer when there is genuinely nothing cached to paint yet; a cache hit
  // resolves instantly so a skeleton would just flash for a frame.
  const showSkeleton = cachedSmall == null && cachedLarge == null && topImageState !== 'loaded';

  useEffect(() => {
    let isCancelled = false;
    const thumbnailRequestController = new AbortController();
    const thumbnailRequestOptions = {
      generationDelayMs: THUMBNAIL_GENERATION_DELAY_MS,
      signal: thumbnailRequestController.signal,
    };

    async function fetchThumbnails() {
      try {
        // XS first so the tile can paint a cheap preview, then DEFAULT. Running
        // both in parallel used to decode the full original twice at once.
        const smallThumbnail = await resolveThumbnailPath(img, ThumbnailSize.XS, thumbnailRequestOptions);
        if (isCancelled) {
          return;
        }

        setSmallSRC((prev) => prev ?? smallThumbnail);

        if (isVideo) {
          setLargeSRC((prev) => prev ?? smallThumbnail);
          return;
        }

        const largeThumbnail = await resolveThumbnailPath(
          img,
          ThumbnailSize.DEFAULT,
          thumbnailRequestOptions,
        );
        if (isCancelled) {
          return;
        }

        // Never fall back to the original file: WebView2 would decode the full
        // camera image (~72 MB for 24 MP) and OOM the process during imports.
        setLargeSRC((prev) => prev ?? largeThumbnail);
      } catch (error) {
        console.warn(`Failed to load thumbnails for "${img.fullPath}"`, error);
      }
    }

    void fetchThumbnails();

    return () => {
      isCancelled = true;
      thumbnailRequestController.abort();
    };
    // Keyed on the asset id, not the `img` object reference: equivalent re-fetches
    // (e.g. a new `AssetInClient` instance for the same asset produced by a live-query
    // refresh) must not reload the thumbnail and flash the loading state. A genuinely
    // different asset reuses a different React key and remounts this component.
  }, [img.id]);

  return (
    <>
      {showSkeleton && (
        <Skeleton
          className={clsx('photo-in-gallery-skeleton', isImageSelected && 'rounded-xl')}
          aria-hidden
        />
      )}

      {smallSRC && !hideSmallThumbnail && smallImageState != 'error' && (
        <img
          src={versionedSrc(smallSRC)}
          data-original-src={smallSRC}
          className={clsx('photo-in-gallery-thumbnail-xs', isImageSelected && 'rounded-xl', smallImageState)}
          alt={img.metadata.getAltText()}
          decoding="async"
          onError={() => setSmallImageState('error')}
          onLoad={() => setSmallImageState('loaded')}
        />
      )}

      {largeSRC && (
        <img
          src={versionedSrc(largeSRC)}
          data-original-src={largeSRC}
          className={clsx('photo-in-gallery-thumbnail', isImageSelected && 'rounded-xl', largeImageState)}
          alt={img.metadata.getAltText()}
          loading="lazy"
          decoding="async"
          onTransitionEnd={() => setHideSmallThumbnail(true)}
          onError={() => setLargeImageState('error')}
          onLoad={() => setLargeImageState('loaded')}
        />
      )}
    </>
  );
}
