import { describe, expect, it } from 'vitest';
import { formatSidebarFilterCount } from './sidebarFilterCount';

describe('formatSidebarFilterCount', () => {
  it('shows the total on its own until a filter is active', () => {
    expect(formatSidebarFilterCount(136, null)).toBe('136');
  });

  it('shows the matches over that same total while filtering', () => {
    expect(formatSidebarFilterCount(136, 4)).toBe('4 / 136');
    expect(formatSidebarFilterCount(136, 0)).toBe('0 / 136');
  });
});
