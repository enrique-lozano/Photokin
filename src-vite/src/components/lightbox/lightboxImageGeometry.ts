export type DisplayedImageRect = {
  left: number;
  top: number;
  height: number;
  width: number;
};

export type PanOffset = { x: number; y: number };

/** Uniform scaling preserves the photo's proportions as the grid crop opens up. */
export function getThumbnailTransitionFrame(image: DisplayedImageRect, thumbnail: DisplayedImageRect) {
  const scale = Math.max(thumbnail.width / image.width, thumbnail.height / image.height);
  const x = thumbnail.left + thumbnail.width / 2 - (image.left + image.width / 2);
  const y = thumbnail.top + thumbnail.height / 2 - (image.top + image.height / 2);
  const cropX = Math.max(0, (image.width - thumbnail.width / scale) / 2);
  const cropY = Math.max(0, (image.height - thumbnail.height / scale) / 2);

  return {
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    clipPath: `inset(${cropY}px ${cropX}px)`,
  };
}

export function getImageClipPath(image: DisplayedImageRect, viewport: DisplayedImageRect): string {
  const top = Math.max(0, viewport.top - image.top);
  const right = Math.max(0, image.left + image.width - viewport.left - viewport.width);
  const bottom = Math.max(0, image.top + image.height - viewport.top - viewport.height);
  const left = Math.max(0, viewport.left - image.left);
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

/** How far the photo may be translated from center before an edge lifts off the frame. */
export type PanLimits = {
  maxX: number;
  maxY: number;
};

type ImageFrameParams = {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
};

type DisplayedImageRectParams = ImageFrameParams & {
  offset: PanOffset;
};

type ContainedSize = {
  width: number;
  height: number;
};

/**
 * Pixel size of the photo after `object-fit: contain` and the lightbox scale.
 * The unscaled image is letterboxed inside the container; scale grows it from
 * the center. Returns null when the inputs are not yet measurable.
 */
function _containedImageSize(params: ImageFrameParams): ContainedSize | null {
  const { containerWidth, containerHeight, naturalWidth, naturalHeight, scale } = params;

  if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0 || scale <= 0) {
    return null;
  }

  const fitScale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const width = naturalWidth * fitScale * scale;
  const height = naturalHeight * fitScale * scale;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

/**
 * Computes the on-screen rectangle (relative to the media container) actually
 * occupied by the image, accounting for `object-fit: contain` plus the
 * translate/scale transform applied by the lightbox. Returns null when the
 * inputs are not yet measurable.
 */
export function getDisplayedImageRect(params: DisplayedImageRectParams): DisplayedImageRect | null {
  const size = _containedImageSize(params);
  if (!size) return null;

  const centerX = params.containerWidth / 2 + params.offset.x;
  const centerY = params.containerHeight / 2 + params.offset.y;

  return {
    left: centerX - size.width / 2,
    top: centerY - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/**
 * Pan range on each axis. Zero means that axis already shows the whole photo,
 * so translating it would only slide the image into empty space.
 */
export function getPanLimits(params: ImageFrameParams): PanLimits | null {
  const size = _containedImageSize(params);
  if (!size) return null;

  return {
    maxX: Math.max(0, (size.width - params.containerWidth) / 2),
    maxY: Math.max(0, (size.height - params.containerHeight) / 2),
  };
}

function _clamp(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(max, Math.max(-max, value));
}

/**
 * Keeps a pan offset inside the photo. Axes where the scaled image still fits
 * in the frame are locked at 0; overflowing axes stop at the photo's edge.
 * An unmeasurable frame leaves the offset untouched.
 */
export function clampPanOffset(params: DisplayedImageRectParams): PanOffset {
  const limits = getPanLimits(params);
  if (!limits) return params.offset;

  return {
    x: _clamp(params.offset.x, limits.maxX),
    y: _clamp(params.offset.y, limits.maxY),
  };
}
