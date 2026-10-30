import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { PersonRegion } from '@/db/models/PersonInfo';
import { pathToImageSrc } from '@/system/diskManager';
import { CSSProperties, useEffect, useState } from 'react';
import './faceThumbnail.css';

type FaceContextPreviewProps = {
  region: PersonRegion;
  /** Shows a band this tall (px) around the face, full width, instead of the whole photo. */
  bandHeight?: number;
};

/**
 * The whole photo a face was detected in, with the face outlined and everything
 * around it dimmed — shown on hover so a cropped face can be identified from its
 * surroundings. Reuses the DEFAULT thumbnail (already cached by the face crop),
 * and positions the box from the same display-oriented, center-based area.
 */
export function FaceContextPreview({ region, bandHeight }: FaceContextPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [bandOffset, setBandOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const thumbnailPath = await resolveThumbnailPath(
        { id: region.assetId, fullPath: region.path },
        ThumbnailSize.DEFAULT,
      );
      if (!cancelled) setSrc(pathToImageSrc(thumbnailPath ?? region.path));
    })();

    return () => {
      cancelled = true;
    };
  }, [region]);

  const boxStyle: CSSProperties = {
    left: `${(region.area.x - region.area.w / 2) * 100}%`,
    top: `${(region.area.y - region.area.h / 2) * 100}%`,
    width: `${region.area.w * 100}%`,
    height: `${region.area.h * 100}%`,
  };

  // Slides the photo so the face sits mid-band, without showing past its edges.
  function centerBand(image: HTMLImageElement) {
    if (!bandHeight) return;
    const height = image.clientHeight;
    setBandOffset(Math.min(0, Math.max(bandHeight - height, bandHeight / 2 - region.area.y * height)));
  }

  return (
    <div
      className={bandHeight ? 'face-context-preview face-context-preview--band' : 'face-context-preview'}
      style={bandHeight ? { height: bandHeight } : undefined}
    >
      {src ? (
        <div className="face-context-preview__frame" style={bandHeight ? { top: bandOffset } : undefined}>
          <img
            className="face-context-preview__image"
            src={src}
            alt="Photo context"
            onLoad={(event) => centerBand(event.currentTarget)}
          />
          <span className="face-context-preview__box" style={boxStyle} />
        </div>
      ) : (
        <div className="face-context-preview__loading" />
      )}
    </div>
  );
}
