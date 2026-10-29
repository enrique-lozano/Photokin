import { describe, expect, it } from 'vitest';
import type { GalleryScope } from './galleryScope';
import { personRegionIds, scopeMatchCount, selectionMenuItems } from './selectionMenuItems';

const loaded = { hasPhotos: true, hasTags: true, hasFaceData: true, scopeMatches: 0 };

describe('selectionMenuItems', () => {
  it('shows every applicable action once the selection is known', () => {
    expect(selectionMenuItems({ ...loaded, scopeMatches: 2 })).toEqual({
      removeTags: 'ready',
      detectFaces: 'ready',
      recognizeFaces: 'ready',
      removeFaceData: 'ready',
      removeFromScope: 'ready',
    });
  });

  it('hides face actions for a video-only selection', () => {
    const items = selectionMenuItems({ ...loaded, hasPhotos: false, hasFaceData: null });
    expect(items.detectFaces).toBe('hidden');
    expect(items.recognizeFaces).toBe('hidden');
    expect(items.removeFaceData).toBe('hidden');
  });

  it('hides actions with nothing to act on, but keeps detection', () => {
    const items = selectionMenuItems({ ...loaded, hasTags: false, hasFaceData: false });
    expect(items.removeTags).toBe('hidden');
    expect(items.detectFaces).toBe('ready');
    expect(items.recognizeFaces).toBe('hidden');
    expect(items.removeFaceData).toBe('hidden');
    expect(items.removeFromScope).toBe('hidden');
  });

  it('keeps still-loading actions as pending (shown disabled)', () => {
    const items = selectionMenuItems({ ...loaded, hasTags: null, hasFaceData: null, scopeMatches: null });
    expect(items.removeTags).toBe('pending');
    expect(items.recognizeFaces).toBe('pending');
    expect(items.removeFaceData).toBe('pending');
    expect(items.removeFromScope).toBe('pending');
  });
});

describe('scopeMatchCount', () => {
  const person: GalleryScope = {
    kind: 'person',
    personName: 'Ana',
    regionIdsByAsset: new Map([
      ['a', ['r1']],
      ['b', ['r2', 'r3']],
    ]),
  };
  const tag: GalleryScope = { kind: 'tag', tagId: 't1', tagName: 'Beach' };

  it('is zero without a page scope', () => {
    expect(scopeMatchCount(null, ['a'], null)).toBe(0);
  });

  it("counts the selected photos in a person's results", () => {
    expect(scopeMatchCount(person, ['a', 'b', 'c'], null)).toBe(2);
    expect(scopeMatchCount(person, ['c'], null)).toBe(0);
  });

  it('counts selected photos carrying the tag directly, waiting for the counts', () => {
    expect(scopeMatchCount(tag, ['a'], null)).toBeNull();
    expect(scopeMatchCount(tag, ['a'], new Map([['t1', 3]]))).toBe(3);
    expect(scopeMatchCount(tag, ['a'], new Map([['t2', 3]]))).toBe(0);
  });

  it("collects the person's faces on the selected photos", () => {
    if (person.kind !== 'person') throw new Error('unreachable');
    expect(personRegionIds(person, ['b', 'c', 'a'])).toEqual(['r2', 'r3', 'r1']);
  });
});
