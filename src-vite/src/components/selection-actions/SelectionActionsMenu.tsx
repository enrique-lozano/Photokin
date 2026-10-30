import { isFavoriteRating } from '@/media/metadata/fields/favorite';
import { externalAppName } from '@/system/externalApp';
import { openEditorWindow } from '@/utils/openEditorWindow';
import {
  IconCalendarEvent,
  IconCopy,
  IconColumns2,
  IconDeviceFloppy,
  IconExternalLink,
  IconFaceId,
  IconFolder,
  IconHeart,
  IconHeartFilled,
  IconMapPin,
  IconPencil,
  IconPhotoEdit,
  IconRefresh,
  IconRestore,
  IconRotate,
  IconRotateClockwise,
  IconScan,
  IconStar,
  IconTag,
  IconTagMinus,
  IconTagOff,
  IconTrash,
  IconUserMinus,
  IconUserOff,
  IconUserSearch,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type ReactNode, useMemo } from 'react';
import { RatingMode } from '../../common/ratingModeOptions';
import { isSupportedVideoPath } from '../../common/supportedFormats';
import { AssetsService } from '../../db/api/services/assets.service';
import { RegionsService } from '../../db/api/services/regions.service';
import { TagsService } from '../../db/api/services/tags.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { AssetInClient } from '../../db/models/AssetInClient';
import { useOptimisticValue } from '../../hooks/useOptimisticValue';
import { useAppStore } from '../../stores/appState';
import { useSettingsStore } from '../../stores/settingsStore';
import { StarRating } from '../lightbox/info/StarRating';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../ui/context-menu';
import { Kbd, KbdGroup } from '../ui/kbd';
import { CONTEXT_MENU_COMPONENTS, type MenuPrimitives } from '../ui/menuPrimitives';
import { type GalleryScope, useGalleryScope } from './galleryScope';
import { removeFromScope } from './scopeActions';
import './selectionActionsMenu.css';
import { scopeMatchCount, selectionMenuItems, type SelectionMenuItems } from './selectionMenuItems';
import {
  type RotateDirection,
  SelectionActionsApi,
  useSelectionActions,
  useSelectionSharedRating,
} from './useSelectionActions';
import { canComparePhotos } from '../compare/comparisonViewport';

function Icon({ glyph: Glyph }: { glyph: TablerIcon }) {
  return <Glyph className="selection-menu__icon" size={16} />;
}

