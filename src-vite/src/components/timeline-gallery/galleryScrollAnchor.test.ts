import { beforeEach, expect, it, vi } from 'vitest';
import { createGalleryScrollAnchor } from './galleryScrollAnchor';

const state = vi.hoisted(() => ({ scroller: null as HTMLElement | null }));
vi.mock('@/utils/scrollParent', () => ({ getScrollParent: () => state.scroller }));

function _fixture() {
  const scroller = { scrollTop: 100, getBoundingClientRect: () => ({ top: 0, bottom: 500 }) };
  let tiles = [
    { id: 'first', section: 'june', offset: 120 },
    { id: 'neighbor', section: 'june', offset: 180 },
  ];
  const grid = {
    querySelectorAll: () =>
      tiles.map((tile) => ({
        dataset: { assetId: tile.id },
        closest: () => ({ id: tile.section }),
        getBoundingClientRect: () => ({
          top: tile.offset - scroller.scrollTop,
          bottom: tile.offset - scroller.scrollTop + 50,
        }),
      })),
  } as unknown as HTMLElement;
  state.scroller = scroller as unknown as HTMLElement;
  const anchor = createGalleryScrollAnchor();
  anchor.capture(grid);
  return {
    anchor,
    grid,
    scroller,
    shift: (amount: number) => tiles.forEach((tile) => (tile.offset += amount)),
    removeFirst: () => (tiles = tiles.slice(1)),
    moveFirst: (section: string, offset: number) => Object.assign(tiles[0], { section, offset }),
  };
}

beforeEach(() => {
  state.scroller = null;
});

it('preserves the visible tile when another month grows above it', () => {
  const { anchor, scroller, shift } = _fixture();
  shift(80);
  anchor.restore();
  expect(scroller.scrollTop).toBe(180);
  anchor.restore();
  expect(scroller.scrollTop).toBe(180);
  shift(40);
  anchor.restore();
  expect(scroller.scrollTop).toBe(220);
});

it('uses a visible neighbor when the first photo moves out of the mounted month', () => {
  const { anchor, scroller, shift, removeFirst } = _fixture();
  removeFirst();
  shift(-50);
  anchor.restore();
  expect(scroller.scrollTop).toBe(50);
});

it('ignores a photo whose new date moved it to another mounted month', () => {
  const { anchor, scroller, moveFirst } = _fixture();
  moveFirst('march', -5000);
  anchor.restore();
  expect(scroller.scrollTop).toBe(100);
});

it('does not overwrite the anchor when multiple month queries finish together', () => {
  const { anchor, grid, scroller, shift } = _fixture();
  shift(80);
  anchor.capture(grid);
  anchor.restore();
  expect(scroller.scrollTop).toBe(180);
});

it('does not undo user scrolling while queries are committing', () => {
  const { anchor, scroller, shift } = _fixture();
  scroller.scrollTop = 150;
  shift(80);
  anchor.restore();
  expect(scroller.scrollTop).toBe(150);
});

it('resets the anchor for a different gallery scope', () => {
  const { anchor, scroller, shift } = _fixture();
  anchor.reset();
  shift(80);
  anchor.restore();
  expect(scroller.scrollTop).toBe(100);
});
