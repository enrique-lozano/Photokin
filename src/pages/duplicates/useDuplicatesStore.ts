import type { AssetInClient } from '@/db/models/AssetInClient';
import { create } from 'zustand';
import { DuplicatesSnapshot, PersistedSet } from './duplicatesCache';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  DuplicateMember,
  DuplicateRelationship,
  DuplicateScanResult,
  DuplicateSet,
  KeepRule,
  MAX_SIMILARITY_THRESHOLD,
  MemberDecision,
} from './duplicateTypes';
import { pickKeptAssetId } from './keepRule';

export type DuplicatesTypeFilter = DuplicateRelationship | 'all' | 'ignored';
export type DuplicatesSort = 'recoverable' | 'copies' | 'similarity' | 'newest' | 'name';
export type ScanStatus = 'idle' | 'scanning' | 'done';

export const GRID_COLUMNS_MIN = 2;
export const GRID_COLUMNS_MAX = 5;

/** Footer slider is inverted: higher value means larger (fewer) tiles. */
export function columnsToSizeSlider(columns: number): number {
  return GRID_COLUMNS_MIN + GRID_COLUMNS_MAX - columns;
}

export function sizeSliderToColumns(slider: number): number {
  return columnsToSizeSlider(slider);
}

/** Stable identity for a set across re-scans (sorted member ids). */
export function setSignature(set: DuplicateSet): string {
  return set.members
    .map((member) => member.asset.id)
    .sort()
    .join('|');
}

interface DuplicatesState {
  /** True once we've attempted to restore the persisted scan from disk. */
  hydrated: boolean;
  scanStatus: ScanStatus;
  scannedAt: number | null;
  comparedCount: number;
  totalLibraryBytes: number;

  /* -- Scan-time options (in memory for the session only). -- */
  albumIds: string[];
  includeSubAlbums: boolean;
  similarityThreshold: number;

  sets: DuplicateSet[];
  decisions: Record<string, MemberDecision>;
  /** Signatures the user marked "Not duplicates" — excluded from future scans. */
  ignoredSignatures: string[];
  /** The ignored sets from the latest scan, kept for the "Ignored" view. */
  ignoredSets: DuplicateSet[];

  keepRule: KeepRule;
  /** True once the user manually overrode the rule's selection. */
  manualEdited: boolean;
  manualOverrideCount: number;

  activeSetId: string | null;
  typeFilter: DuplicatesTypeFilter;
  sort: DuplicatesSort;

  setScanStatus: (status: ScanStatus) => void;
  applyScanResult: (result: DuplicateScanResult, totalLibraryBytes: number) => void;
  /** Restores a persisted snapshot, re-pairing sets with freshly fetched assets. */
  hydrateFromCache: (snapshot: DuplicatesSnapshot, assetsById: Map<string, AssetInClient>) => void;
  /** Marks hydration complete when there was nothing to restore. */
  markHydrated: () => void;
  /**
   * Re-validates the in-memory sets against the live library (e.g. after an
   * album is removed or files are re-indexed): drops members whose asset no
   * longer exists, refreshes surviving asset references, and removes sets that
   * fall below two members. A no-op when every referenced asset is still present.
   */
  reconcileAssets: (assetsById: Map<string, AssetInClient>) => void;
  setAlbumIds: (ids: string[]) => void;
  setIncludeSubAlbums: (value: boolean) => void;
  setSimilarityThreshold: (value: number) => void;

  setKeepRule: (rule: KeepRule) => void;
  /** Number of columns in the member grid, driven by the footer slider. */
  gridColumns: number;
  setGridColumns: (columns: number) => void;
  toggleMember: (setId: string, assetId: string) => void;
  /** Re-applies a keep rule to a single set only (counts as a manual edit). */
  applyRuleToSet: (setId: string, rule: KeepRule) => void;
  keepAllFrames: (setId: string) => void;
  ignoreSet: (setId: string) => void;
  restoreIgnored: (signature: string) => void;
  applyRemoval: (removedAssetIds: string[]) => void;

