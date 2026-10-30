import { RefObject, useLayoutEffect, useState } from 'react';
import { getScrollParent } from '@/utils/scrollParent';

/** Marks the elements the hook measures a row's height from. */
export const GRID_ITEM_ATTRIBUTE = 'data-grid-item';

/** Rows kept mounted above and below the viewport so scrolling stays ahead of the DOM. */
const OVERSCAN_ROWS = 4;

/**
 * Items rendered on the very first pass, before the grid has been measured.
 * Enough to fill a tall viewport so the measurement pass never sees an empty
 * grid and the user never sees a blank page.
 */
const UNMEASURED_ITEM_COUNT = 120;

export type GridMetrics = {
  columns: number;
  itemHeight: number;
  rowGap: number;
};

export type GridWindow = {
  /** Index of the first item to render. */
  start: number;
  /** Index after the last item to render. */
  end: number;
  /** Height (px) of the filler standing in for the rows before `start`. */
  topSpacer: number;
  /** Height (px) of the filler standing in for the rows after `end`. */
  bottomSpacer: number;
};

/**
 * Reads the layout back from CSS instead of duplicating it in JS: the resolved
 * `grid-template-columns` track list gives the column count for any
 * `auto-fill` grid, and the first item gives the row height. Returns `null`
 * until the grid has laid out at least one item.
 */
function _measureGrid(list: HTMLElement): GridMetrics | null {
  const style = window.getComputedStyle(list);
  const item = list.querySelector<HTMLElement>(`[${GRID_ITEM_ATTRIBUTE}]`);
  // An off-screen grid reports the authored `repeat(auto-fill, …)` instead of
  // the resolved pixel tracks, which says nothing about the column count.
  if (!item || style.gridTemplateColumns.includes('(')) return null;

  const tracks = style.gridTemplateColumns.split(' ').filter(Boolean);
  if (tracks.length === 0 || tracks[0] === 'none') return null;

  const itemHeight = item.getBoundingClientRect().height;
  if (itemHeight === 0) return null;

  return { columns: tracks.length, itemHeight, rowGap: parseFloat(style.rowGap) || 0 };
}

/**
 * Turns a range of rows into the item slice to render and the two spacer
 * heights that stand in for the rows left out, so the grid keeps the exact
 * height — and every row the exact offset — it would have had fully rendered.
 *
 * A spacer replaces whole rows *and* the gap that follows the last of them,
 * which is why each height is one `rowGap` short of the rows it covers.
 */
export function gridWindowForRows(
  rowRange: { start: number; end: number },
  metrics: GridMetrics,
  itemCount: number,
): GridWindow {
  const stride = metrics.itemHeight + metrics.rowGap;
  const rowCount = Math.ceil(itemCount / metrics.columns);
  const startRow = Math.min(Math.max(rowRange.start, 0), Math.max(rowCount - 1, 0));
  const endRow = Math.min(Math.max(rowRange.end, startRow + 1), rowCount);

  return {
    start: startRow * metrics.columns,
    end: Math.min(endRow * metrics.columns, itemCount),
    topSpacer: startRow > 0 ? startRow * stride - metrics.rowGap : 0,
    bottomSpacer: endRow < rowCount ? (rowCount - endRow) * stride - metrics.rowGap : 0,
  };
}

/**
 * Windowed rendering for a uniform CSS grid: returns the slice of items that
 * covers the visible rows plus an overscan, together with the two spacer
 * heights that keep the scrollbar (and every row's position) identical to a
 * fully rendered grid.
 *
 * The caller renders the spacers as full-width grid children around the slice,
 * so the grid keeps placing items through normal auto-flow — no absolute
 * positioning, and the CSS stays the single source of truth for cell size.
 */
export function useWindowedGrid(
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
  enabled: boolean,
  /** Bumps a remeasure when cell size changes without the list's width changing. */
  layoutKey?: unknown,
): GridWindow {
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  const [rows, setRows] = useState({ start: 0, end: 0 });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;

    const remeasure = () => {
      const next = _measureGrid(list);
      if (!next) return;
      setMetrics((previous) =>
        previous &&
        previous.columns === next.columns &&
        previous.itemHeight === next.itemHeight &&
        previous.rowGap === next.rowGap
          ? previous
          : next,
      );
    };

    remeasure();

    // A width change moves the column count and the (square) cell height at
    // once, so both are re-read from the same observer.
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);

    return () => observer.disconnect();
  }, [listRef, enabled, itemCount, layoutKey]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!enabled || !list || !metrics) return;

    const stride = metrics.itemHeight + metrics.rowGap;
    const rowCount = Math.ceil(itemCount / metrics.columns);
    const scroller = getScrollParent(list);
    let frame = 0;

    const compute = () => {
      frame = 0;
      const listTop = list.getBoundingClientRect().top;
      const viewport = scroller?.getBoundingClientRect();
      const viewTop = (viewport?.top ?? 0) - listTop;
      const viewBottom = (viewport?.bottom ?? window.innerHeight) - listTop;

      const first = Math.max(0, Math.floor(viewTop / stride) - OVERSCAN_ROWS);
      const last = Math.ceil(viewBottom / stride) + OVERSCAN_ROWS;
      const start = Math.min(first, Math.max(rowCount - 1, 0));
      const end = Math.min(Math.max(last, start + 1), rowCount);

      // Only a row boundary crossing changes the output, so most scroll frames
      // cost a rect read and nothing else.
      setRows((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };

    compute();

    const scrollTarget: EventTarget = scroller ?? window;
    scrollTarget.addEventListener('scroll', schedule, { passive: true } as AddEventListenerOptions);
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollTarget.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [listRef, enabled, metrics, itemCount]);

  if (!enabled || !metrics) {
    return {
      start: 0,
      end: enabled ? Math.min(itemCount, UNMEASURED_ITEM_COUNT) : itemCount,
      topSpacer: 0,
      bottomSpacer: 0,
    };
  }

  return gridWindowForRows(rows, metrics, itemCount);
}
