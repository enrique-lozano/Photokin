import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchCondition, SearchQuery } from '../../common/fileSearchFilters';
import { AssetsService } from '../../db/api/services/assets.service';
import { RegionsService } from '../../db/api/services/regions.service';
import { TagsService } from '../../db/api/services/tags.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { useSettingsStore } from '../../stores/settingsStore';
import { useHiddenItemsStore } from '../../stores/hiddenItemsStore';
import {
  buildChipCandidates,
  ChipCandidate,
  ContentFilterChip,
  MAX_PEOPLE_CANDIDATES,
  MAX_PLACE_CANDIDATES,
} from './contentFilterChips';

interface UseContentFilterChipsParams {
  /** Base query the chips refine (used to scope candidate counts). */
  searchQuery?: SearchQuery;
  /** Restrict candidates to a set of assets (people/tag detail pages). */
  assetIds?: string[];
  /** Active chips reset whenever this value changes (page/item navigation). */
  resetKey?: string;
}

interface UseContentFilterChipsResult {
  chips: ContentFilterChip[];
  activeChipIds: string[];
  toggleChip: (chip: ContentFilterChip) => void;
  clear: () => void;
  /** Conditions to merge into the gallery query for the active chips. */
  conditions: SearchCondition[];
  /** True until the chips for the current scope have been computed. */
  isLoading: boolean;
  /**
   * True while already-shown chips are being recomputed (selection change or
   * data invalidation). Their counts and conditions may be stale, so the row
   * should not accept toggles until it settles.
   */
  isRefreshing: boolean;
}

/** Maximum number of chips surfaced in the sub-header at once. */
const MAX_CHIPS = 5;

/**
 * A suggestion must exclude at least this share of its comparison scope to earn
 * a slot. Chips that keep almost everything (e.g. "Photos · 179" of 180) narrow
 * nothing meaningful, so they're dropped rather than shown.
 */
const MIN_EXCLUDED_RATIO = 0.1;

interface ChipsSnapshot {
  /** Scope generation; stale async results from a previous scope are ignored. */
  epoch: number;
  chips: ContentFilterChip[];
  /** The selection these chips were computed for. */
  activeChips: ContentFilterChip[];
}

/** Shared so a stale scope keeps handing the row the *same* empty array. */
const NO_CHIPS: ContentFilterChip[] = [];

/** Stable key for the chip *scope* (not selection state). */
function _scopeKey(
  searchQuery: SearchQuery | undefined,
  assetIds: string[] | undefined,
  resetKey: string | undefined,
): string {
  return `${resetKey ?? ''}\0${JSON.stringify(searchQuery)}\0${assetIds?.join(',') ?? ''}`;
}

/** A stable signature of a chip's conditions, used to drop duplicates. */
function _conditionsSignature(conditions: SearchCondition[]): string {
  return JSON.stringify(
    conditions.map((condition) => ({
      type: condition.type ?? null,
      filters: condition.filters.map((filter) => ({
        c: filter.filterCriteria,
        o: filter.operator,
        v:
          filter.value instanceof Date
            ? filter.value.toISOString()
            : Array.isArray(filter.value)
              ? filter.value.map((item) => (item as { id?: string }).id ?? item)
              : filter.value,
      })),
    })),
  );
}

/** Drops the scoring-only `weight`, leaving the chip the UI renders. */
function _toChip(candidate: ChipCandidate): ContentFilterChip {
  const { id, label, count, group, conditions, icon, faceRegion } = candidate;
  return { id, label, count, group, conditions, icon, faceRegion };
}

/**
 * Generates the intelligent quick-filter chips shown in the content sub-header
 * and tracks which are active. Active state is ephemeral: it resets when
 * `resetKey` changes (i.e. when navigating to another item).
 *
 * Candidates span time, quality, media, people and place dimensions. Each is
 * scored by its result count, gently boosted by how semantically meaningful it
 * is, and any candidate that excludes too little of the scope or everything is
 * dropped.
 */
