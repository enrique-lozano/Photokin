export type TagCheckState = 'checked' | 'unchecked' | 'indeterminate';

/**
 * Tri-state a tag's checkbox shows for the current selection: `checked` when
 * every selected asset carries it, `unchecked` when none do, and
 * `indeterminate` when only some do.
 */
export function tagCheckState(assignedCount: number, totalAssets: number): TagCheckState {
  if (totalAssets <= 0 || assignedCount <= 0) return 'unchecked';
  return assignedCount >= totalAssets ? 'checked' : 'indeterminate';
}

/**
 * Adds hierarchy context without changing tag-membership semantics. A parent
 * that is not itself assigned shows a dash when any nested tag is present.
 */
export function tagTreeCheckState(
  ownState: TagCheckState,
  descendantStates: Iterable<TagCheckState>,
): TagCheckState {
  if (ownState !== 'unchecked') return ownState;
  for (const state of descendantStates) {
    if (state !== 'unchecked') return 'indeterminate';
  }
  return 'unchecked';
}

/**
 * Clicking an indeterminate branch adds only its parent tag. Clicking the now
 * checked parent clears the parent and every nested tag, allowing the branch to
 * reach a genuinely unchecked state without bulk-adding all descendants.
 */
export function tagTreeToggleChanges(
  id: string,
  descendantIds: Iterable<string>,
  currentState: TagCheckState,
): Map<string, boolean> {
  if (currentState !== 'checked') return new Map([[id, true]]);
  return new Map([id, ...descendantIds].map((tagId) => [tagId, false]));
}

export interface TagMembershipDiff {
  /** Assets whose tag set changed and therefore need a file rewrite. */
  changedAssetIds: string[];
  /** Final tag-id set for every changed asset. */
  finalTagIdsByAsset: Map<string, Set<string>>;
}

/**
 * Applies a bulk add/remove onto each asset's current tag set. Tags that are
 * neither added nor removed keep their per-asset membership — this is how an
 * untouched (indeterminate) checkbox is preserved. Only assets that actually
 * change are reported, so unchanged files are never rewritten.
 */
export function applyTagMembershipChanges(
  currentByAsset: Map<string, Set<string>>,
  addTagIds: Iterable<string>,
  removeTagIds: Iterable<string>,
): TagMembershipDiff {
  const additions = new Set(addTagIds);
  const removals = new Set(removeTagIds);

  const changedAssetIds: string[] = [];
  const finalTagIdsByAsset = new Map<string, Set<string>>();

  for (const [assetId, current] of currentByAsset) {
    const final = new Set(current);
    for (const tagId of additions) final.add(tagId);
    for (const tagId of removals) final.delete(tagId);

    if (!_sameSet(current, final)) {
      changedAssetIds.push(assetId);
      finalTagIdsByAsset.set(assetId, final);
    }
  }

  return { changedAssetIds, finalTagIdsByAsset };
}

function _sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
