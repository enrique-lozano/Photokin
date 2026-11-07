import type { AssetInClient } from '@/db/models/AssetInClient';
import { describe, expect, it } from 'vitest';
import { arrangementWarning, groupAssets, sortAssets, summarizeLabel } from './groupSort';

function _asset(
  id: string,
  over: Partial<{
    name: string;
    size: number;
    rating: number | null;
    date: string;
    city: string | null;
  }> = {},
) {
  return {
    id,
    filename: over.name ?? `${id}.jpg`,
    filesize: over.size ?? 1,
    dateAdded: new Date('2024-01-01'),
    metadata: {
      date: new Date(over.date ?? '2024-01-01'),
      rating: over.rating ?? null,
      location: over.city ? { city: over.city, state: null, country: null, name: null } : null,
    },
  } as unknown as AssetInClient;
}

describe('sortAssets', () => {
  it('sorts by name naturally and honours reversal', () => {
    const files = [_asset('a', { name: 'img10.jpg' }), _asset('b', { name: 'img2.jpg' })];
    expect(sortAssets(files, 'fileName', false, 1).map((f) => f.id)).toEqual(['b', 'a']);
    expect(sortAssets(files, 'fileName', true, 1).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('sorts date newest first by default, largest size first', () => {
    const files = [
      _asset('old', { date: '2020-01-01', size: 5 }),
      _asset('new', { date: '2024-01-01', size: 9 }),
    ];
    expect(sortAssets(files, 'dateTaken', false, 1).map((f) => f.id)).toEqual(['new', 'old']);
    expect(sortAssets(files, 'fileSize', false, 1).map((f) => f.id)).toEqual(['new', 'old']);
  });

  it('shuffles deterministically per seed', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((id) => _asset(id));
    const first = sortAssets(files, 'random', false, 1).map((f) => f.id);
    expect(sortAssets(files, 'random', false, 1).map((f) => f.id)).toEqual(first);
  });
});

describe('groupAssets', () => {
  it('groups by rating best first and reverses', () => {
    const files = [_asset('a', { rating: 2 }), _asset('b', { rating: 5 }), _asset('c')];
    const opts = { reversed: false, favoritesMode: false };
    expect(groupAssets(files, 'rating', opts).map((g) => g.label)).toEqual(['5 stars', '2 stars', 'Unrated']);
    expect(groupAssets(files, 'rating', { ...opts, reversed: true }).map((g) => g.label)).toEqual([
      'Unrated',
      '2 stars',
      '5 stars',
    ]);
  });

  it('groups by place A-Z with no-location last, even reversed', () => {
    const files = [_asset('a', { city: 'Porto' }), _asset('b'), _asset('c', { city: 'Lisbon' })];
    expect(
      groupAssets(files, 'place', { reversed: false, favoritesMode: false }).map((g) => g.label),
    ).toEqual(['Lisbon', 'Porto', 'No location']);
    expect(groupAssets(files, 'place', { reversed: true, favoritesMode: false }).map((g) => g.label)).toEqual(
      ['Porto', 'Lisbon', 'No location'],
    );
  });

  it('keeps everything in one unlabelled group for none', () => {
    const groups = groupAssets([_asset('a'), _asset('b')], 'none', { reversed: false, favoritesMode: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
  });
});

describe('labels', () => {
  it('summarises and warns', () => {
    expect(summarizeLabel('day', 'dateTaken', false)).toBe('Day · Date ↓');
    expect(summarizeLabel('day', 'dateAdded', false)).toBe('Day · Added ↓');
    expect(summarizeLabel('day', 'fileName', false)).toBe('Day · Name ↑');
    expect(summarizeLabel('day', 'fileSize', false)).toBe('Day · Size ↓');
    expect(arrangementWarning('rating', 'rating')).not.toBeNull();
    expect(arrangementWarning('day', 'rating')).toBeNull();
  });
});