  setActiveSet: (setId: string | null) => void;
  setTypeFilter: (filter: DuplicatesTypeFilter) => void;
  setSort: (sort: DuplicatesSort) => void;
}

type Decisions = Record<string, MemberDecision>;

const DEFAULT_KEEP_RULE: KeepRule = 'largest-file';

function _clampSimilarityThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIMILARITY_THRESHOLD;
  return Math.min(MAX_SIMILARITY_THRESHOLD, Math.max(0, value));
}

/** The asset id kept for a set under a rule, falling back to its representative. */
function _keptIdForRule(set: DuplicateSet, rule: KeepRule): string {
  return pickKeptAssetId(set, rule) ?? set.members[set.representativeIndex].asset.id;
}

/** Writes keep/remove decisions for one set's members, keeping only `keepId`. */
function _assignSetDecisions(target: Decisions, set: DuplicateSet, keepId: string): void {
  for (const member of set.members) {
    target[member.asset.id] = member.asset.id === keepId ? 'keep' : 'remove';
  }
}

/** Builds the keep/remove decisions for every set under a rule. */
function _decisionsForRule(sets: DuplicateSet[], rule: KeepRule): Decisions {
  const decisions: Decisions = {};
  for (const set of sets) _assignSetDecisions(decisions, set, _keptIdForRule(set, rule));
  return decisions;
}

/**
 * Carries prior decisions onto (possibly mutated) sets, guaranteeing every set
 * still keeps at least one member. Used after hydration and reconciliation.
 */
function _decisionsPreserving(sets: DuplicateSet[], previous: Decisions): Decisions {
  const decisions: Decisions = {};
  for (const set of sets) {
    let kept = 0;
    for (const member of set.members) {
      const decision = previous[member.asset.id] ?? 'keep';
      decisions[member.asset.id] = decision;
      if (decision === 'keep') kept++;
    }
    if (kept === 0) decisions[set.members[set.representativeIndex].asset.id] = 'keep';
  }
  return decisions;
}

/** Index of the member matching `repAssetId` (0 when it's gone). */
function _reindexRepresentative(members: DuplicateMember[], repAssetId: string | undefined): number {
  return Math.max(
    0,
    members.findIndex((member) => member.asset.id === repAssetId),
  );
}

/**
 * Rebuilds sets after their member list changes: drops members failing `keep`,
 * refreshes the survivors via `mapMember`, removes sets that fall below two
 * members, and re-points the representative at a surviving member.
 */
function _pruneSets(
  sets: DuplicateSet[],
  keep: (member: DuplicateMember) => boolean,
  mapMember: (member: DuplicateMember) => DuplicateMember = (member) => member,
): DuplicateSet[] {
  return sets.flatMap((set) => {
    const repAssetId = set.members[set.representativeIndex]?.asset.id;
    const members = set.members.filter(keep).map(mapMember);
    if (members.length < 2) return [];
    return [{ ...set, members, representativeIndex: _reindexRepresentative(members, repAssetId) }];
  });
}

/** The active set id, kept if still present, else the first set (or null). */
function _resolveActiveSet(sets: DuplicateSet[], current: string | null): string | null {
  return sets.some((set) => set.id === current) ? current : (sets[0]?.id ?? null);
}

/** Re-pairs a persisted set with live assets, dropping members that vanished. */
function _rebuildSet(persisted: PersistedSet, assetsById: Map<string, AssetInClient>): DuplicateSet | null {
  const members = persisted.members.flatMap<DuplicateMember>((member) => {
    const asset = assetsById.get(member.assetId);
    if (!asset) return [];
    return [
      {
        asset,
        pHash: member.pHash === null ? null : BigInt(member.pHash),
        contentHash: member.contentHash,
        matchPercent: member.matchPercent,
      },
    ];
  });
  // A set that lost members to deletions may no longer be a duplicate.
  if (members.length < 2) return null;

  return {
    id: persisted.id,
    relationship: persisted.relationship,
    members,
    representativeIndex: _reindexRepresentative(
      members,
      persisted.members[persisted.representativeIndex]?.assetId,
    ),
    capturedAt: persisted.capturedAt === null ? null : new Date(persisted.capturedAt),
    title: persisted.title,
  };
}

