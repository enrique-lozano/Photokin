import justifiedLayout from 'justified-layout';
import { GalleryLayoutMode } from '../../stores/appState';

export type JustifiedLayoutOptions = NonNullable<Parameters<typeof justifiedLayout>[1]>;
export type JustifiedLayoutResult = ReturnType<typeof justifiedLayout>;
type LayoutBox = JustifiedLayoutResult['boxes'][number];

/** Intrinsic size of a single asset fed to the layout algorithms. */
export interface LayoutSize {
  width: number;
  height: number;
}

/** Resolves a `boxSpacing` option (number | { horizontal }) down to a single horizontal/vertical gap. */
function _resolveSpacing(boxSpacing: JustifiedLayoutOptions['boxSpacing']): number {
  if (typeof boxSpacing === 'number') return boxSpacing;
  if (boxSpacing && typeof boxSpacing === 'object') return boxSpacing.horizontal;
  return 0;
}

/**
 * Equal-width masonry (Pinterest-style): images keep their aspect ratio and are
 * dropped into the shortest column, producing a ragged bottom edge. Adapted from
 * the column-packing approach used in the reference project's `layout.ts`.
 */
export function computeMasonryLayout(
  sizes: LayoutSize[],
  options: JustifiedLayoutOptions,
): JustifiedLayoutResult {
  const containerWidth = options.containerWidth ?? 0;
  const targetWidth = options.targetRowHeight ?? 200;
  const spacing = _resolveSpacing(options.boxSpacing);

  const columnCount = Math.max(1, Math.round((containerWidth + spacing) / (targetWidth + spacing)));
  const columnWidth = (containerWidth - (columnCount - 1) * spacing) / columnCount;
  const columnHeights = new Array<number>(columnCount).fill(0);

  const boxes: LayoutBox[] = sizes.map((size) => {
    const aspectRatio = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
    const height = columnWidth / aspectRatio;

    // Place the item in the currently shortest column.
    let column = 0;
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < columnHeights[column]) column = i;
    }

    const box: LayoutBox = {
      aspectRatio,
      left: column * (columnWidth + spacing),
      top: columnHeights[column],
      width: columnWidth,
      height,
    };

    columnHeights[column] += height + spacing;
    return box;
  });

  const tallestColumn = columnHeights.length > 0 ? Math.max(...columnHeights) : 0;
  const containerHeight = Math.max(0, tallestColumn - spacing);

  return { containerHeight, widowCount: 0, boxes };
}

/**
 * Uniform square grid of fixed-size cards. Aspect ratios are ignored at the
 * layout level; thumbnails crop to fill (see `tile--card` in the CSS).
 */
export function computeCardLayout(
  sizes: LayoutSize[],
  options: JustifiedLayoutOptions,
): JustifiedLayoutResult {
  const containerWidth = options.containerWidth ?? 0;
  const targetSize = options.targetRowHeight ?? 200;
  const spacing = _resolveSpacing(options.boxSpacing);

  const columnCount = Math.max(1, Math.round((containerWidth + spacing) / (targetSize + spacing)));
  const cellSize = (containerWidth - (columnCount - 1) * spacing) / columnCount;

  const boxes: LayoutBox[] = sizes.map((_size, index) => {
    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    return {
      aspectRatio: 1,
      left: column * (cellSize + spacing),
      top: row * (cellSize + spacing),
      width: cellSize,
      height: cellSize,
    };
  });

  const rowCount = Math.ceil(sizes.length / columnCount);
  const containerHeight = rowCount > 0 ? rowCount * cellSize + (rowCount - 1) * spacing : 0;

  return { containerHeight, widowCount: 0, boxes };
}

/**
 * Lays out a single timeline segment under the active {@link GalleryLayoutMode}.
 * Every mode returns the same `{ containerHeight, boxes }` shape so the rest of
 * the timeline (tile positioning, virtualization, height bookkeeping) stays
 * mode-agnostic.
 */
export function computeSegmentLayout(
  mode: GalleryLayoutMode,
  sizes: LayoutSize[],
  options: JustifiedLayoutOptions,
): JustifiedLayoutResult {
  switch (mode) {
    case 'masonry':
      return computeMasonryLayout(sizes, options);
    case 'card':
      return computeCardLayout(sizes, options);
    case 'justified':
    default:
      return justifiedLayout(sizes, options);
  }
}

/**
 * Approximate height of a section (a calendar month) before its real content
 * mounts. Used for scroll placeholders and the timeline scrubber, so it only
 * needs to be in the right ballpark for the active layout mode. Assumes a 3:2
 * landscape aspect ratio, matching the original Google Photos heuristic.
 */
export function estimateSectionHeight(
  mode: GalleryLayoutMode,
  totalImages: number,
  options: JustifiedLayoutOptions,
): number {
  const containerWidth = options.containerWidth ?? 1;
  const target = options.targetRowHeight ?? 200;
  const spacing = _resolveSpacing(options.boxSpacing);

  if (totalImages <= 0) return 0;

  if (mode === 'card') {
    const columnCount = Math.max(1, Math.round((containerWidth + spacing) / (target + spacing)));
    const cellSize = (containerWidth - (columnCount - 1) * spacing) / columnCount;
    const rowCount = Math.ceil(totalImages / columnCount);
    return rowCount * cellSize + (rowCount - 1) * spacing;
  }

  if (mode === 'masonry') {
    const columnCount = Math.max(1, Math.round((containerWidth + spacing) / (target + spacing)));
    const columnWidth = (containerWidth - (columnCount - 1) * spacing) / columnCount;
    // Assume 3:2 landscape -> tile height = columnWidth * 2 / 3.
    const tileHeight = (columnWidth * 2) / 3;
    const rowsPerColumn = Math.ceil(totalImages / columnCount);
    return rowsPerColumn * (tileHeight + spacing);
  }

  // Justified: unwrap all tiles into a single row at target height (discounted
  // for downscaling/coalescing) then wrap to the container width.
  const unwrappedWidth = (3 / 2) * totalImages * target * (7 / 10);
  const rows = Math.ceil(unwrappedWidth / containerWidth);
  return rows * target;
}
