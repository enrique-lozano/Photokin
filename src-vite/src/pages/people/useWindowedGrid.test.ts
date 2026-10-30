import { describe, expect, it } from 'vitest';
import { gridWindowForRows, type GridMetrics } from './useWindowedGrid';

const metrics: GridMetrics = { columns: 4, itemHeight: 100, rowGap: 6 };

/** Height the grid would have with every row rendered. */
function _fullHeight(rowCount: number, { itemHeight, rowGap }: GridMetrics): number {
  return rowCount * itemHeight + (rowCount - 1) * rowGap;
}

/** Height of the windowed grid: the two spacers, the rendered rows and the gaps between them. */
function _windowedHeight(
  window: ReturnType<typeof gridWindowForRows>,
  renderedRows: number,
  { itemHeight, rowGap }: GridMetrics,
): number {
  const spacerRows = (window.topSpacer > 0 ? 1 : 0) + (window.bottomSpacer > 0 ? 1 : 0);
  const gaps = renderedRows + spacerRows - 1;
  return window.topSpacer + window.bottomSpacer + renderedRows * itemHeight + gaps * rowGap;
}

describe('gridWindowForRows', () => {
  it('renders the items of the requested rows', () => {
    expect(gridWindowForRows({ start: 2, end: 5 }, metrics, 100)).toMatchObject({ start: 8, end: 20 });
  });

  it('stops the last slice at the item count, not at the row boundary', () => {
    // 10 items over 4 columns: the third row only holds two of them.
    expect(gridWindowForRows({ start: 0, end: 3 }, metrics, 10)).toMatchObject({
      start: 0,
      end: 10,
      topSpacer: 0,
      bottomSpacer: 0,
    });
  });

  it('keeps the grid the height it would have fully rendered', () => {
    const itemCount = 1000;
    const rowCount = itemCount / metrics.columns;

    for (const [start, end] of [
      [0, 6],
      [3, 9],
      [rowCount - 4, rowCount],
      [rowCount - 1, rowCount],
    ]) {
      const window = gridWindowForRows({ start, end }, metrics, itemCount);
      expect(_windowedHeight(window, end - start, metrics)).toBe(_fullHeight(rowCount, metrics));
    }
  });

  it('clamps a row range left over from a longer list', () => {
    // A live refresh can shrink the list while the user sits far down it.
    const window = gridWindowForRows({ start: 400, end: 410 }, metrics, 12);
    expect(window).toMatchObject({ start: 8, end: 12, bottomSpacer: 0 });
    expect(_windowedHeight(window, 1, metrics)).toBe(_fullHeight(3, metrics));
  });
});
