import { showMetadataUndoToast } from '@/components/metadataUndo';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { FAVORITE_RATING, isFavoriteRating } from '@/media/metadata/fields/favorite';
import { hasScannedMetadata, metadataEditErrorMessage } from '@/media/metadata/metadataScanState';
import { openContainingFolder } from '@/system/diskManager';
import { useWindowControls } from '@/system/useWindowControls';
import { openEditorWindow } from '@/utils/openEditorWindow';
import {
  IconChevronLeft,
  IconCopy,
  IconDotsVertical,
  IconFolderBolt,
  IconHeart,
  IconHeartFilled,
  IconInfoCircle,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconScan,
  IconTrash,
} from '@tabler/icons-react';
import { memo, useEffect, useState } from 'react';
import { RatingMode } from '../../common/ratingModeOptions';
import { FaceBoxMode } from '../../stores/appState';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDate } from '../../utils/dateFormatter';
import { WindowControls } from '../app-shell/WindowControls';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { toast } from '../ui/toast';

interface LightboxTopBarProps {
  img: AssetInClient | null;
  isVideo: boolean;
  isInfoActive: boolean;
  isRunningAction: boolean;
  onToggleInfo: () => void;
  onClose: () => void;
  onCopy: () => void;
  onReloadMetadata: () => void;
  onReloadThumbnail: () => void;
  onDelete: () => void;
  faceBoxMode: FaceBoxMode;
  onFaceBoxModeChange: (mode: FaceBoxMode) => void;
}

/**
 * Builds the "· date · time · location" subtitle. The filename is prepended only
 * when it isn't already the heading (i.e. the photo has a title), so it never
 * shows twice.
 */
function buildSubtitle(img: AssetInClient, includeFilename: boolean): string {
  const parts = [
    ...(includeFilename ? [img.filename] : []),
    formatDate(img.metadata.date, { dateStyle: 'medium' }),
    formatDate(img.metadata.date, { hour: '2-digit', minute: '2-digit' }),
  ];

  const location = img.metadata.location?.name?.trim();
  if (location) parts.push(location);

  return parts.filter(Boolean).join(' · ');
}

/**
 * The lightbox's solid top bar. Restores the OS window affordances lost while
 * the fullscreen viewer covers the main toolbar (drag to move, double-click to
 * maximize, minimize/maximize/close) and surfaces per-photo actions.
 */
