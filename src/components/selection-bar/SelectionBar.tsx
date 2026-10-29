import {
  IconAlertTriangle,
  IconChecks,
  IconChevronDown,
  IconDots,
  IconHeart,
  IconHeartFilled,
  IconLayoutGrid,
  IconRestore,
  IconStar,
  IconTag,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef } from 'react';
import { useOptimisticValue } from '../../hooks/useOptimisticValue';
import { useNavigate } from 'react-router-dom';
import { RatingMode } from '../../common/ratingModeOptions';
import { AssetsService } from '../../db/api/services/assets.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { AssetInClient } from '../../db/models/AssetInClient';
import { isFavoriteRating } from '../../media/metadata/fields/favorite';
import { useAppStore } from '../../stores/appState';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatBytes } from '../../utils/numberFormatter';
import { useEditDateDialog } from '../edit-date/editDateDialogStore';
import { useEditLocationDialog } from '../edit-location/editLocationDialogStore';
import { useEditTagsDialog } from '../edit-tags/editTagsDialogStore';
import { StarRating } from '../lightbox/info/StarRating';
import { useMoveToFolderDialog } from '../move-to-folder/moveToFolderDialogStore';
import { SelectionMenuBody } from '../selection-actions/SelectionActionsMenu';
import { DROPDOWN_MENU_COMPONENTS } from '../ui/menuPrimitives';
import { useSelectionActions, useSelectionSharedRating } from '../selection-actions/useSelectionActions';
import { useSelectionShortcuts } from '../selection-actions/useSelectionShortcuts';
import { useTrashDialog } from '../trash/trashDialogStore';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import './selectionBar.css';

function mergeUniqueById(existing: AssetInClient[], incoming: AssetInClient[]): AssetInClient[] {
  const merged = new Map<string, AssetInClient>();
  for (const file of existing) {
    merged.set(file.id, file);
  }
  for (const file of incoming) {
    merged.set(file.id, file);
  }
  return Array.from(merged.values());
}

/** True while focus is in a field that should receive the keystroke itself. */
function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable)
  );
}

/**
 * The selection "basket" indicator (§5): a floating pill, bottom-centre of the
 * gallery, in one of three states.
 *  - **full**: photos on this page are selected — count, size and every action.
 *  - **amber**: a filter hides part of the basket — warn + "Deselect hidden",
 *    actions still apply to the whole basket.
 *  - **demoted**: nothing here is selected but the basket isn't empty — a quiet
 *    grey pill with only "Review selection" + ✕, so nothing is lost or acted on
 *    blind.
 * The count is always the whole basket (it survives navigation and filters); it
 * clears only on Esc, the pill's ✕, or app restart.
 */
