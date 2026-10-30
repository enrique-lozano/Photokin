import { describe, expect, it } from 'vitest';
import {
  applyTagMembershipChanges,
  tagCheckState,
  tagTreeCheckState,
  tagTreeToggleChanges,
} from './tagAssignments';

describe('tagCheckState', () => {
  it('is checked only when every selected asset carries the tag', () => {
    expect(tagCheckState(3, 3)).toBe('checked');
  });

  it('is unchecked when no selected asset carries the tag', () => {
    expect(tagCheckState(0, 3)).toBe('unchecked');
    expect(tagCheckState(0, 0)).toBe('unchecked');
  });

  it('is indeterminate when only some selected assets carry the tag', () => {
    expect(tagCheckState(1, 3)).toBe('indeterminate');
    expect(tagCheckState(2, 3)).toBe('indeterminate');
  });
});

describe('tagTreeCheckState', () => {
  it('shows an unassigned parent as indeterminate when a nested tag is present', () => {
    expect(tagTreeCheckState('unchecked', ['unchecked', 'checked'])).toBe('indeterminate');
    expect(tagTreeCheckState('unchecked', ['indeterminate'])).toBe('indeterminate');
  });

  it('keeps the parent own membership state when it is assigned', () => {
    expect(tagTreeCheckState('checked', ['unchecked'])).toBe('checked');
    expect(tagTreeCheckState('indeterminate', ['checked'])).toBe('indeterminate');
  });

  it('keeps an empty branch unchecked', () => {
    expect(tagTreeCheckState('unchecked', ['unchecked'])).toBe('unchecked');
  });
});

describe('tagTreeToggleChanges', () => {
  it('checks only the parent when an indeterminate branch is clicked', () => {
    expect(tagTreeToggleChanges('parent', ['child-a', 'child-b'], 'indeterminate')).toEqual(
      new Map([['parent', true]]),
    );
  });

  it('unchecks the entire branch when its checked parent is clicked', () => {
    expect(tagTreeToggleChanges('parent', ['child-a', 'grandchild'], 'checked')).toEqual(
      new Map([
        ['parent', false],
        ['child-a', false],
        ['grandchild', false],
      ]),
    );
  });

  it('checks only an unchecked node', () => {
    expect(tagTreeToggleChanges('tag', [], 'unchecked')).toEqual(new Map([['tag', true]]));
  });
});

describe('applyTagMembershipChanges', () => {
  const current = () =>
    new Map<string, Set<string>>([
      ['a', new Set(['t1'])],
      ['b', new Set(['t1', 't2'])],
      ['c', new Set()],
    ]);

  it('adds a tag only to the assets that lack it', () => {
    const { changedAssetIds, finalTagIdsByAsset } = applyTagMembershipChanges(current(), ['t2'], []);
    // 'b' already has t2, so it is unchanged.
    expect(new Set(changedAssetIds)).toEqual(new Set(['a', 'c']));
    expect(finalTagIdsByAsset.get('a')).toEqual(new Set(['t1', 't2']));
    expect(finalTagIdsByAsset.get('c')).toEqual(new Set(['t2']));
    expect(finalTagIdsByAsset.has('b')).toBe(false);
  });

  it('removes a tag only from the assets that have it', () => {
    const { changedAssetIds, finalTagIdsByAsset } = applyTagMembershipChanges(current(), [], ['t1']);
    expect(new Set(changedAssetIds)).toEqual(new Set(['a', 'b']));
    expect(finalTagIdsByAsset.get('a')).toEqual(new Set());
    expect(finalTagIdsByAsset.get('b')).toEqual(new Set(['t2']));
  });

  it('leaves untouched tags per-asset (preserves an indeterminate checkbox)', () => {
    // Neither adding nor removing t2 keeps b's t2 and c's lack of it.
    const { changedAssetIds } = applyTagMembershipChanges(current(), [], []);
    expect(changedAssetIds).toEqual([]);
  });

  it('applies adds and removes together', () => {
    const { finalTagIdsByAsset } = applyTagMembershipChanges(current(), ['t3'], ['t1']);
    expect(finalTagIdsByAsset.get('a')).toEqual(new Set(['t3']));
    expect(finalTagIdsByAsset.get('b')).toEqual(new Set(['t2', 't3']));
    expect(finalTagIdsByAsset.get('c')).toEqual(new Set(['t3']));
  });
});
