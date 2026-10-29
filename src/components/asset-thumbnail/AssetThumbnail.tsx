import { AssetInClient } from '@/db/models/AssetInClient';
import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { pathToImageSrc } from '@/system/diskManager';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import './assetThumbnail.css';

type Props = {
  asset: AssetInClient;
  size?: ThumbnailSize;
  className?: string;
};

/**
 * Thin wrapper over the existing thumbnail pipeline: lazily resolves a cached
 * thumbnail for an asset and renders it as an `<img>`. The grid never decodes
 * full images — only the full-screen viewer loads native resolution.
 */
export function AssetThumbnail({ asset, size = ThumbnailSize.DEFAULT, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSrc(null);
    setState('loading');

    void (async () => {
      try {
        const path = await resolveThumbnailPath(asset, size, {
          generationDelayMs: 80,
          signal: controller.signal,
        });
        if (!cancelled && path) setSrc(pathToImageSrc(path));
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [asset, size]);

  return (
    <div className={clsx('asset-thumb', className)}>
      {src && (
        <img
          src={src}
          alt={asset.metadata.getAltText()}
          className={clsx('asset-thumb__img', state)}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
    </div>
  );
}
