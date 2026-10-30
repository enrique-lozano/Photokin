import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { SidebarSortMenu, SidebarSortOption } from '@/components/secondary-navbar/SidebarSortMenu';
import '@/components/selection-bar/selectionBar.css';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirmationDialogStore';
import { SelectionCheck } from '@/components/ui/selection-check';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, toastOnError } from '@/components/ui/toast';
import { LightboxImageContext } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonRegion } from '@/db/models/PersonInfo';
import { breakUpSuggestedFaceGroup } from '@/media/faces/dismissedFaceClusters';
import { AppRoutes } from '@/router';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { shuffle } from '@/utils/array.utils';
import {
  IconArrowsSort,
  IconChecks,
  IconChevronDown,
  IconEyeOff,
  IconSparkles,
  IconTrash,
  IconUnlink,
  IconUserPlus,
  IconUserQuestion,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import {
  CSSProperties,
  MouseEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appState';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { AssignFacePopover } from './AssignFacePopover';
import { CleanUpFacesDialog } from './CleanUpFacesDialog';
import { discardFacesWithUndo } from './discardFaces';
import { FaceActionsBar, FindFacesButton } from './FaceActionsBar';
import {
  assignFaces,
  assignFacesWithUndo,
  breakUpFaceGroup,
  createPersonFromFaces,
  createPersonFromFacesWithUndo,
  discardFaces,
  hideFaces,
  hideFacesWithUndo,
} from './faceMutations';
import { GroupReviewModal } from './GroupReviewModal';
import { useAssignPersonOptions, useFaceAssignmentTags } from './peopleOptions';
import { usePeopleOutletContext } from './PeopleLayout';
import { useRangeSelection } from './rangeSelection';
import { UnsortedFacesGrid } from './UnsortedFacesGrid';

/** Group cards come in whole rows: two to start, more on request. */
const INITIAL_GROUP_ROWS = 2;
const GROUP_ROWS_STEP = 4;
/** Only used for the first render, before the grid has been measured. */
const FALLBACK_GROUP_COLUMNS = 4;

/** Face circles stacked on a group card. */
const PREVIEW_FACES_PER_CARD = 4;

/** Enough placeholder crops to fill the first viewport of the faces grid. */
const SKELETON_FACE_COUNT = 48;

type UnsortedFaceSort = 'detected' | 'largest' | 'smallest';

const UNSORTED_SORT_OPTIONS: SidebarSortOption<UnsortedFaceSort>[] = [
  { value: 'detected', label: 'As detected' },
  { value: 'largest', label: 'Largest' },
  { value: 'smallest', label: 'Smallest' },
];

/**
 * Floating selection pill for this page, portaled into the scroll layout so it
 * stays pinned while the faces scroll. Renders nothing while nothing is selected.
 */
function FacePageSelectionBar({
  count,
  label,
  selectAllLabel,
  onSelectAll,
  onClear,
  children,
}: {
  count: number;
  label: string;
  /** Hidden once everything is selected. */
  selectAllLabel: string | null;
  onSelectAll: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(anchorRef.current?.closest('.page-scroll-layout') ?? null);
  }, []);

  const pill =
    count === 0 ? null : (
      <div className="selection-bar face-selection-bar">
        <div className="selection-pill selection-pill--full selection-pill--visible" role="status">
          <span className="selection-pill__num" aria-hidden>
            {count.toLocaleString()}
          </span>
          <span className="selection-pill__label">{label}</span>
          {selectAllLabel && (
            <>
              <span className="selection-pill__divider" aria-hidden />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="selection-pill__action selection-pill__action--link text-primary font-semibold"
                onClick={onSelectAll}
              >
                <IconChecks size={16} />
                <span className="selection-pill__action-label">{selectAllLabel}</span>
              </Button>
            </>
          )}
          <span className="selection-pill__divider" aria-hidden />
          <div className="selection-pill__actions">{children}</div>
          <span className="selection-pill__divider" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="selection-pill__action selection-pill__discard"
            aria-label="Clear selection"
            onClick={onClear}
          >
            <IconX size={16} />
          </Button>
        </div>
      </div>
    );

  return (
    <>
      <span ref={anchorRef} hidden />
      {host && pill ? createPortal(pill, host) : null}
    </>
  );
}

function PillAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={danger ? 'selection-pill__action selection-pill__action--danger' : 'selection-pill__action'}
      onClick={onClick}
    >
      {icon}
      <span className="selection-pill__action-label">{label}</span>
    </Button>
  );
}

