import { AssetsService } from '@/db/api/services/assets.service';
import { getCachedThumbnailPath, resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { errorLog } from '@/system/devLogger';
import { pathToImageSrc } from '@/system/diskManager';

export function createMapThumbnailLoader() {
  const resolved = new Map<string, string>();
  const pending = new Set<string>();
  let visible = new Map<string, HTMLElement>();

  const paint = (id: string, src: string) => {
    const element = visible.get(id);
    if (element) element.style.backgroundImage = `url("${src}")`;
  };

  return (pins: Map<string, HTMLElement>) => {
    visible = pins;
    const missing: string[] = [];
    for (const id of pins.keys()) {
      const path =
        getCachedThumbnailPath(id, ThumbnailSize.XS) ?? getCachedThumbnailPath(id, ThumbnailSize.DEFAULT);
      const src = path ? pathToImageSrc(path) : resolved.get(id);
      if (src) {
        paint(id, src);
      } else if (!pending.has(id)) {
        missing.push(id);
      }
    }
    if (!missing.length) return;

    const assets = AssetsService.getFiles({ assetIds: missing }).then(
      (rows) => new Map(rows.map((asset) => [asset.id, asset])),
    );
    for (const id of missing) {
      pending.add(id);
      void assets
        .then(async (rows) => {
          const asset = rows.get(id);
          if (!asset) return null;
          const path = await resolveThumbnailPath(asset, ThumbnailSize.XS);
          return path ? pathToImageSrc(path) : null;
        })
        .then((src) => {
          if (src) {
            resolved.set(id, src);
            paint(id, src);
          }
          return src;
        })
        .catch((error: unknown) => {
          errorLog('map-thumbnails', 'load-failed', error);
          return null;
        })
        .finally(() => pending.delete(id));
    }
  };
}
