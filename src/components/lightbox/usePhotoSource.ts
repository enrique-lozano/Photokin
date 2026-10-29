import type { AssetInClient } from '@/db/models/AssetInClient';
import { getOrCreateFullPreview, needsGeneratedPreview } from '@/media/thumbnails/preview';
import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { useAppStore } from '@/stores/appState';
import { pathToImageSrc } from '@/system/diskManager';
import { useEffect, useLayoutEffect, useState } from 'react';

function _findGridThumbnailSrc(assetId: string): string | null {
  const container = document.querySelector(`[data-asset-id="${CSS.escape(assetId)}"]`);
  if (!container) return null;

  for (const selector of ['img.photo-in-gallery-thumbnail', 'img.photo-in-gallery-thumbnail-xs', 'img']) {
    const image = container.querySelector(selector);
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) {
      const src = image.currentSrc || image.src;
      if (src) return src;
    }
  }
  return null;
}

/** Keep a decoded thumbnail visible until the original or native preview is ready. */
export function usePhotoSource(
  asset: Pick<AssetInClient, 'id' | 'filename' | 'fullPath'> | null,
  enabled = true,
) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullResolution, setFullResolution] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useAppStore((state) => (asset ? (state.assetRevisions[asset.id] ?? 0) : 0));
  const id = asset?.id;
  const filename = asset?.filename;
  const fullPath = asset?.fullPath;

  useLayoutEffect(() => {
    setSrc(id && enabled ? _findGridThumbnailSrc(id) : null);
    setError(null);
    setFullResolution(false);
  }, [id, fullPath, enabled, revision, attempt]);

  useEffect(() => {
    if (!id || !filename || !fullPath || !enabled) return;
    let cancelled = false;

    void resolveThumbnailPath({ id, filename, fullPath }, ThumbnailSize.DEFAULT)
      .then((thumbnail) => {
        if (!cancelled && thumbnail) {
          setSrc((current) => current ?? pathToImageSrc(thumbnail));
        }
      })
      .catch((cause) => console.warn('Failed to load placeholder thumbnail', cause));

    void (async () => {
      try {
        const path = needsGeneratedPreview(filename)
          ? await getOrCreateFullPreview({ id, fullPath })
          : fullPath;
        if (cancelled) return;
        if (!path) throw new Error('Could not generate a full-size preview');
        const fullSrc = `${pathToImageSrc(path)}?v=${revision}&attempt=${attempt}`;
        const preloader = new Image();
        preloader.src = fullSrc;
        await preloader.decode();
        if (!cancelled) {
          setSrc(fullSrc);
          setFullResolution(true);
        }
      } catch (cause) {
        if (cancelled) return;
        console.warn('Failed to load full-size photo', cause);
        setError('Could not load the full-size photo. Check that the file is available and try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, filename, fullPath, enabled, revision, attempt]);

  return {
    src,
    setSrc,
    error,
    isFullResolution,
    retry: () => setAttempt((value) => value + 1),
    onError: () => {
      setError('Could not display this photo. Check that the file is available and try again.');
      setFullResolution(false);
    },
  };
}