/** "Assign to…" in a pill: the assignment card for several faces (also creates a new person). */
function PillAssignAction({
  icon,
  label,
  faces,
  existingPeople,
  existingTags,
  onAssign,
  onCreate,
}: {
  icon: ReactNode;
  label: string;
  faces: PersonRegion[];
  existingPeople: ReturnType<typeof useAssignPersonOptions>;
  existingTags: ReturnType<typeof useFaceAssignmentTags>;
  onAssign: (tagId: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}) {
  return (
    <AssignFacePopover
      side="top"
      align="center"
      faces={faces}
      existingPeople={existingPeople}
      existingTags={existingTags}
      onAssignExisting={onAssign}
      onCreateNew={onCreate}
    >
      <Button type="button" variant="ghost" size="sm" className="selection-pill__action">
        {icon}
        <span className="selection-pill__action-label">{label}</span>
      </Button>
    </AssignFacePopover>
  );
}

type ClusterGroup = {
  id: string;
  regions: PersonRegion[];
};

/**
 * A suggested group of similar faces the matcher is confident belong together.
 * Click reviews it and the corner circle selects it; once any group is
 * selected a click toggles and Shift+click selects a range.
 */
function SuggestionCard({
  group,
  index,
  selected,
  selecting,
  onReview,
  onSelectClick,
}: {
  group: ClusterGroup;
  index: number;
  selected: boolean;
  selecting: boolean;
  onReview: () => void;
  onSelectClick: (groupId: string, shift: boolean) => void;
}) {
  // One face per photo first, so a burst of near-identical shots shows once.
  const previewRegions = useMemo(() => {
    const onePerPhoto = [...new Map(group.regions.map((region) => [region.assetId, region])).values()];
    return shuffle(onePerPhoto).slice(0, PREVIEW_FACES_PER_CARD);
  }, [group.regions]);

  function onCardClick(event: MouseEvent<HTMLButtonElement>) {
    if (selecting || event.shiftKey) onSelectClick(group.id, event.shiftKey);
    else onReview();
  }

  return (
    <div
      className={
        'suggestion-card-item' + (selecting ? ' is-selecting' : '') + (selected ? ' is-selected' : '')
      }
    >
      <button
        type="button"
        className={selected ? 'suggestion-card is-selected' : 'suggestion-card'}
        title={selecting ? undefined : `Review ${group.regions.length} faces`}
        aria-label={
          selecting
            ? `${selected ? 'Deselect' : 'Select'} group ${index + 1}`
            : `Review the ${group.regions.length} faces in group ${index + 1}`
        }
        aria-pressed={selecting ? selected : undefined}
        onClick={onCardClick}
      >
        <span className="suggestion-card__faces">
          {previewRegions.map((region, faceIndex) => {
            const centeredIndex = faceIndex - (previewRegions.length - 1) / 2;
            // 0 → 1 across the row; the CSS turns it into a position inside the
            // card, so the hovered fan-out scales with the column width.
            const spread = previewRegions.length > 1 ? faceIndex / (previewRegions.length - 1) : 0.5;
            return (
              <span
                key={region.id}
                className="suggestion-card__avatar-slot"
                style={
                  {
                    '--face-offset': `${centeredIndex * 16}px`,
                    '--face-spread': spread,
                    '--face-layer': faceIndex + 1,
                  } as CSSProperties
                }
              >
                <FaceThumbnail region={region} className="suggestion-card__avatar" />
              </span>
            );
          })}
          <span className="suggestion-card__badge">{group.regions.length}</span>
        </span>

        <span className="text-base font-semibold text-foreground">Group {index + 1}</span>
        <span className="text-xs text-muted-foreground">
          {group.regions.length} {group.regions.length === 1 ? 'face' : 'faces'} · Review
        </span>
      </button>
      <button
        type="button"
        className="suggestion-card__select"
        aria-label={`${selected ? 'Deselect' : 'Select'} group ${index + 1}`}
        aria-pressed={selected}
        onClick={(event) => onSelectClick(group.id, event.shiftKey)}
      >
        <SelectionCheck selected={selected} />
      </button>
    </div>
  );
}

/**
 * "Unknown faces": faces nobody has named yet. Groups of look-alikes come first,
 * largest first, since naming one names them all; faces that matched no group
 * follow below.
 */
export function UnidentifiedFaces() {
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const [reviewedGroup, setReviewedGroup] = useState<{
    label: string;
    regions: PersonRegion[];
  } | null>(null);
  const [visibleGroupRows, setVisibleGroupRows] = useState(INITIAL_GROUP_ROWS);
  const [unsortedSort, setUnsortedSort] = useState<UnsortedFaceSort>('detected');
  // Measured once: re-measuring on resize would make "Show more" reshuffle
  // which groups are visible while the user is looking at them.
  const [groupColumns, setGroupColumns] = useState<number | null>(null);
  const measureGroupGrid = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const tracks = getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length;
    setGroupColumns((current) => current ?? Math.max(1, tracks));
  }, []);
  // Only a query dependency: faces in hidden albums come and go with it.
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);

  const { data: regions, loading } = useLiveQuery(
    () => RegionsService.getUnknownRegions(),
    ['tagRegionInfo', 'tags', 'assets'],
    { extDependencies: [showHiddenItems] },
  );
  const { people } = usePeopleOutletContext();
  useEffect(() => {
    setBreadcrumb([{ label: 'People', to: AppRoutes.allFaces }, { label: 'Unknown faces' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  usePageChrome('faces', useCountStatus(regions?.length, 'face', 'faces'));

  const allRegions = useMemo(() => regions ?? [], [regions]);

  const existingPeople = useAssignPersonOptions(people);
  const existingTags = useFaceAssignmentTags();

  const clusterGroups = useMemo<ClusterGroup[]>(() => {
    const byCluster = new Map<string, PersonRegion[]>();
    for (const region of allRegions) {
      if (!region.clusterId) continue;
      const list = byCluster.get(region.clusterId) ?? [];
      list.push(region);
      byCluster.set(region.clusterId, list);
    }
    return [...byCluster.entries()]
      .map(([id, groupRegions]) => ({ id, regions: groupRegions }))
      .sort((a, b) => b.regions.length - a.regions.length);
  }, [allRegions]);

  const columns = groupColumns ?? FALLBACK_GROUP_COLUMNS;
  const groupsStep = columns * GROUP_ROWS_STEP;
  const visibleGroups = clusterGroups.slice(0, columns * visibleGroupRows);
  const remainingGroupCount = clusterGroups.length - visibleGroups.length;
  const unsortedRegions = useMemo(() => allRegions.filter((region) => !region.clusterId), [allRegions]);
  const sortedUnsortedRegions = useMemo(() => {
    if (unsortedSort === 'detected') return unsortedRegions;
    return [...unsortedRegions].sort((left, right) => {
      const delta = right.area.w * right.area.h - left.area.w * left.area.h;
      return unsortedSort === 'largest' ? delta : -delta;
    });
  }, [unsortedRegions, unsortedSort]);

  const [cleanUpOpen, setCleanUpOpen] = useState(false);
  const { openLightbox } = useContext(LightboxImageContext);

  // Groups and faces are selected separately: starting one clears the other.
  const groupIds = useMemo(() => clusterGroups.map((group) => group.id), [clusterGroups]);
  const unsortedIds = useMemo(
    () => sortedUnsortedRegions.map((region) => region.id),
    [sortedUnsortedRegions],
  );
  const groupSelection = useRangeSelection(groupIds);
  const faceSelection = useRangeSelection(unsortedIds);
  const { clear: clearGroupSelection, click: clickGroup } = groupSelection;
  const { clear: clearFaceSelection, click: clickFace } = faceSelection;
  const selectedGroupIds = groupSelection.selectedIds;
  const selectedFaceIds = faceSelection.selectedIds;
  const hasSelection = selectedGroupIds.size > 0 || selectedFaceIds.size > 0;

  const onGroupSelectClick = useCallback(
    (groupId: string, shift: boolean) => {
      clearFaceSelection();
      clickGroup(groupId, shift);
    },
    [clearFaceSelection, clickGroup],
  );
  const onFaceSelectClick = useCallback(
    (regionId: string, shift: boolean) => {
      clearGroupSelection();
      clickFace(regionId, shift);
    },
    [clearGroupSelection, clickFace],
  );
  const exitSelection = useCallback(() => {
    clearGroupSelection();
    clearFaceSelection();
  }, [clearGroupSelection, clearFaceSelection]);

  useEffect(() => {
    if (!hasSelection) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[data-assign-card], [role="dialog"], [role="alertdialog"]'))
      ) {
        return;
      }
      exitSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelection, exitSelection]);

  const selectedGroups = useMemo(
    () => clusterGroups.filter((group) => selectedGroupIds.has(group.id)),
    [clusterGroups, selectedGroupIds],
  );
  const selectedGroupRegions = useMemo(
    () => selectedGroups.flatMap((group) => group.regions),
    [selectedGroups],
  );
  const selectedFaces = useMemo(
    () => sortedUnsortedRegions.filter((region) => selectedFaceIds.has(region.id)),
    [sortedUnsortedRegions, selectedFaceIds],
  );
  const selectedFacePhotoCount = useMemo(
    () => new Set(selectedFaces.map((region) => region.assetId)).size,
    [selectedFaces],
  );

  // Next/previous in the viewer walk the photos of the unsorted faces, in grid order.
  const unsortedAssetIds = useMemo(
    () => [...new Set(sortedUnsortedRegions.map((region) => region.assetId))],
    [sortedUnsortedRegions],
  );
  const openFacePhoto = useCallback(
    (region: PersonRegion) =>
      void toastOnError(
        AssetsService.getByUUID(region.assetId).then((asset) =>
          openLightbox(asset, null, { assetIds: unsortedAssetIds }),
        ),
      ),
    [openLightbox, unsortedAssetIds],
  );

  // Stable identities: the faces grid memoizes its cells, and a fresh callback
  // per render would re-render every mounted face on any page update.
  const assignRegions = useCallback(
    (regionIds: string[], tagId: string) => toastOnError(assignFacesWithUndo(regionIds, tagId)),
    [],
  );
  const createPerson = useCallback(
    (regionIds: string[], name: string) => toastOnError(createPersonFromFacesWithUndo(regionIds, name)),
    [],
  );
  const discardRegions = useCallback((regionIds: string[]) => void discardFacesWithUndo(regionIds), []);
  const assignFace = useCallback(
    (regionId: string, tagId: string) => assignRegions([regionId], tagId),
    [assignRegions],
  );
  const createPersonFromFace = useCallback(
    (regionId: string, name: string) => createPerson([regionId], name),
    [createPerson],
  );
  const discardFace = useCallback((regionId: string) => discardRegions([regionId]), [discardRegions]);
  const hideFace = useCallback((regionId: string) => void hideFacesWithUndo([regionId]), []);

  const assignSelected = useCallback(
    async (tagId: string) => {
      try {
        await assignFacesWithUndo([...selectedFaceIds], tagId);
        clearFaceSelection();
      } catch (error) {
        toast.error(String(error));
      }
    },
    [clearFaceSelection, selectedFaceIds],
  );
  const createFromSelected = useCallback(
    async (name: string) => {
      try {
        await createPersonFromFacesWithUndo([...selectedFaceIds], name);
        clearFaceSelection();
      } catch (error) {
        toast.error(String(error));
      }
    },
    [clearFaceSelection, selectedFaceIds],
  );
  const ignoreSelected = useCallback(async () => {
    const ids = [...selectedFaceIds];
    const faces = `${ids.length.toLocaleString()} ${ids.length === 1 ? 'face' : 'faces'}`;
    const confirmed = await confirm({
      icon: <IconEyeOff size={24} />,
      title: `Ignore ${faces}?`,
      description:
        'They stop showing up for review without being named. Your photos are unchanged — ignored faces wait in "Ignored faces" under People, where you can bring them back.',
      confirmLabel: `Ignore ${faces}`,
    });
    if (!confirmed) return;
    await hideFacesWithUndo(ids);
    clearFaceSelection();
  }, [clearFaceSelection, selectedFaceIds]);
  const discardSelected = useCallback(async () => {
    const ids = [...selectedFaceIds];
    const faces = `${ids.length.toLocaleString()} ${ids.length === 1 ? 'face' : 'faces'}`;
    const confirmed = await confirm({
      icon: <IconTrash size={24} />,
      title: `Mark ${faces} as no face?`,
      description:
        'Only for boxes the detector got wrong — a pattern, an object, part of a background. They leave Unknown faces, and future runs will not detect these boxes again.',
      confirmLabel: `Mark ${faces} as no face`,
      tone: 'destructive',
    });
    if (!confirmed) return;
    await discardFacesWithUndo(ids);
    clearFaceSelection();
  }, [clearFaceSelection, selectedFaceIds]);

  const groupRegionIds = () => selectedGroupRegions.map((region) => region.id);
  const groupsLabel = `${selectedGroups.length.toLocaleString()} ${selectedGroups.length === 1 ? 'group' : 'groups'}`;
  const groupFacesLabel = `${selectedGroupRegions.length.toLocaleString()} ${selectedGroupRegions.length === 1 ? 'face' : 'faces'}`;

  async function assignSelectedGroups(tagId: string) {
    try {
      await assignFacesWithUndo(groupRegionIds(), tagId);
      clearGroupSelection();
    } catch (error) {
      toast.error(String(error));
    }
  }
  async function createFromSelectedGroups(name: string) {
    try {
      await createPersonFromFacesWithUndo(groupRegionIds(), name);
      clearGroupSelection();
    } catch (error) {
      toast.error(String(error));
    }
  }
  async function breakUpSelectedGroups() {
    const groups = selectedGroups.map((group) => group.regions.map((region) => region.id));
    const confirmed = await confirm({
      icon: <IconUnlink size={24} />,
      title: `Break up ${groupsLabel}?`,
      description: `The ${groupFacesLabel} stop being treated as the same person and go back to Unsorted faces on their own. Nothing is named or deleted, and these groups won’t be suggested again.`,
      confirmLabel: `Break up ${groupsLabel}`,
    });
    if (!confirmed) return;
    await toastOnError(
      (async () => {
        for (const regionIds of groups) await breakUpSuggestedFaceGroup(regionIds);
      })(),
    );
    clearGroupSelection();
  }
  async function ignoreSelectedGroups() {
    const ids = groupRegionIds();
    const confirmed = await confirm({
      icon: <IconEyeOff size={24} />,
      title: `Ignore ${groupFacesLabel}?`,
      description:
        'They stop showing up for review without being named. Your photos are unchanged — ignored faces wait in "Ignored faces" under People, where you can bring them back.',
      confirmLabel: `Ignore ${groupFacesLabel}`,
    });
    if (!confirmed) return;
    await hideFacesWithUndo(ids);
    clearGroupSelection();
  }
  async function discardSelectedGroups() {
    const ids = groupRegionIds();
    const confirmed = await confirm({
      icon: <IconTrash size={24} />,
      title: `Mark ${groupFacesLabel} as no face?`,
      description:
        'Only for boxes the detector got wrong — a pattern, an object, part of a background. They leave Unknown faces, and future runs will not detect these boxes again.',
      confirmLabel: `Mark ${groupFacesLabel} as no face`,
      tone: 'destructive',
    });
    if (!confirmed) return;
    await discardFacesWithUndo(ids);
    clearGroupSelection();
  }

  const content = loading ? (
    <div className="overview-body">
      <section className="overview-section">
        <div className="person-faces-grid" aria-hidden>
          {Array.from({ length: SKELETON_FACE_COUNT }, (_, index) => (
            <Skeleton key={index} className="person-face-skeleton" />
          ))}
        </div>
      </section>
    </div>
  ) : allRegions.length === 0 ? (
    <EmptyState
      icon={IconUserQuestion}
      title="No unknown faces"
      description="Every face found so far has a name, a suggestion or was ignored. Find faces again to look for more."
      action={<FindFacesButton />}
    />
  ) : (
    <div className="overview-body">
      {clusterGroups.length > 0 && (
        <section className="overview-section">
          <div className="overview-section__header">
            <div className="overview-section__heading">
              <h3 className="overview-section__title">
                <IconUsersGroup size={20} className="overview-section__title-icon" />
                Groups
                <span className="overview-section__count">{clusterGroups.length.toLocaleString()}</span>
              </h3>
              <span className="text-sm text-muted-foreground">
                Faces that look like the same person, largest first — name a group to name all its faces
              </span>
            </div>
          </div>
          <div className="suggestion-grid" ref={measureGroupGrid}>
            {visibleGroups.map((group, index) => (
              <SuggestionCard
                key={group.id}
                group={group}
                index={index}
                selected={selectedGroupIds.has(group.id)}
                selecting={selectedGroupIds.size > 0}
                onReview={() =>
                  setReviewedGroup({ label: `Group ${index + 1}`, regions: [...group.regions] })
                }
                onSelectClick={onGroupSelectClick}
              />
            ))}
          </div>
          {remainingGroupCount > 0 && (
            <div className="unknown-faces__more">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleGroupRows((rows) => rows + GROUP_ROWS_STEP)}
              >
                <IconChevronDown size={16} />
                Show {Math.min(groupsStep, remainingGroupCount).toLocaleString()} more
              </Button>
              <span className="unknown-faces__more-count">
                {visibleGroups.length.toLocaleString()} of {clusterGroups.length.toLocaleString()} groups
              </span>
            </div>
          )}
          <FacePageSelectionBar
            count={selectedGroups.length}
            label={`${groupsLabel} selected · ${groupFacesLabel}`}
            selectAllLabel={
              selectedGroups.length < clusterGroups.length
                ? `Select all ${clusterGroups.length.toLocaleString()}`
                : null
            }
            onSelectAll={groupSelection.selectAll}
            onClear={clearGroupSelection}
          >
            <PillAssignAction
              icon={<IconUserPlus size={16} />}
              label="Assign to…"
              faces={selectedGroupRegions}
              existingPeople={existingPeople}
              existingTags={existingTags}
              onAssign={assignSelectedGroups}
              onCreate={createFromSelectedGroups}
            />
            <PillAction
              icon={<IconUnlink size={16} />}
              label="Break up"
              onClick={() => void breakUpSelectedGroups()}
            />
            <PillAction
              icon={<IconEyeOff size={16} />}
              label="Ignore"
              onClick={() => void ignoreSelectedGroups()}
            />
            <PillAction
              icon={<IconTrash size={16} />}
              label="Not faces"
              danger
              onClick={() => void discardSelectedGroups()}
            />
          </FacePageSelectionBar>
        </section>
      )}

      {unsortedRegions.length > 0 && (
        <section className="overview-section">
          <div className="overview-section__header">
            <div className="overview-section__heading">
              <h3 className="overview-section__title">
                Unsorted faces
                <span className="overview-section__count">{unsortedRegions.length.toLocaleString()}</span>
              </h3>
              <span className="text-sm text-muted-foreground">
                {selectedFaceIds.size > 0
                  ? 'Click faces to add or remove them, Shift+click to select a range. Esc clears the selection.'
                  : 'Faces in no group yet. Click a face to name it, or its circle to select several.'}
              </span>
            </div>
            <div className="overview-section__tools">
              {unsortedRegions.length > 1 && (
                <SidebarSortMenu
                  value={unsortedSort}
                  options={UNSORTED_SORT_OPTIONS}
                  onChange={setUnsortedSort}
                  trigger={
                    <Button
                      type="button"
                      size="icon"
                      variant={unsortedSort === 'detected' ? 'outline' : 'primary-light'}
                      aria-label="Sort faces"
                      title={`Sort: ${UNSORTED_SORT_OPTIONS.find((option) => option.value === unsortedSort)?.label}`}
                    >
                      <IconArrowsSort size={18} />
                    </Button>
                  }
                />
              )}
              <Button type="button" variant="outline" onClick={() => setCleanUpOpen(true)}>
                <IconSparkles size={16} />
                Clean up…
              </Button>
            </div>
          </div>
          <UnsortedFacesGrid
            regions={sortedUnsortedRegions}
            existingPeople={existingPeople}
            existingTags={existingTags}
            selectedIds={selectedFaceIds}
            onSelectClick={onFaceSelectClick}
            onAssign={assignFace}
            onCreate={createPersonFromFace}
            onHide={hideFace}
            onDiscard={discardFace}
            onOpenPhoto={openFacePhoto}
          />
          <FacePageSelectionBar
            count={selectedFaces.length}
            label={`${selectedFaces.length.toLocaleString()} ${selectedFaces.length === 1 ? 'face' : 'faces'} selected · in ${selectedFacePhotoCount.toLocaleString()} ${selectedFacePhotoCount === 1 ? 'photo' : 'photos'}`}
            selectAllLabel={
              selectedFaces.length < unsortedRegions.length
                ? `Select all ${unsortedRegions.length.toLocaleString()}`
                : null
            }
            onSelectAll={faceSelection.selectAll}
            onClear={clearFaceSelection}
          >
            <PillAssignAction
              icon={<IconUserPlus size={16} />}
              label="Assign to…"
              faces={selectedFaces}
              existingPeople={existingPeople}
              existingTags={existingTags}
              onAssign={assignSelected}
              onCreate={createFromSelected}
            />
            <PillAction icon={<IconEyeOff size={16} />} label="Hide" onClick={() => void ignoreSelected()} />
            <PillAction
              icon={<IconTrash size={16} />}
              label="Not faces"
              danger
              onClick={() => void discardSelected()}
            />
          </FacePageSelectionBar>
          <CleanUpFacesDialog open={cleanUpOpen} onOpenChange={setCleanUpOpen} regions={unsortedRegions} />
        </section>
      )}

      <GroupReviewModal
        open={reviewedGroup !== null}
        onOpenChange={(open) => !open && setReviewedGroup(null)}
        groupLabel={reviewedGroup?.label ?? ''}
        regions={reviewedGroup?.regions ?? []}
        existingPeople={existingPeople}
        existingTags={existingTags}
        onAssignExisting={assignFaces}
        onCreateNew={createPersonFromFaces}
        onBreakUp={breakUpFaceGroup}
        onHide={hideFaces}
        onDiscard={discardFaces}
      />
    </div>
  );

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconUserQuestion size={28} />} />}
      title="Unknown faces"
      subtitle={
        loading
          ? 'Loading faces…'
          : `${allRegions.length.toLocaleString()} unknown ${allRegions.length === 1 ? 'face' : 'faces'} · ${clusterGroups.length.toLocaleString()} ${
              clusterGroups.length === 1 ? 'group' : 'groups'
            }`
      }
      actions={
        <>
          <FaceActionsBar />
        </>
      }
      content={content}
    />
  );
}
