/**
 * Room the name pill needs past the box: the 6px gap (`bottom: -6px`) plus
 * the pill itself (12px type at 1.3 line-height, 4px of vertical padding).
 */
const FACE_LABEL_CLEARANCE = 28;

/** Matches `.lightbox-face-box__label` max-width. */
const LABEL_MAX_WIDTH = 200;

/** Horizontal padding (8px each side). */
const LABEL_PADDING_X = 16;

/** 12px icon plus the 3px flex gap, only when a status icon is shown. */
const LABEL_ICON_WIDTH = 15;

/**
 * Generous 12px-font advance so a corner pill is pulled inside the frame
 * rather than clipped by a few pixels. Capped at the CSS max-width, where
 * the pill ellipsizes and the estimate matches the real width exactly.
 */
const LABEL_CHAR_WIDTH = 8;

const LABEL_EDGE_MARGIN = 8;

export type FaceLabelPlacement = {
  /** Draw the pill above the box; the frame would clip it below. */
  above: boolean;
  /** Extra translateX so a centered pill stays inside the media container. */
  shiftX: number;
};

export function estimateFaceLabelWidth(name: string, hasIcon: boolean): number {
  const text = name.length * LABEL_CHAR_WIDTH;
  const width = LABEL_PADDING_X + (hasIcon ? LABEL_ICON_WIDTH : 0) + text;
  return Math.min(LABEL_MAX_WIDTH, Math.max(width, LABEL_PADDING_X));
}

export function faceLabelPlacement(
  box: { left: number; top: number; width: number; height: number },
  container: { width: number; height: number },
  labelWidth: number,
): FaceLabelPlacement {
  if (container.width <= 0 || container.height <= 0) {
    return { above: false, shiftX: 0 };
  }

  const spaceBelow = container.height - (box.top + box.height);
  const spaceAbove = box.top;
  const above = spaceBelow < FACE_LABEL_CLEARANCE && spaceAbove > spaceBelow;

  const center = box.left + box.width / 2;
  const half = labelWidth / 2;
  const minLeft = LABEL_EDGE_MARGIN;
  const maxLeft = Math.max(minLeft, container.width - LABEL_EDGE_MARGIN - labelWidth);
  const left = Math.min(Math.max(center - half, minLeft), maxLeft);

  return { above, shiftX: left - (center - half) };
}
