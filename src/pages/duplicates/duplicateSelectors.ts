import { DuplicateMember, DuplicateRelationship, DuplicateSet, MemberDecision } from './duplicateTypes';
import { DuplicatesSort, DuplicatesTypeFilter } from './useDuplicatesStore';

type Decisions = Record<string, MemberDecision>;

export function decisionOf(decisions: Decisions, assetId: string): MemberDecision {
  return decisions[assetId] ?? 'keep';
}

export function keptCount(set: DuplicateSet, decisions: Decisions): number {
  return set.members.filter((member) => decisionOf(decisions, member.asset.id) === 'keep').length;
}

export function removeCount(set: DuplicateSet, decisions: Decisions): number {
  return set.members.filter((member) => decisionOf(decisions, member.asset.id) === 'remove').length;
}

/** Bytes freed by removing the members currently marked "remove" in a set. */
export function recoverableBytes(set: DuplicateSet, decisions: Decisions): number {
  return set.members
    .filter((member) => decisionOf(decisions, member.asset.id) === 'remove')
    .reduce((acc, member) => acc + member.asset.filesize, 0);
}

export interface GlobalTotals {
  toRemoveCount: number;
  freesBytes: number;
}

export function globalTotals(sets: DuplicateSet[], decisions: Decisions): GlobalTotals {
  let toRemoveCount = 0;
  let freesBytes = 0;
  for (const set of sets) {
    for (const member of set.members) {
      if (decisionOf(decisions, member.asset.id) === 'remove') {
        toRemoveCount++;
        freesBytes += member.asset.filesize;
      }
    }
  }
  return { toRemoveCount, freesBytes };
}

export type TypeCounts = Record<DuplicateRelationship | 'all', number>;

export function typeCounts(sets: DuplicateSet[]): TypeCounts {
  const counts: TypeCounts = {
    all: sets.length,
    [DuplicateRelationship.Exact]: 0,
    [DuplicateRelationship.Similar]: 0,
    [DuplicateRelationship.Burst]: 0,
  };
  for (const set of sets) counts[set.relationship]++;
  return counts;
}

/** Members of a set marked for removal (used for the per-set remove action). */
export function membersToRemove(set: DuplicateSet, decisions: Decisions): DuplicateMember[] {
  return set.members.filter((member) => decisionOf(decisions, member.asset.id) === 'remove');
}

/** The set's visual confidence: the weakest match against its representative. */
export function setSimilarityPercent(set: DuplicateSet): number {
  const others = set.members.filter((_, index) => index !== set.representativeIndex);
  if (others.length === 0) return 100;
  return Math.min(...others.map((member) => member.matchPercent));
}

export function filterAndSortSets(
  sets: DuplicateSet[],
  filter: DuplicatesTypeFilter,
  sort: DuplicatesSort,
  decisions: Decisions,
): DuplicateSet[] {
  const filtered =
    filter === 'all' || filter === 'ignored' ? sets : sets.filter((set) => set.relationship === filter);

  const sorted = [...filtered];
  switch (sort) {
    case 'recoverable':
      sorted.sort((a, b) => recoverableBytes(b, decisions) - recoverableBytes(a, decisions));
      break;
    case 'copies':
      sorted.sort((a, b) => b.members.length - a.members.length);
      break;
    case 'similarity':
      sorted.sort((a, b) => setSimilarityPercent(b) - setSimilarityPercent(a));
      break;
    case 'newest':
      sorted.sort((a, b) => (b.capturedAt?.getTime() ?? 0) - (a.capturedAt?.getTime() ?? 0));
      break;
    case 'name':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }
  return sorted;
}