/** Restores persisted sets, keeping only those whose members still exist. */
function _rebuildSets(persisted: PersistedSet[], assetsById: Map<string, AssetInClient>): DuplicateSet[] {
  return persisted.flatMap((set) => {
    const rebuilt = _rebuildSet(set, assetsById);
    return rebuilt ? [rebuilt] : [];
  });
}

export const useDuplicatesStore = create<DuplicatesState>()((set, get) => ({
  hydrated: false,
  scanStatus: 'idle',
  scannedAt: null,
  comparedCount: 0,
  totalLibraryBytes: 0,

  albumIds: [],
  includeSubAlbums: true,
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,

  sets: [],
  decisions: {},
  ignoredSignatures: [],
  ignoredSets: [],

  keepRule: DEFAULT_KEEP_RULE,
  gridColumns: GRID_COLUMNS_MIN,
  manualEdited: false,
  manualOverrideCount: 0,

  activeSetId: null,
  typeFilter: 'all',
  sort: 'recoverable',

  setScanStatus: (scanStatus) => set({ scanStatus }),

  applyScanResult: (result, totalLibraryBytes) => {
    const ignored = new Set(get().ignoredSignatures);
    const visibleSets = result.sets.filter((duplicateSet) => !ignored.has(setSignature(duplicateSet)));
    const ignoredSets = result.sets.filter((duplicateSet) => ignored.has(setSignature(duplicateSet)));

    set({
      scanStatus: 'done',
      scannedAt: result.scannedAt,
      comparedCount: result.comparedCount,
      totalLibraryBytes,
      sets: visibleSets,
      ignoredSets,
      decisions: _decisionsForRule(visibleSets, get().keepRule),
      manualEdited: false,
      manualOverrideCount: 0,
      activeSetId: visibleSets[0]?.id ?? null,
    });
  },

  hydrateFromCache: (snapshot, assetsById) => {
    const sets = _rebuildSets(snapshot.sets, assetsById);
    const ignoredSets = _rebuildSets(snapshot.ignoredSets, assetsById);

    set({
      hydrated: true,
      scanStatus: snapshot.scannedAt !== null ? 'done' : 'idle',
      scannedAt: snapshot.scannedAt,
      comparedCount: snapshot.comparedCount,
      totalLibraryBytes: snapshot.totalLibraryBytes,
      albumIds: snapshot.albumIds,
      includeSubAlbums: snapshot.includeSubAlbums,
      similarityThreshold: _clampSimilarityThreshold(snapshot.similarityThreshold),
      keepRule: snapshot.keepRule,
      manualEdited: snapshot.manualEdited,
      manualOverrideCount: snapshot.manualOverrideCount,
      sets,
      ignoredSets,
      ignoredSignatures: snapshot.ignoredSignatures,
      decisions: _decisionsPreserving(sets, snapshot.decisions),
      activeSetId: sets[0]?.id ?? null,
    });
  },

  markHydrated: () => set({ hydrated: true }),

  reconcileAssets: (assetsById) => {
    const state = get();

    // Detect whether any referenced asset vanished; if not, skip entirely so
    // unrelated asset writes (ratings, tags, …) don't churn state or the cache.
    const allMembers = [...state.sets, ...state.ignoredSets].flatMap((set) => set.members);
    const hasMissing = allMembers.some((member) => !assetsById.has(member.asset.id));
    if (!hasMissing) return;

    const refresh = (input: DuplicateSet[]): DuplicateSet[] =>
      _pruneSets(
        input,
        (member) => assetsById.has(member.asset.id),
        (member) => ({ ...member, asset: assetsById.get(member.asset.id)! }),
      );

    const sets = refresh(state.sets);
    set({
      sets,
      ignoredSets: refresh(state.ignoredSets),
      decisions: _decisionsPreserving(sets, state.decisions),
      activeSetId: _resolveActiveSet(sets, state.activeSetId),
    });
  },

  setAlbumIds: (albumIds) => set({ albumIds }),
  setIncludeSubAlbums: (includeSubAlbums) => set({ includeSubAlbums }),
  setSimilarityThreshold: (similarityThreshold) =>
    set({ similarityThreshold: _clampSimilarityThreshold(similarityThreshold) }),

  setKeepRule: (rule) =>
    set(
      rule === 'manual'
        ? { keepRule: 'manual', manualEdited: false, manualOverrideCount: 0 }
        : {
            keepRule: rule,
            decisions: _decisionsForRule(get().sets, rule),
            manualEdited: false,
            manualOverrideCount: 0,
          },
    ),

  setGridColumns: (gridColumns) =>
    set({
      gridColumns: Math.min(GRID_COLUMNS_MAX, Math.max(GRID_COLUMNS_MIN, gridColumns)),
    }),

  applyRuleToSet: (setId, rule) => {
    const state = get();
    const targetSet = state.sets.find((duplicateSet) => duplicateSet.id === setId);
    if (!targetSet) return;
    const decisions = { ...state.decisions };
    _assignSetDecisions(decisions, targetSet, _keptIdForRule(targetSet, rule));
    set({ decisions, manualEdited: true, manualOverrideCount: state.manualOverrideCount + 1 });
  },

  toggleMember: (setId, assetId) => {
    const state = get();
    const targetSet = state.sets.find((duplicateSet) => duplicateSet.id === setId);
    if (!targetSet) return;

    const current = state.decisions[assetId] ?? 'keep';
    const next: MemberDecision = current === 'keep' ? 'remove' : 'keep';

    // A set must always keep at least one photo.
    if (next === 'remove') {
      const keptCount = targetSet.members.filter(
        (member) => (state.decisions[member.asset.id] ?? 'keep') === 'keep',
      ).length;
      if (keptCount <= 1) return;
    }

    set({
      decisions: { ...state.decisions, [assetId]: next },
      manualEdited: true,
      manualOverrideCount: state.manualOverrideCount + 1,
    });
  },

  keepAllFrames: (setId) => {
    const state = get();
    const targetSet = state.sets.find((duplicateSet) => duplicateSet.id === setId);
    if (!targetSet) return;
    const decisions = { ...state.decisions };
    for (const member of targetSet.members) {
      decisions[member.asset.id] = 'keep';
    }
    set({ decisions, manualEdited: true, manualOverrideCount: state.manualOverrideCount + 1 });
  },

  ignoreSet: (setId) => {
    const state = get();
    const targetSet = state.sets.find((duplicateSet) => duplicateSet.id === setId);
    if (!targetSet) return;
    const sets = state.sets.filter((duplicateSet) => duplicateSet.id !== setId);
    set({
      ignoredSignatures: [...state.ignoredSignatures, setSignature(targetSet)],
      ignoredSets: [...state.ignoredSets, targetSet],
      sets,
      activeSetId: _resolveActiveSet(sets, state.activeSetId),
    });
  },

  restoreIgnored: (signature) =>
    set((state) => {
      const restored = state.ignoredSets.find((duplicateSet) => setSignature(duplicateSet) === signature);
      if (!restored) return state;
      const decisions = { ...state.decisions };
      _assignSetDecisions(decisions, restored, _keptIdForRule(restored, state.keepRule));
      return {
        ignoredSignatures: state.ignoredSignatures.filter((existing) => existing !== signature),
        ignoredSets: state.ignoredSets.filter((duplicateSet) => setSignature(duplicateSet) !== signature),
        sets: [...state.sets, restored],
        decisions,
      };
    }),

  applyRemoval: (removedAssetIds) => {
    const removed = new Set(removedAssetIds);
    const state = get();
    const decisions = { ...state.decisions };
    for (const id of removedAssetIds) delete decisions[id];

    const sets = _pruneSets(state.sets, (member) => !removed.has(member.asset.id));
    set({ sets, decisions, activeSetId: _resolveActiveSet(sets, state.activeSetId) });
  },

  setActiveSet: (activeSetId) => set({ activeSetId }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setSort: (sort) => set({ sort }),
}));
