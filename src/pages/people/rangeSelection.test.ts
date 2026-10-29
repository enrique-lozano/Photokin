import { describe, expect, it } from 'vitest';
import { clickSelection } from './rangeSelection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('clickSelection', () => {
  it('toggles on a plain click', () => {
    expect([...clickSelection(new Set(), ids, 'b', null, false)]).toEqual(['b']);
    expect([...clickSelection(new Set(['b']), ids, 'b', 'b', false)]).toEqual([]);
  });

  it('selects the range from the anchor on shift-click, in either direction', () => {
    expect([...clickSelection(new Set(['b']), ids, 'd', 'b', true)].sort()).toEqual(['b', 'c', 'd']);
    expect([...clickSelection(new Set(['d']), ids, 'a', 'd', true)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps what was already selected outside the range', () => {
    expect([...clickSelection(new Set(['a']), ids, 'e', 'd', true)].sort()).toEqual(['a', 'd', 'e']);
  });

  it('falls back to a toggle when the anchor is missing or gone', () => {
    expect([...clickSelection(new Set(), ids, 'c', null, true)]).toEqual(['c']);
    expect([...clickSelection(new Set(), ids, 'c', 'zz', true)]).toEqual(['c']);
  });

  it('does not mutate the current selection', () => {
    const current = new Set(['a']);
    clickSelection(current, ids, 'b', null, false);
    expect([...current]).toEqual(['a']);
  });
});
