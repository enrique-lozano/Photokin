import { getScrollParent } from '@/utils/scrollParent';

export function createGalleryScrollAnchor() {
  let anchor: {
    grid: HTMLElement;
    scroller: HTMLElement;
    scrollTop: number;
    tiles: { id: string; section?: string; top: number }[];
  } | null = null;

  return {
    reset() {
      anchor = null;
    },
    capture(grid: HTMLElement | null) {
      if (anchor && anchor.scroller.scrollTop === anchor.scrollTop) return;
      anchor = null;
      const scroller = getScrollParent(grid);
      if (!grid || !scroller) return;
      const viewport = scroller.getBoundingClientRect();
      const tiles: { id: string; section?: string; top: number }[] = [];
      for (const tile of grid.querySelectorAll<HTMLElement>('[data-asset-id]')) {
        const rect = tile.getBoundingClientRect();
        if (tile.dataset.assetId && rect.bottom > viewport.top && rect.top < viewport.bottom) {
          tiles.push({ id: tile.dataset.assetId, section: tile.closest('.section')?.id, top: rect.top });
          if (tiles.length === 3) break;
        }
      }
      if (tiles.length) anchor = { grid, scroller, scrollTop: scroller.scrollTop, tiles };
    },
    restore() {
      if (!anchor) return;
      if (anchor.scroller.scrollTop !== anchor.scrollTop) {
        anchor = null;
        return;
      }
      const tiles = Array.from(anchor.grid.querySelectorAll<HTMLElement>('[data-asset-id]'));
      for (const [index, previous] of anchor.tiles.entries()) {
        // A tile whose date moved it to another month is no longer a valid anchor.
        const tile = tiles.find(
          (candidate) =>
            candidate.dataset.assetId === previous.id &&
            candidate.closest('.section')?.id === previous.section,
        );
        if (!tile) continue;
        anchor.scroller.scrollTop += tile.getBoundingClientRect().top - previous.top;
        anchor.scrollTop = anchor.scroller.scrollTop;
        anchor.tiles = anchor.tiles.slice(index);
        return;
      }
    },
  };
}