export function SelectionBar() {
  const navigate = useNavigate();
  const selectedImages = useAppStore((state) => state.selectedImages);
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);
  const displayedElementsCount = useAppStore((state) => state.displayedElementsCount);
  const gallerySelectionScope = useAppStore((state) => state.gallerySelectionScope);
  const galleryContext = useAppStore((state) => state.galleryContext);
  const comparisonPair = useAppStore((state) => state.comparisonPair);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const isEditDateDialogOpen = useEditDateDialog((state) => state.open);
  const isEditLocationDialogOpen = useEditLocationDialog((state) => state.open);
  const isEditTagsDialogOpen = useEditTagsDialog((state) => state.open);
  const isMoveToFolderDialogOpen = useMoveToFolderDialog((state) => state.open);

  const actions = useSelectionActions();
  const sharedRating = useSelectionSharedRating();
  const [rating, setRating] = useOptimisticValue(sharedRating);

  const selectedIds = useMemo(() => selectedImages.map((image) => image.id), [selectedImages]);
  const { data: hasUnscannedMetadata } = useLiveQuery(
    () => AssetsService.hasUnscannedMetadataAssets(selectedIds),
    ['assets'],
    { extDependencies: [selectedIds] },
  );
  const canEditMetadata = selectedImages.length > 0 && hasUnscannedMetadata === false;
  const metadataPendingTitle = canEditMetadata
    ? undefined
    : 'Available after all selected photo details have been read';
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const effectiveSelectedIds = useMemo(() => {
    if (!gallerySelectionScope) {
      return [] as string[];
    }

    if (!gallerySelectionScope.assetIds) {
      return selectedIds;
    }

    return gallerySelectionScope.assetIds.filter((id) => selectedIdsSet.has(id));
  }, [gallerySelectionScope, selectedIds, selectedIdsSet]);

  const selectedIdsKey = useMemo(() => selectedIds.join(','), [selectedIds]);
  const scopeKey = useMemo(() => JSON.stringify(gallerySelectionScope ?? null), [gallerySelectionScope]);
  const effectiveIdsKey = useMemo(() => effectiveSelectedIds.join(','), [effectiveSelectedIds]);
  const countKey = `${scopeKey}|${selectedIdsKey}|${effectiveIdsKey}`;

  const { data: visibleSelectedCountData } = useLiveQuery(
    async () => {
      if (!gallerySelectionScope || selectedIds.length === 0) {
        return { key: countKey, count: 0 };
      }

      const sections = await AssetsService.getFileCountByMonth({
        searchQuery: gallerySelectionScope.searchQuery,
        assetIds: effectiveSelectedIds,
        dateField: gallerySelectionScope.dateField,
      });

      return { key: countKey, count: sections.reduce((acc, section) => acc + section.totalImages, 0) };
    },
    ['assets'],
    {
      extDependencies: [selectedIdsKey, scopeKey, effectiveIdsKey],
    },
  );

  const safeDisplayedElementsCount =
    typeof displayedElementsCount === 'number' && Number.isFinite(displayedElementsCount)
      ? Math.max(0, displayedElementsCount)
      : 0;

  const basketCount = selectedImages.length;

  // The visible count lags the basket by one database round-trip, so a plain
  // `basket - visible` would read the photos just picked as hidden and flash
  // the amber warning. Only trust a count computed for the current selection;
  // until it lands, keep the last hidden count we actually measured.
  const freshVisibleCount =
    visibleSelectedCountData?.key === countKey && Number.isFinite(visibleSelectedCountData.count)
      ? Math.max(0, visibleSelectedCountData.count)
      : null;

  const lastHiddenCountRef = useRef(0);
  if (freshVisibleCount !== null) {
    lastHiddenCountRef.current = Math.max(0, basketCount - freshVisibleCount);
  }

  const hiddenCount = Math.min(lastHiddenCountRef.current, basketCount);
  const visibleSelectedCount = freshVisibleCount ?? basketCount - hiddenCount;

  const anyEditDialogOpen =
    isEditDateDialogOpen || isEditLocationDialogOpen || isEditTagsDialogOpen || isMoveToFolderDialogOpen;

  // The pill is present whenever the basket isn't empty — it never vanishes as a
  // side effect of navigation, only tucking away behind an open edit modal.
  const present = basketCount > 0 && !anyEditDialogOpen && !comparisonPair;

  const pillState: 'full' | 'amber' | 'demoted' =
    visibleSelectedCount === 0 ? 'demoted' : hiddenCount > 0 ? 'amber' : 'full';

  const canSelectAllInScope = safeDisplayedElementsCount > visibleSelectedCount;
  const actionsEnabled = present && pillState !== 'demoted';

  useSelectionShortcuts(actions, actionsEnabled);

  // Esc clears the whole basket, in every pill state (including demoted) — but
  // never while typing in a field.
  useEffect(() => {
    if (!present) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (useAppStore.getState().comparisonPair) return;
      if (event.key === 'Escape' && !isEditableTarget(event.target)) {
        setSelectedImages([]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [present, setSelectedImages]);

  // Size is derived from the whole basket, so the pill's summary matches its
  // (global) count rather than only what's visible here.
  const basketBytes = useMemo(
    () => selectedImages.reduce((sum, image) => sum + (image.filesize ?? 0), 0),
    [selectedImages],
  );

  async function handleSelectAll() {
    if (!gallerySelectionScope || !canSelectAllInScope) {
      return;
    }

    const filesInScope = await AssetsService.getFiles({
      searchQuery: gallerySelectionScope.searchQuery,
      assetIds: gallerySelectionScope.assetIds,
      dateField: gallerySelectionScope.dateField,
    });

    setSelectedImages(mergeUniqueById(selectedImages, filesInScope));
  }

  // Drop the basket items that the current view/filter hides, keeping only what
  // is visible here.
  async function handleDeselectHidden() {
    if (!gallerySelectionScope) return;

    const filesInScope = await AssetsService.getFiles({
      searchQuery: gallerySelectionScope.searchQuery,
      assetIds: gallerySelectionScope.assetIds,
      dateField: gallerySelectionScope.dateField,
    });
    const visibleIds = new Set(filesInScope.map((file) => file.id));
    setSelectedImages(selectedImages.filter((image) => visibleIds.has(image.id)));
  }

  // A destructive action on a partly-hidden basket confirms by number and scope.
  const scopeNote = hiddenCount > 0 ? `${hiddenCount} of the ${basketCount} aren't visible here.` : undefined;

  function requestTrash() {
    void useTrashDialog.getState().request('trash', selectedImages, scopeNote);
  }
  function requestDeletePermanently() {
    void useTrashDialog.getState().request('delete', selectedImages, scopeNote);
  }

  // Mirrors `toggleFavorite`: only an all-favorite selection gets un-favorited.
  const allFavorite =
    basketCount > 0 && selectedImages.every((image) => isFavoriteRating(image.metadata.rating));
  const favoriteLabel = allFavorite ? 'Unfavorite' : 'Favorite';

  const sizeLabel = basketBytes > 0 ? formatBytes(basketBytes) : null;
  const selectAllLabel = `Select all ${safeDisplayedElementsCount.toLocaleString()}`;

  const actionButtons =
    galleryContext === 'trash' ? (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="selection-pill__action selection-pill__action--optional"
          onClick={actions.restore}
          title="Restore"
        >
          <IconRestore size={16} />
          <span className="selection-pill__action-label">Restore</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="selection-pill__action selection-pill__action--danger"
          onClick={requestDeletePermanently}
          title="Delete"
        >
          <IconTrash size={16} />
          <span className="selection-pill__action-label">Delete</span>
        </Button>
      </>
    ) : (
      <>
        {ratingMode === RatingMode.Favorites && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="selection-pill__action selection-pill__action--optional"
            onClick={actions.toggleFavorite}
            disabled={!canEditMetadata}
            title={metadataPendingTitle ?? favoriteLabel}
            aria-pressed={allFavorite}
          >
            {allFavorite ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
            <span className="selection-pill__action-label">{favoriteLabel}</span>
          </Button>
        )}

        {ratingMode === RatingMode.Stars && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="selection-pill__action selection-pill__action--optional"
                disabled={!canEditMetadata}
                title={metadataPendingTitle ?? 'Rate'}
              >
                <IconStar size={16} />
                <span className="selection-pill__action-label">Rate</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              className="selection-bar__rate-popover"
              style={{ zIndex: 1000 }}
            >
              <StarRating
                value={rating}
                onChange={(value) => {
                  setRating(value);
                  actions.rate(value);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="selection-pill__action selection-pill__action--optional"
          onClick={actions.editTags}
          disabled={!canEditMetadata}
          title={metadataPendingTitle ?? 'Tag'}
        >
          <IconTag size={16} />
          <span className="selection-pill__action-label">Tag</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="selection-pill__action selection-pill__action--danger"
          onClick={requestTrash}
          title="Trash"
        >
          <IconTrash size={16} />
          <span className="selection-pill__action-label">Trash</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="selection-pill__action selection-pill__more"
              title="More actions"
            >
              <IconDots size={16} />
              <span className="selection-pill__action-label">More</span>
              <IconChevronDown size={16} className="selection-pill__more-chevron" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="selection-menu" style={{ zIndex: 1000 }}>
            <SelectionMenuBody components={DROPDOWN_MENU_COMPONENTS} api={actions} count={basketCount} />
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );

  return (
    <div className="selection-bar" aria-hidden={!present}>
      <div
        className={`selection-pill selection-pill--${pillState} ${present ? 'selection-pill--visible' : ''}`}
        role="status"
      >
        {/* The badge repeats the count that the label already announces. */}
        <span className="selection-pill__num" aria-hidden>
          {basketCount.toLocaleString()}
        </span>

        <span className="selection-pill__label">
          {basketCount.toLocaleString()} selected
          {pillState === 'demoted' ? (
            <span className="text-muted-foreground font-medium"> · none on this page</span>
          ) : (
            sizeLabel && (
              <span className="text-muted-foreground font-medium selection-pill__sub--size">
                {' '}
                · {sizeLabel}
              </span>
            )
          )}
        </span>

        {pillState === 'full' && canSelectAllInScope && (
          <>
            <span className="selection-pill__divider" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="selection-pill__action selection-pill__action--link text-primary font-semibold"
              onClick={handleSelectAll}
              title={selectAllLabel}
              aria-label={selectAllLabel}
            >
              <IconChecks size={16} />
              <span className="selection-pill__action-label">{selectAllLabel}</span>
            </Button>
          </>
        )}

        {pillState === 'amber' && (
          <span
            className="selection-pill__hidden"
            title={`${hiddenCount} of the ${basketCount} selected photos are hidden by the current filters`}
          >
            <IconAlertTriangle size={14} />
            <span className="selection-pill__hidden-label">
              {hiddenCount} <span className="selection-pill__hidden-word">hidden</span>
            </span>
            <button
              type="button"
              className="selection-pill__hidden-remove"
              aria-label={`Remove the ${hiddenCount} hidden photos from the selection`}
              onClick={handleDeselectHidden}
            >
              <IconX size={11} />
            </button>
          </span>
        )}

        {pillState === 'demoted' ? (
          <>
            <span className="selection-pill__divider" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="selection-pill__action selection-pill__action--link text-primary font-semibold"
              onClick={() => navigate('/review-selection')}
              title="Review selection"
              aria-label="Review selection"
            >
              <IconLayoutGrid size={16} />
              <span className="selection-pill__action-label">Review selection</span>
            </Button>
          </>
        ) : (
          <>
            <span className="selection-pill__divider" aria-hidden />
            <div className="selection-pill__actions">{actionButtons}</div>
          </>
        )}

        <span className="selection-pill__divider" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="selection-pill__action selection-pill__discard"
          aria-label="Clear selection"
          onClick={() => setSelectedImages([])}
        >
          <IconX size={16} />
        </Button>
      </div>
    </div>
  );
}
