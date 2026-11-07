import { describe, expect, it } from 'vitest';
import { DEFAULT_NAVIGATION_PAGES, MAIN_PAGES, normalizeNavigationPages } from './navigationPages';

describe('navigation pages', () => {
  it('preserves custom order and visibility', () => {
    const pages = [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({
      ...page,
      visible: page.id !== 'tags',
    }));
    expect(normalizeNavigationPages(pages)).toEqual(pages);
  });

  it('appends missing pages and discards unknown and duplicate IDs', () => {
    expect(
      normalizeNavigationPages([
        { id: 'tags', visible: false },
        { id: 'unknown', visible: true },
        { id: 'tags', visible: true },
        null,
        'albums',
      ]),
    ).toEqual([
      { id: 'tags', visible: false },
      ...DEFAULT_NAVIGATION_PAGES.filter(({ id }) => id !== 'tags'),
    ]);
  });

  it('repairs malformed preferences and visibility values', () => {
    for (const value of [null, undefined, {}, 'invalid', 1, []]) {
      expect(normalizeNavigationPages(value)).toEqual(DEFAULT_NAVIGATION_PAGES);
    }
    expect(normalizeNavigationPages([{ id: 'albums', visible: 'false' }])).toEqual(DEFAULT_NAVIGATION_PAGES);
  });

  it('keeps the first configured page visible if all pages were hidden', () => {
    const pages = [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({ ...page, visible: false }));
    const result = normalizeNavigationPages(pages);
    expect(result[0]).toEqual({ id: 'duplicates', visible: true });
    expect(result.filter(({ visible }) => visible)).toHaveLength(1);
    expect(result.map(({ id }) => id)).toEqual([...MAIN_PAGES].reverse().map(({ id }) => id));
    expect(pages.every(({ visible }) => !visible)).toBe(true);
  });
});