function MenuShortcut({ keys }: { keys: string[] }) {
  return (
    <KbdGroup className="ml-auto pl-2">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

function RateRow({
  value,
  onRate,
  disabled,
}: {
  value: number;
  onRate: (value: number) => void;
  disabled?: boolean;
}) {
  const [rating, setRating] = useOptimisticValue(value);

  return (
    <div
      className="selection-menu__row"
      role="group"
      aria-label="Rate"
      title={disabled ? 'Available after all selected photo details have been read' : undefined}
    >
      <span className="selection-menu__row-label">
        <Icon glyph={IconStar} />
        Rate
      </span>
      <StarRating
        value={rating}
        size={18}
        onChange={
          disabled
            ? undefined
            : (next) => {
                setRating(next);
                onRate(next);
              }
        }
      />
    </div>
  );
}

function RotateSubmenu({
  components,
  onRotate,
  disabled,
}: {
  components: MenuPrimitives;
  onRotate: (direction: RotateDirection) => void;
  disabled?: boolean;
}) {
  const { Item, Sub, SubTrigger, SubContent } = components;
  return (
    <Sub>
      <SubTrigger
        className="selection-menu__item"
        disabled={disabled}
        title={disabled ? 'Available after all selected photo details have been read' : undefined}
      >
        <Icon glyph={IconRotateClockwise} />
        Rotate
      </SubTrigger>
      <SubContent>
        <Item className="selection-menu__item" onSelect={() => onRotate('left')}>
          <Icon glyph={IconRotate} />
          Rotate left
        </Item>
        <Item className="selection-menu__item" onSelect={() => onRotate('right')}>
          <Icon glyph={IconRotateClockwise} />
          Rotate right
        </Item>
      </SubContent>
    </Sub>
  );
}

/** Face actions grouped in one submenu, since they are the least frequent of the lot. */
function FacesSubmenu({
  components,
  items,
  api,
  disabled,
  disabledTitle,
}: {
  components: MenuPrimitives;
  items: SelectionMenuItems;
  api: SelectionActionsApi;
  disabled: boolean;
  disabledTitle?: string;
}) {
  const { Item, Sub, SubTrigger, SubContent } = components;
  // `hidden` here means the photos have no face data yet: keep the option
  // visible (disabled) so the submenu always offers the full set.
  const noFaceData = items.recognizeFaces === 'hidden';
  const noFaceDataTitle = 'Detect faces in these photos first';
  return (
    <Sub>
      <SubTrigger className="selection-menu__item">
        <Icon glyph={IconFaceId} />
        Faces
      </SubTrigger>
      <SubContent>
        <Item className="selection-menu__item" onSelect={api.detectFaces}>
          <Icon glyph={IconScan} />
          Detect faces
        </Item>
        <Item
          className="selection-menu__item"
          onSelect={api.recognizeFaces}
          disabled={items.recognizeFaces !== 'ready' || disabled}
          title={noFaceData ? noFaceDataTitle : disabledTitle}
        >
          <Icon glyph={IconUserSearch} />
          Recognize faces
        </Item>
        <Item
          className="selection-menu__item"
          onSelect={api.removeFaceData}
          disabled={items.removeFaceData !== 'ready' || disabled}
          title={noFaceData ? noFaceDataTitle : disabledTitle}
        >
          <Icon glyph={IconUserOff} />
          Remove face data
        </Item>
      </SubContent>
    </Sub>
  );
}

/** "Remove from these results" for the page's person or tag. */
function RemoveFromScopeItem({
  components,
  scope,
  disabled,
  title,
}: {
  components: MenuPrimitives;
  scope: GalleryScope;
  disabled: boolean;
  title?: string;
}) {
  const { Item } = components;
  const isPerson = scope.kind === 'person';
  return (
    <Item
      className="selection-menu__item"
      onSelect={() => removeFromScope(scope, useAppStore.getState().selectedImages)}
      disabled={disabled}
      title={
        title ??
        (isPerson
          ? `Unlinks ${scope.personName}'s face on these photos, also in the files' face regions and keywords`
          : `Removes the “${scope.tagName}” keyword from these photos and their files`)
      }
    >
      <Icon glyph={isPerson ? IconUserMinus : IconTagMinus} />
      {isPerson ? (
        <span className="grid gap-0.5">
          <span>{`Not ${scope.personName}`}</span>
          <span className="text-xs text-muted-foreground">Face goes back to Unknown faces</span>
        </span>
      ) : (
        `Remove tag “${scope.tagName}”`
      )}
    </Item>
  );
}

/** Renders the bulk-selection actions with the supplied menu primitives. */
export function SelectionMenuBody({
  components,
  api,
  count,
}: {
  components: MenuPrimitives;
  api: SelectionActionsApi;
  count: number;
}) {
  const { Item, Separator } = components;
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const galleryContext = useAppStore((state) => state.galleryContext);
  const scope = useGalleryScope();
  const sharedRating = useSelectionSharedRating();
  const photosLabel = `${count} ${count === 1 ? 'photo' : 'photos'}`;
  const trashLabel = `Move ${photosLabel} to Trash`;

  const selectedImages = useAppStore((state) => state.selectedImages);
  const assetIds = useMemo(() => selectedImages.map((image) => image.id), [selectedImages]);
  const { data: hasUnscannedMetadata, loading: unscannedLoading } = useLiveQuery(
    () => AssetsService.hasUnscannedMetadataAssets(assetIds),
    ['assets'],
    { extDependencies: [assetIds] },
  );
  const canEditMetadata = selectedImages.length > 0 && hasUnscannedMetadata === false;
  const allFavorite =
    selectedImages.length > 0 && selectedImages.every((image) => isFavoriteRating(image.metadata.rating));
  const hasSelectedPhotos = selectedImages.some((asset) => !isSupportedVideoPath(asset.filename));
  const metadataPendingTitle = canEditMetadata
    ? undefined
    : 'Available after all selected photo details have been read';

  const singleAsset = selectedImages.length === 1 ? selectedImages[0] : null;
  const externalAppPath = useSettingsStore((state) =>
    singleAsset && isSupportedVideoPath(singleAsset.filename)
      ? state.externalVideoAppPath
      : state.externalImageAppPath,
  );
  const openInLabel = externalAppPath ? `Open in ${externalAppName(externalAppPath)}` : 'Open in default app';

  const { data: tagCounts, loading: tagsLoading } = useLiveQuery(
    () => TagsService.getTagCountsForAssets(assetIds),
    ['fileTags'],
    { extDependencies: [assetIds] },
  );
  const { data: regionCounts, loading: regionsLoading } = useLiveQuery(
    () => RegionsService.getRegionCountsForAssets(assetIds),
    ['tagRegionInfo'],
    { extDependencies: [assetIds] },
  );
  // Which items exist depends on these queries, so the menu stays invisible
  // until they settle; otherwise it opens too tall and then shrinks.
  const isLoading = unscannedLoading || tagsLoading || regionsLoading;
  const items = selectionMenuItems({
    hasPhotos: hasSelectedPhotos,
    hasTags: tagCounts ? tagCounts.size > 0 : null,
    hasFaceData: regionCounts ? regionCounts.size > 0 : null,
    scopeMatches: scopeMatchCount(scope, assetIds, tagCounts),
  });

  // In the Trash view the only meaningful actions are restore and permanent
  // delete, so the shared body swaps its whole contents.
  if (galleryContext === 'trash') {
    return (
      <>
        <Item className="selection-menu__item" onSelect={api.restore}>
          <Icon glyph={IconRestore} />
          {`Restore ${photosLabel}`}
        </Item>
        <Separator />
        <Item className="selection-menu__item selection-menu__item--danger" onSelect={api.deletePermanently}>
          <Icon glyph={IconTrash} />
          {`Delete ${photosLabel} permanently`}
          <MenuShortcut keys={['Del']} />
        </Item>
      </>
    );
  }

  return (
    <>
      {isLoading && <span hidden data-selection-menu-loading />}

      <Item
        className="selection-menu__item"
        onSelect={api.comparePhotos}
        disabled={!canComparePhotos(selectedImages)}
        title={
          canComparePhotos(selectedImages) ? undefined : 'Select exactly two different photos to compare'
        }
      >
        <Icon glyph={IconColumns2} />
        Compare photos
      </Item>
      <Item className="selection-menu__item" onSelect={api.moveToFolder}>
        <Icon glyph={IconFolder} />
        Move to folder…
        <MenuShortcut keys={['Ctrl', 'M']} />
      </Item>
      {singleAsset && hasSelectedPhotos && (
        <Item className="selection-menu__item" onSelect={api.copyImage}>
          <Icon glyph={IconCopy} />
          Copy to clipboard
        </Item>
      )}
      {singleAsset && (
        <Item className="selection-menu__item" onSelect={api.rename}>
          <Icon glyph={IconPencil} />
          Rename…
        </Item>
      )}
      {singleAsset && (
        <Item className="selection-menu__item" onSelect={api.openInExternalApp}>
          <Icon glyph={IconExternalLink} />
          {openInLabel}
        </Item>
      )}
      {singleAsset && hasSelectedPhotos && (
        <Item
          className="selection-menu__item"
          disabled={!canEditMetadata}
          title={metadataPendingTitle}
          onSelect={() => void openEditorWindow(singleAsset.id)}
        >
          <Icon glyph={IconPhotoEdit} />
          Edit photo…
        </Item>
      )}

      <Separator />

      <RotateSubmenu components={components} onRotate={api.rotate} disabled={!canEditMetadata} />
      <Item
        className="selection-menu__item"
        onSelect={api.editTags}
        disabled={!canEditMetadata}
        title={metadataPendingTitle}
      >
        <Icon glyph={IconTag} />
        Add or edit tags…
        <MenuShortcut keys={['Ctrl', 'T']} />
      </Item>
      {items.removeTags !== 'hidden' && (
        <Item
          className="selection-menu__item"
          onSelect={api.removeTags}
          disabled={items.removeTags === 'pending' || !canEditMetadata}
          title={metadataPendingTitle}
        >
          <Icon glyph={IconTagOff} />
          Remove all tags
        </Item>
      )}

      {ratingMode === RatingMode.Stars && (
        <RateRow value={sharedRating} onRate={api.rate} disabled={!canEditMetadata} />
      )}

      {ratingMode === RatingMode.Favorites && (
        <Item
          className="selection-menu__item"
          onSelect={api.toggleFavorite}
          disabled={!canEditMetadata}
          title={metadataPendingTitle}
        >
          <Icon glyph={allFavorite ? IconHeartFilled : IconHeart} />
          {allFavorite ? 'Unfavorite' : 'Favorite'}
          <MenuShortcut keys={['F']} />
        </Item>
      )}

      <Item
        className="selection-menu__item"
        onSelect={api.editDate}
        disabled={!canEditMetadata}
        title={metadataPendingTitle}
      >
        <Icon glyph={IconCalendarEvent} />
        Edit date & time…
        <MenuShortcut keys={['Ctrl', 'D']} />
      </Item>
      <Item
        className="selection-menu__item"
        onSelect={api.editLocation}
        disabled={!canEditMetadata}
        title={metadataPendingTitle}
      >
        <Icon glyph={IconMapPin} />
        Edit location…
        <MenuShortcut keys={['Ctrl', 'G']} />
      </Item>

      {/* Face actions only exist for photos, so a video-only selection skips the group. */}
      {items.detectFaces !== 'hidden' && (
        <>
          <Separator />

          <FacesSubmenu
            components={components}
            items={items}
            api={api}
            disabled={!canEditMetadata}
            disabledTitle={metadataPendingTitle}
          />
        </>
      )}

      <Separator />

      <Item className="selection-menu__item" onSelect={api.reloadMetadata}>
        <Icon glyph={IconRefresh} />
        Reload metadata from files…
      </Item>
      <Item
        className="selection-menu__item"
        onSelect={api.writeMetadata}
        disabled={!canEditMetadata}
        title={metadataPendingTitle}
      >
        <Icon glyph={IconDeviceFloppy} />
        Write metadata to files…
      </Item>

      <Separator />

      {scope && items.removeFromScope !== 'hidden' && (
        <RemoveFromScopeItem
          components={components}
          scope={scope}
          disabled={items.removeFromScope === 'pending' || !canEditMetadata}
          title={metadataPendingTitle}
        />
      )}

      <Item className="selection-menu__item selection-menu__item--danger" onSelect={api.trash}>
        <Icon glyph={IconTrash} />
        {trashLabel}
        <MenuShortcut keys={['Del']} />
      </Item>
    </>
  );
}

/**
 * Wraps a gallery cell with the bulk-selection right-click menu. Opening the
 * menu on a photo that isn't part of the current selection first selects just
 * that photo (discarding any previous selection), mirroring the mock.
 */
export function SelectionActionsContextMenu({
  img,
  isSelected,
  children,
}: {
  img: AssetInClient;
  isSelected: boolean;
  children: ReactNode;
}) {
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);
  const selectionCount = useAppStore((state) => state.selectedImages.length);
  const api = useSelectionActions();

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open && !isSelected) {
          setSelectedImages([img]);
        }
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Above the selection banner (z-index 60), otherwise the menu's lower
          items render behind it. */}
      <ContextMenuContent className="selection-menu" style={{ zIndex: 1000 }}>
        <SelectionMenuBody
          components={CONTEXT_MENU_COMPONENTS}
          api={api}
          count={isSelected ? selectionCount : 1}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