function LightboxTopBarComponent({
  img,
  isVideo,
  isInfoActive,
  isRunningAction,
  onToggleInfo,
  onClose,
  onCopy,
  onReloadMetadata,
  onReloadThumbnail,
  onDelete,
  faceBoxMode,
  onFaceBoxModeChange,
}: LightboxTopBarProps) {
  const { startDragging, handleDragRegionDoubleClick } = useWindowControls();
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const canEditMetadata = img ? hasScannedMetadata(img) : false;

  // Tracked optimistically, then kept in sync with the live asset (which
  // refreshes after each write).
  const [isFavorite, setIsFavorite] = useState(false);
  useEffect(() => {
    setIsFavorite(isFavoriteRating(img?.metadata.rating));
  }, [img?.id, img?.metadata.rating]);

  async function handleToggleFavorite() {
    if (!img) return;

    const next = !isFavorite;
    const before = img.metadata.rating || null;
    const after = next ? FAVORITE_RATING : null;
    setIsFavorite(next);
    try {
      await AssetsService.updateAssetEditableFields(img.id, { rating: next ? FAVORITE_RATING : 0 });
      showMetadataUndoToast(next ? 'Added to favorites' : 'Removed from favorites', async () => {
        const current = await AssetsService.getByUUID(img.id);
        if ((current.metadata.rating || null) !== after) {
          throw new Error('This favorite was changed again after the recorded edit');
        }
        await AssetsService.updateAssetEditableFields(img.id, {
          rating: before,
        });
      });
    } catch (error) {
      setIsFavorite(!next);
      toast.error(metadataEditErrorMessage(error, 'Could not update favorite'));
    }
  }

  return (
    <header className="lightbox-topbar">
      <div className="lightbox-topbar__lead" onMouseDown={(event) => event.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="lightbox-topbar__action"
          aria-label="Back to gallery"
          title="Back to gallery (Esc)"
          onClick={onClose}
        >
          <IconChevronLeft size={20} />
        </Button>

        {img &&
          (() => {
            const title = img.metadata.title?.trim();
            const heading = title || img.filename;

            return (
              <div className="lightbox-topbar__titles">
                <span className="lightbox-topbar__title" title={heading}>
                  {heading}
                </span>
                <span className="lightbox-topbar__subtitle">{buildSubtitle(img, Boolean(title))}</span>
              </div>
            );
          })()}
      </div>

      <div
        className="lightbox-topbar__drag"
        data-tauri-drag-region
        onMouseDown={startDragging}
        onDoubleClick={handleDragRegionDoubleClick}
      />

      <div className="lightbox-topbar__actions" onMouseDown={(event) => event.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="lightbox-topbar__action"
          aria-label="Copy image"
          title={isVideo ? 'Copying is not available for videos' : 'Copy image to the clipboard'}
          disabled={!img || isVideo}
          onClick={onCopy}
        >
          <IconCopy size={19} />
        </Button>

        {ratingMode === RatingMode.Favorites && (
          <Button
            variant="ghost"
            size="icon"
            className={'lightbox-topbar__action' + (isFavorite ? ' is-favorite' : '')}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
            title={
              !canEditMetadata
                ? 'Available after photo details have been read'
                : isFavorite
                  ? 'Remove from favorites'
                  : 'Add to favorites'
            }
            disabled={!img || !canEditMetadata}
            onClick={() => void handleToggleFavorite()}
          >
            {isFavorite ? <IconHeartFilled size={19} /> : <IconHeart size={19} />}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="lightbox-topbar__action"
          aria-label="Edit photo"
          title={
            isVideo
              ? 'Editing is not available for videos'
              : img?.trashedAt
                ? 'Cannot edit photos in Trash'
                : !canEditMetadata
                  ? 'Available after photo details have been read'
                  : 'Edit photo'
          }
          disabled={!img || isVideo || Boolean(img?.trashedAt) || !canEditMetadata || isRunningAction}
          onClick={() => {
            if (img) void openEditorWindow(img.id);
          }}
        >
          <IconPencil size={19} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="lightbox-topbar__action"
          aria-label={img?.trashedAt ? 'Delete permanently' : 'Move to Trash'}
          title={img?.trashedAt ? 'Delete permanently' : 'Move to Trash'}
          disabled={!img}
          onClick={onDelete}
        >
          <IconTrash size={19} />
        </Button>

        <span className="lightbox-topbar__divider" aria-hidden />

        <Button
          variant="ghost"
          size="icon"
          className={'lightbox-topbar__action' + (isInfoActive ? ' is-active' : '')}
          aria-label={isInfoActive ? 'Hide info panel' : 'Show info panel'}
          aria-pressed={isInfoActive}
          title={isInfoActive ? 'Hide photo details (I)' : 'Show photo details (I)'}
          onClick={onToggleInfo}
        >
          <IconInfoCircle size={19} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lightbox-topbar__action"
              aria-label="More actions"
              title="More actions"
            >
              <IconDotsVertical size={19} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isVideo && !img?.trashedAt && (
              <DropdownMenuItem
                disabled={!img || !canEditMetadata || isRunningAction}
                onSelect={() => {
                  if (img) void openEditorWindow(img.id);
                }}
              >
                <IconPencil size={16} />
                Edit photo...
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!img}
              onSelect={() => {
                if (!img) return;
                void openContainingFolder(img.fullPath).catch((error) => {
                  toast.error(`Could not open in File Explorer: ${String(error)}`);
                });
              }}
            >
              <IconFolderBolt size={16} className="text-muted-foreground" />
              Open in File Explorer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!img || isRunningAction} onSelect={onReloadMetadata}>
              <IconRefresh size={16} className="text-muted-foreground" />
              Reload metadata
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!img || isRunningAction} onSelect={onReloadThumbnail}>
              <IconPhoto size={16} className="text-muted-foreground" />
              Reload thumbnail
            </DropdownMenuItem>
            {!isVideo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <IconScan size={16} className="text-muted-foreground" />
                    Face boxes
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuLabel>Show faces</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={faceBoxMode}
                      onValueChange={(value) => onFaceBoxModeChange(value as FaceBoxMode)}
                    >
                      <DropdownMenuRadioItem value="never">Never</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="hover">On hover</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="auto">Auto</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="lightbox-topbar__divider" aria-hidden />

        <WindowControls className="lightbox-topbar__window-controls" />
      </div>
    </header>
  );
}

export const LightboxTopBar = memo(LightboxTopBarComponent);
