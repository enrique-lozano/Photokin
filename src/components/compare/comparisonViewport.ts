import { isSupportedVideoPath } from '@/common/supportedFormats';

export function canComparePhotos<T extends { id: string; filename: string; trashedAt?: Date | null }>(
  assets: T[],
): assets is [T, T] {
  return (
    assets.length === 2 &&
    assets[0].id !== assets[1].id &&
    assets.every((asset) => !asset.trashedAt && !isSupportedVideoPath(asset.filename))
  );
}

export type ComparisonViewport = {
  /** Numeric zoom is screen pixels per image pixel; fit follows pane resizing. */
  zoom: 'fit' | number;
  x: number;
  y: number;
};

export type ComparisonFrame = {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  pixelRatio: number;
};

export const FIT_VIEWPORT: ComparisonViewport = { zoom: 'fit', x: 0.5, y: 0.5 };

export function getFitZoom(frame: ComparisonFrame): number {
  return Math.min(frame.width / frame.naturalWidth, frame.height / frame.naturalHeight) * frame.pixelRatio;
}

function _imageSize(frame: ComparisonFrame, viewport: ComparisonViewport) {
  const zoom = viewport.zoom === 'fit' ? getFitZoom(frame) : viewport.zoom;
  return {
    width: (frame.naturalWidth * zoom) / frame.pixelRatio,
    height: (frame.naturalHeight * zoom) / frame.pixelRatio,
  };
}

export function clampComparisonViewport(
  frame: ComparisonFrame,
  viewport: ComparisonViewport,
): ComparisonViewport {
  const size = _imageSize(frame, viewport);
  const clampCenter = (center: number, pane: number, image: number) =>
    image <= pane ? 0.5 : Math.max(pane / (2 * image), Math.min(1 - pane / (2 * image), center));
  return {
    ...viewport,
    x: clampCenter(viewport.x, frame.width, size.width),
    y: clampCenter(viewport.y, frame.height, size.height),
  };
}

export function getComparisonImageRect(frame: ComparisonFrame, viewport: ComparisonViewport) {
  const size = _imageSize(frame, viewport);
  const center = clampComparisonViewport(frame, viewport);
  return {
    ...size,
    left: frame.width / 2 - center.x * size.width,
    top: frame.height / 2 - center.y * size.height,
  };
}

export function zoomComparisonViewport(
  frame: ComparisonFrame,
  viewport: ComparisonViewport,
  zoom: ComparisonViewport['zoom'],
  anchor = { x: frame.width / 2, y: frame.height / 2 },
): ComparisonViewport {
  if (zoom === 'fit') return { ...FIT_VIEWPORT };
  const safeZoom = Math.max(
    Math.min(getFitZoom(frame), 0.01),
    Math.min(Math.max(getFitZoom(frame), 16), zoom),
  );
  const before = getComparisonImageRect(frame, viewport);
  const after = _imageSize(frame, { ...viewport, zoom: safeZoom });
  return clampComparisonViewport(frame, {
    zoom: safeZoom,
    x: (anchor.x - before.left) / before.width + (frame.width / 2 - anchor.x) / after.width,
    y: (anchor.y - before.top) / before.height + (frame.height / 2 - anchor.y) / after.height,
  });
}