export function useContentFilterChips({
  searchQuery,
  assetIds,
  resetKey,
}: UseContentFilterChipsParams): UseContentFilterChipsResult {
  // Selected chips are stored as full objects (not just ids) so the live query
  // can read their conditions and re-count the *other* chips within the active
  // scope without depending on its own output (which would loop).
  const [activeChips, setActiveChips] = useState<ContentFilterChip[]>([]);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const countUnverifiedFaces = useSettingsStore((state) => state.countUnverifiedFaces);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);

  useEffect(() => {
    setActiveChips([]);
  }, [resetKey]);

  const scopeKey = useMemo(
    () => _scopeKey(searchQuery, assetIds, resetKey),
    [searchQuery, assetIds, resetKey],
  );
  const scopeEpochRef = useRef(0);
  const prevScopeKeyRef = useRef(scopeKey);
  if (prevScopeKeyRef.current !== scopeKey) {
    prevScopeKeyRef.current = scopeKey;
    scopeEpochRef.current += 1;
  }

  const [pendingQueries, setPendingQueries] = useState(0);

  const computeSnapshot = async (): Promise<ChipsSnapshot> => {
    const epoch = scopeEpochRef.current;
    const baseCount = await AssetsService.getCount({ searchQuery, assetIds });
    if (baseCount <= 1) return { epoch, chips: [], activeChips };

    const [years, topPeople, places, allTags] = await Promise.all([
      AssetsService.getFileCountByYear({ searchQuery, assetIds }),
      AssetsService.getTopPeopleInScope({ searchQuery, assetIds, limit: MAX_PEOPLE_CANDIDATES }),
      AssetsService.getTopPlacesInScope({ searchQuery, assetIds, limit: MAX_PLACE_CANDIDATES }),
      TagsService.getAll(),
    ]);

    const faceByTagId = await RegionsService.getRepresentativeRegionsByTag(
      topPeople.map((entry) => entry.tagId),
    );
    const tagNameById = new Map(allTags.map((tag) => [tag.id, tag.name]));
    const people = topPeople.map((entry) => ({
      tagId: entry.tagId,
      name: tagNameById.get(entry.tagId) ?? 'Unknown',
      totalImages: entry.totalImages,
      faceRegion: faceByTagId.get(entry.tagId),
    }));

    const { precounted, toCount } = buildChipCandidates({ years, people, places, ratingMode });
    const allCandidates: ChipCandidate[] = [...precounted, ...toCount];

    const hasActiveSelection = activeChips.length > 0;

    // Conditions contributed by the active chips of every group *except* the
    // given one. Counting a candidate within this scope means:
    //  • a chip in a fresh group is counted as it would combine (AND) with the
    //    current selection — so it drops out when nothing remains;
    //  • a chip that shares a group with an active chip is counted as if it
    //    replaced that selection (groups are mutually exclusive).
    const contextConditionsFor = (group: string): SearchCondition[] =>
      activeChips.filter((chip) => chip.group !== group).flatMap((chip) => chip.conditions);

    // Everything still to count, as conditions within the base scope, so it
    // all runs as one query:
    //  • per group, the scope its chips are compared against to decide whether
    //    they still narrow anything (only needed with a selection; otherwise
    //    that's the base scope);
    //  • each candidate without a usable count. Fast path: with no selection
    //    the histogram-provided counts already match, so year/person/place
    //    chips are skipped;
    //  • the active chips, whose counts are pinned to the front even if they
    //    no longer rank as candidates.
    const groups = Array.from(new Set(allCandidates.map((candidate) => candidate.group)));
    const pendingCounts: Record<string, SearchCondition[]> = {};
    if (hasActiveSelection) {
      for (const group of groups) pendingCounts[`group:${group}`] = contextConditionsFor(group);
    }
    for (const candidate of allCandidates) {
      if (!hasActiveSelection && candidate.count !== undefined) continue;
      pendingCounts[`chip:${candidate.id}`] = [
        ...contextConditionsFor(candidate.group),
        ...candidate.conditions,
      ];
    }
    for (const active of activeChips) {
      pendingCounts[`chip:${active.id}`] ??= [...contextConditionsFor(active.group), ...active.conditions];
    }
    const counts = await AssetsService.getCountsWithin({ searchQuery, assetIds }, pendingCounts);

    const contextCountFor = (group: string): number =>
      hasActiveSelection ? (counts[`group:${group}`] ?? 0) : baseCount;
    const counted = allCandidates.map((candidate) =>
      `chip:${candidate.id}` in counts ? { ...candidate, count: counts[`chip:${candidate.id}`] } : candidate,
    );

    // Selected chips are pinned to the front (in selection order) with freshly
    // recomputed counts so the user can always see and clear them.
    const activeOutput: ContentFilterChip[] = activeChips.map((active) => ({
      ...active,
      count: counts[`chip:${active.id}`] ?? 0,
    }));

    const activeIds = new Set(activeChips.map((chip) => chip.id));
    const seen = new Set<string>(activeChips.map((chip) => _conditionsSignature(chip.conditions)));
    const inactiveOutput = counted
      .filter((candidate) => !activeIds.has(candidate.id))
      // Keep only chips that narrow their comparison scope *meaningfully*:
      // non-empty, and excluding at least `MIN_EXCLUDED_RATIO` of it. This
      // drops empty chips on selection and hides near-no-op ones like "Photos"
      // in an all-photo library.
      .filter((candidate) => {
        const count = candidate.count ?? 0;
        const contextCount = contextCountFor(candidate.group);
        return count > 0 && count <= contextCount * (1 - MIN_EXCLUDED_RATIO);
      })
      .filter((candidate) => {
        const signature = _conditionsSignature(candidate.conditions);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .sort((a, b) => {
        const score = (chip: ChipCandidate) => (chip.count ?? 0) + chip.weight * baseCount * 0.15;
        return score(b) - score(a);
      })
      .map(_toChip);

    const maxInactive = Math.max(0, MAX_CHIPS - activeOutput.length);
    return {
      epoch,
      chips: [...activeOutput, ...inactiveOutput.slice(0, maxInactive)],
      activeChips,
    };
  };

  const { data: snapshot } = useLiveQuery<ChipsSnapshot>(
    async () => {
      setPendingQueries((count) => count + 1);
      try {
        return await computeSnapshot();
      } finally {
        setPendingQueries((count) => count - 1);
      }
    },
    ['assets', 'tags', 'fileTags', 'tagRegionInfo'],
    {
      extDependencies: [
        searchQuery,
        assetIds,
        activeChips,
        ratingMode,
        countUnverifiedFaces,
        showHiddenItems,
      ],
    },
  );

  const isLoading = snapshot?.epoch !== scopeEpochRef.current;
  const resolvedChips = isLoading ? NO_CHIPS : snapshot.chips;
  // The selection check covers the render between a toggle and its recount
  // starting, when no query is pending yet.
  const isRefreshing = !isLoading && (pendingQueries > 0 || snapshot.activeChips !== activeChips);

  const toggleChip = (chip: ContentFilterChip): void => {
    setActiveChips((prev) => {
      if (prev.some((active) => active.id === chip.id)) {
        return prev.filter((active) => active.id !== chip.id);
      }
      // Enforce single-selection within a group.
      return [...prev.filter((active) => active.group !== chip.group), chip];
    });
  };

  const activeChipIds = useMemo(() => activeChips.map((chip) => chip.id), [activeChips]);

  const conditions = useMemo<SearchCondition[]>(
    () => activeChips.flatMap((chip) => chip.conditions),
    [activeChips],
  );

  return {
    chips: resolvedChips,
    activeChipIds,
    toggleChip,
    clear: () => setActiveChips([]),
    conditions,
    isLoading,
    isRefreshing,
  };
}
