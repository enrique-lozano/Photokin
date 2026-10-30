import { pathToImageSrc } from '@/system/diskManager';
import { AssetInClient } from '@/db/models/AssetInClient';
import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { memo, RefObject, useEffect, useMemo, useState } from 'react';

type LightboxZoomMapProps = {
  img: AssetInClient;
  isVideo: boolean;
  scale: number;
  offset: { x: number; y: number };
  imageNaturalSize: { width: number; height: number };
  mediaContainerRef: RefObject<HTMLDivElement | null>;
};

function LightboxZoomMapComponent(props: LightboxZoomMapProps) {
  // The minimap is at most 130px wide, so it reads the thumbnail rather than
  // the original: decoding a full-size photo again to paint it this small costs
  // a repaint of that whole bitmap on every pan.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPreviewSrc(null);

    void (async () => {
      try {
        const thumbnail = await resolveThumbnailPath(props.img, ThumbnailSize.DEFAULT);
        if (!cancelled && thumbnail) setPreviewSrc(pathToImageSrc(thumbnail));
      } catch (error) {
        console.warn('Failed to load zoom map preview', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.img.id]);

  const minimapData = useMemo(() => {
    if (props.isVideo || props.scale <= 1) {
      return null;
    }

    const mediaContainer = props.mediaContainerRef.current;
    if (!mediaContainer || props.imageNaturalSize.width <= 0 || props.imageNaturalSize.height <= 0) {
      return null;
    }

    const containerWidth = mediaContainer.clientWidth;
    const containerHeight = mediaContainer.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) {
      return null;
    }

    const fitScale = Math.min(
      containerWidth / props.imageNaturalSize.width,
      containerHeight / props.imageNaturalSize.height,
    );

    const baseWidth = props.imageNaturalSize.width * fitScale;
    const baseHeight = props.imageNaturalSize.height * fitScale;
    if (baseWidth <= 0 || baseHeight <= 0) {
      return null;
    }

    const transformedWidth = baseWidth * props.scale;
    const transformedHeight = baseHeight * props.scale;
    const centerX = containerWidth / 2 + props.offset.x;
    const centerY = containerHeight / 2 + props.offset.y;
    const transformedLeft = centerX - transformedWidth / 2;
    const transformedTop = centerY - transformedHeight / 2;

    const visibleLeft = Math.max(0, -transformedLeft);
    const visibleTop = Math.max(0, -transformedTop);
    const visibleRight = Math.min(transformedWidth, containerWidth - transformedLeft);
    const visibleBottom = Math.min(transformedHeight, containerHeight - transformedTop);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    const viewportLeftRatio = transformedWidth > 0 ? visibleLeft / transformedWidth : 0;
    const viewportTopRatio = transformedHeight > 0 ? visibleTop / transformedHeight : 0;
    const viewportWidthRatio = transformedWidth > 0 ? visibleWidth / transformedWidth : 1;
    const viewportHeightRatio = transformedHeight > 0 ? visibleHeight / transformedHeight : 1;

    const maxMiniSize = 130;
    const miniScale = Math.min(maxMiniSize / baseWidth, maxMiniSize / baseHeight);
    const miniWidth = baseWidth * miniScale;
    const miniHeight = baseHeight * miniScale;

    return {
      miniWidth,
      miniHeight,
      viewportLeft: miniWidth * viewportLeftRatio,
      viewportTop: miniHeight * viewportTopRatio,
      viewportWidth: miniWidth * viewportWidthRatio,
      viewportHeight: miniHeight * viewportHeightRatio,
    };
  }, [
    props.isVideo,
    props.scale,
    props.offset.x,
    props.offset.y,
    props.imageNaturalSize.width,
    props.imageNaturalSize.height,
    props.mediaContainerRef,
  ]);

  if (!minimapData) {
    return null;
  }

  return (
    <div className="lightbox-zoom-map">
      <div
        className="lightbox-zoom-map__image"
        style={{ width: `${minimapData.miniWidth}px`, height: `${minimapData.miniHeight}px` }}
      >
        {previewSrc && <img src={previewSrc} alt="Zoom area preview" draggable={false} />}
        <div
          className="lightbox-zoom-map__viewport"
          style={{
            left: `${minimapData.viewportLeft}px`,
            top: `${minimapData.viewportTop}px`,
            width: `${minimapData.viewportWidth}px`,
            height: `${minimapData.viewportHeight}px`,
          }}
        />
      </div>
    </div>
  );
}

export const LightboxZoomMap = memo(LightboxZoomMapComponent);
