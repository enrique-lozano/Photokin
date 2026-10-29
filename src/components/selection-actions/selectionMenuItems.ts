import type { GalleryScope } from './galleryScope';

/**
 * - `hidden`: can never apply to this selection here, so it is left out.
 * - `pending`: could apply but is still being worked out; shown disabled.
 * - `ready`: applies (other temporary blockers may still disable it).
 */
export type ItemVisibility = 'hidden' | 'pending' | 'ready';

/** What is known about the selection. `null` means still loading. */
export interface SelectionMenuFacts {
  /** At least one selected item is a photo (not a video). */
  hasPhotos: boolean;
  hasTags: boolean | null;
  hasFaceData: boolean | null;
  /** Selected items the page scope's removal would change. */
  scopeMatches: number | null;
}

export interface SelectionMenuItems {
  removeTags: ItemVisibility;
  detectFaces: ItemVisibility;
  recognizeFaces: ItemVisibility;
  removeFaceData: ItemVisibility;
  removeFromScope: ItemVisibility;
}

function _fromFlag(flag: boolean | null): ItemVisibility {
  return flag === null ? 'pending' : flag ? 'ready' : 'hidden';
}

export function selectionMenuItems(facts: SelectionMenuFacts): SelectionMenuItems {
  const faceData = facts.hasPhotos ? _fromFlag(facts.hasFaceData) : 'hidden';
  return {
    removeTags: _fromFlag(facts.hasTags),
    detectFaces: facts.hasPhotos ? 'ready' : 'hidden',
    recognizeFaces: faceData,
    removeFaceData: faceData,
    removeFromScope: _fromFlag(facts.scopeMatches === null ? null : facts.scopeMatches > 0),
  };
}

/**
 * How many selected items the scope's removal would change, or `null` while the
 * selection's tags are loading. Zero without a scope.
 */
export function scopeMatchCount(
  scope: GalleryScope | null,
  assetIds: readonly string[],
  tagCounts: ReadonlyMap<string, number> | null,
): number | null {
  if (!scope) return 0;
  if (scope.kind === 'person') return assetIds.filter((id) => scope.regionIdsByAsset.has(id)).length;
  return tagCounts ? (tagCounts.get(scope.tagId) ?? 0) : null;
}

/** The person's face regions on the given photos. */
export function personRegionIds(
  scope: Extract<GalleryScope, { kind: 'person' }>,
  assetIds: readonly string[],
): string[] {
  return assetIds.flatMap((id) => scope.regionIdsByAsset.get(id) ?? []);
}
