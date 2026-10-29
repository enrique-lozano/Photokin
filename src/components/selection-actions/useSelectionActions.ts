import { isSupportedVideoPath } from '@/common/supportedFormats';
import { metadataUndoAction } from '@/components/metadataUndo';
import { AssetsService } from '@/db/api/services/assets.service';
import {
  describeRecognizeResult,
  detectFaces,
  FaceDetectSummary,
  FaceRecognitionOptions,
  faceRecognitionOptionsFrom,
  FaceRecognizeSummary,
  recognizeFaces,
} from '@/media/faces/faceRecognition';
import { FAVORITE_RATING, isFavoriteRating } from '@/media/metadata/fields/favorite';
import { METADATA_SCAN_PENDING_MESSAGE } from '@/media/metadata/metadataScanState';
import { useFaceScanSettingsStore } from '@/stores/faceScanSettingsStore';
import { ProcessKind } from '@/stores/processStore';
import { trackProcess } from '@/system/processTracker';
import { openInExternalApp } from '@/system/externalApp';
import { useMemo } from 'react';
import { AssetInClient } from '../../db/models/AssetInClient';
import { useAppStore } from '../../stores/appState';
import { useEditDateDialog } from '../edit-date/editDateDialogStore';
import { useEditLocationDialog } from '../edit-location/editLocationDialogStore';
import { useEditTagsDialog } from '../edit-tags/editTagsDialogStore';
import { useRemoveAllTagsDialog } from '../edit-tags/removeAllTagsDialogStore';
import { useMetadataActionsDialog } from '../metadata-actions/metadataActionsStore';
import { useMoveToFolderDialog } from '../move-to-folder/moveToFolderDialogStore';
import { useRemoveFaceDataDialog } from '../remove-face-data/removeFaceDataDialogStore';
import { useRenameFileDialog } from '../rename-file/renameFileDialogStore';
import { useTrashDialog } from '../trash/trashDialogStore';
import { toast } from '../ui/toast';
import { copyImageToClipboardWithFeedback } from '../lightbox/copyImageAction';
import { canComparePhotos } from '../compare/comparisonViewport';

export type RotateDirection = 'left' | 'right';

/** Bulk actions available for the current photo selection. */
export interface SelectionActionsApi {
  comparePhotos(): void;
  moveToFolder(): void;
  /** Copy the selected photo's image to the clipboard (single selection). */
  copyImage(): void;
  /** Ask for a new file name for the selected item (single selection). */
  rename(): void;
  /** Open the selected item in the configured external app or the system default (single selection). */
  openInExternalApp(): void;
  editTags(): void;
  removeTags(): void;
  rate(value: number): void;
  toggleFavorite(): void;
  editDate(): void;
  editLocation(): void;
  reloadMetadata(): void;
  writeMetadata(): void;
  detectFaces(): void;
  recognizeFaces(): void;
  removeFaceData(): void;
  rotate(direction: RotateDirection): void;
  trash(): void;
  /** Restore the selected trashed photos to their original folders. */
  restore(): void;
  /** Permanently delete the selected trashed photos. */
  deletePermanently(): void;
}

function _photosLabel(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

function _photosOnly(assets: AssetInClient[]): AssetInClient[] {
  return assets.filter((asset) => !isSupportedVideoPath(asset.filename));
}

function _withEditableSelection(action: (images: AssetInClient[]) => void): void {
  const { selectedImages } = useAppStore.getState();
  if (selectedImages.length === 0) return;

  void AssetsService.hasUnscannedMetadataAssets(selectedImages.map((image) => image.id))
    .then((hasUnscanned) => {
      if (hasUnscanned) {
        toast.error(METADATA_SCAN_PENDING_MESSAGE);
        return;
      }
      action(selectedImages);
    })
    .catch(() => toast.error('Could not verify whether photo details are ready'));
}

/**
 * The selection keeps asset snapshots, so swap in fresh copies after an edit;
 * otherwise rating-aware controls (e.g. Favorite ⇄ Unfavorite) read stale data.
 */
function _refreshSelected(fresh: AssetInClient[]): void {
  const byId = new Map(fresh.map((asset) => [asset.id, asset]));
  const { selectedImages, setSelectedImages } = useAppStore.getState();
  if (!selectedImages.some((image) => byId.has(image.id))) return;
  setSelectedImages(selectedImages.map((image) => byId.get(image.id) ?? image));
}

/**
 * Applies one rating to the whole selection through the process center, listing
 * the files whose write-back failed as warnings.
 */
function _rateSelection(value: number, title: string, success: (rated: number) => string): void {
  _withEditableSelection((selectedImages) => {
    const filenameById = new Map(selectedImages.map((asset) => [asset.id, asset.filename]));
    void trackProcess<{
      rated: number;
      failures: Map<string, string>;
      undo?: () => Promise<void>;
    }>(
      {
        kind: ProcessKind.Generic,
        title: `${title} · ${_photosLabel(selectedImages.length)}`,
        progress: 0,
        // Re-rating (or Favorite ⇄ Unfavorite) undoes it just as quickly.
        briefSuccess: true,
        successMessage: ({ rated }) => success(rated),
        getWarnings: ({ failures }) =>
          [...failures].map(([id, message]) => `${filenameById.get(id) ?? id}: ${message}`),
        getSuccessAction: ({ undo }) => (undo ? metadataUndoAction(undo) : undefined),
      },
      async (reporter) => {
        const beforeAssets = await Promise.all(
          selectedImages.map((asset) => AssetsService.getByUUID(asset.id)),
        );
        const result = await AssetsService.rateAssets(
          selectedImages.map((asset) => asset.id),
          value,
          (processed, total) => reporter.setProgress(processed, total),
        );
        const after = value || null;
        const currentAssets = await Promise.all(
          selectedImages.map((asset) => AssetsService.getByUUID(asset.id)),
        );
        _refreshSelected(currentAssets);
        const beforeById = new Map(beforeAssets.map((asset) => [asset.id, asset]));
        const changedAssets = currentAssets.filter((asset) => {
          const before = beforeById.get(asset.id);
          return (
            (asset.metadata.rating || null) === after &&
            (before?.metadata.rating || null) !== (asset.metadata.rating || null)
          );
        });
        const undo =
          changedAssets.length > 0
            ? async () => {
                const undoAssets = await Promise.all(
                  changedAssets.map((asset) => AssetsService.getByUUID(asset.id)),
                );
                for (const current of undoAssets) {
                  if ((current.metadata.rating || null) !== after) {
                    throw new Error(`${current.filename} was rated again after this change`);
                  }
                }
                const failures = await AssetsService.updateAssetsEditableFields(
                  undoAssets.map((asset) => ({
                    id: asset.id,
                    fields: { rating: beforeById.get(asset.id)?.metadata.rating || null },
                  })),
                );
                _refreshSelected(
                  await Promise.all(changedAssets.map((asset) => AssetsService.getByUUID(asset.id))),
                );
                if (failures.size > 0) throw new Error([...failures.values()].join('; '));
              }
            : undefined;
        return { ...result, undo };
      },
    ).catch(() => {
      // The process tracker already surfaced the error toast + state.
    });
  });
}

/** The rating shared by every image, or 0 when the set is empty or mixed. */
function _sharedRating(images: AssetInClient[]): number {
  const first = images[0]?.metadata.rating ?? 0;
  return images.every((img) => (img.metadata.rating ?? 0) === first) ? first : 0;
}

/** Reactive shared rating of the current selection, for prefilling rate controls. */
export function useSelectionSharedRating(): number {
  return useAppStore((state) => _sharedRating(state.selectedImages));
}

function _faceRecognitionOptions(): FaceRecognitionOptions {
  return faceRecognitionOptionsFrom(useFaceScanSettingsStore.getState());
}

function _recognizeFaces(photos: AssetInClient[]): void {
  const options = _faceRecognitionOptions();
  void trackProcess<FaceRecognizeSummary>(
    {
      kind: ProcessKind.FaceRecognize,
      title: `Recognizing faces · ${_photosLabel(photos.length)}`,
      message: 'Comparing detected faces…',
      canStop: true,
      successMessage: (summary) => `Face recognition finished · ${describeRecognizeResult(summary)}`,
      errorMessage: (error) => `Could not recognize faces: ${String(error)}`,
      getWarnings: (summary) => summary.warnings,
    },
    (reporter) => recognizeFaces(photos, options, reporter, { recluster: false }),
  ).catch(() => {
    // The process tracker already surfaced the error toast + state.
  });
}

export function useSelectionActions(): SelectionActionsApi {
  return useMemo<SelectionActionsApi>(
    () => ({
      comparePhotos: () => {
        const { selectedImages, galleryContext, setComparisonPair } = useAppStore.getState();
        if (galleryContext === 'trash' || !canComparePhotos(selectedImages)) {
          toast.info('Select exactly two different photos outside Trash to compare');
          return;
        }
        setComparisonPair([selectedImages[0], selectedImages[1]]);
      },
      moveToFolder: () => {
        const { selectedImages } = useAppStore.getState();
        useMoveToFolderDialog.getState().openDialog(selectedImages);
      },
      copyImage: () => {
        const [asset] = useAppStore.getState().selectedImages;
        if (asset) void copyImageToClipboardWithFeedback(asset);
      },
      rename: () => {
        const { selectedImages } = useAppStore.getState();
        if (selectedImages.length === 1) useRenameFileDialog.getState().openDialog(selectedImages);
      },
      openInExternalApp: () => {
        const [asset] = useAppStore.getState().selectedImages;
        if (!asset) return;
        void openInExternalApp(asset).catch((error) =>
          toast.error(`Could not open the file: ${String(error)}`),
        );
      },
      editTags: () => {
        _withEditableSelection((selectedImages) => useEditTagsDialog.getState().openDialog(selectedImages));
      },
      removeTags: () => {
        _withEditableSelection((selectedImages) =>
          useRemoveAllTagsDialog.getState().openDialog(selectedImages),
        );
      },
      rate: (value) =>
        _rateSelection(value, value === 0 ? 'Clearing rating' : `Rating ${value}★`, (rated) =>
          value === 0 ? `Cleared rating on ${_photosLabel(rated)}` : `Rated ${_photosLabel(rated)} ${value}★`,
        ),
      toggleFavorite: () => {
        // Only an all-favorite selection is un-favorited; a mixed one becomes
        // all favorites, which is what the heart button suggests.
        const { selectedImages } = useAppStore.getState();
        const clearing =
          selectedImages.length > 0 &&
          selectedImages.every((image) => isFavoriteRating(image.metadata.rating));

        _rateSelection(
          clearing ? 0 : FAVORITE_RATING,
          clearing ? 'Removing from favorites' : 'Adding to favorites',
          (rated) =>
            clearing
              ? `Removed ${_photosLabel(rated)} from favorites`
              : `Added ${_photosLabel(rated)} to favorites`,
        );
      },
      editDate: () => {
        _withEditableSelection((selectedImages) => useEditDateDialog.getState().openDialog(selectedImages));
      },
      editLocation: () => {
        _withEditableSelection((selectedImages) =>
          useEditLocationDialog.getState().openDialog(selectedImages),
        );
      },
      reloadMetadata: () => {
        const { selectedImages } = useAppStore.getState();
        useMetadataActionsDialog.getState().openDialog('reload', selectedImages);
      },
      writeMetadata: () => {
        _withEditableSelection((selectedImages) =>
          useMetadataActionsDialog.getState().openDialog('write', selectedImages),
        );
      },
      detectFaces: () => {
        const selectedImages = _photosOnly(useAppStore.getState().selectedImages);
        if (selectedImages.length === 0) {
          toast.info('Face detection is available for photos only');
          return;
        }

        const options = _faceRecognitionOptions();
        void trackProcess<FaceDetectSummary>(
          {
            kind: ProcessKind.FaceDetect,
            title: `Detecting faces · ${_photosLabel(selectedImages.length)}`,
            message: 'Loading photos…',
            canStop: true,
            successMessage: (summary) =>
              `${summary.detectedFaces} face${summary.detectedFaces === 1 ? '' : 's'} found in ${_photosLabel(
                selectedImages.length,
              )}`,
            errorMessage: (error) => `Could not detect faces: ${String(error)}`,
            getWarnings: (summary) => summary.warnings,
            getSuccessAction: (summary) =>
              summary.detectedFaces > 0
                ? { label: 'Recognize now', onClick: () => _recognizeFaces(selectedImages) }
                : undefined,
          },
          (reporter) => detectFaces(selectedImages, options, reporter),
        ).catch(() => {
          // The process tracker already surfaced the error toast + state.
        });
      },
      recognizeFaces: () => {
        _withEditableSelection((selectedImages) => {
          const photos = _photosOnly(selectedImages);
          if (photos.length === 0) {
            toast.info('Face recognition is available for photos only');
            return;
          }
          _recognizeFaces(photos);
        });
      },
      removeFaceData: () => {
        _withEditableSelection((selectedImages) => {
          const photos = _photosOnly(selectedImages);
          if (photos.length > 0) useRemoveFaceDataDialog.getState().openDialog(photos);
        });
      },
      rotate: (direction) => {
        _withEditableSelection(async (selectedImages) => {
          const filenameById = new Map(selectedImages.map((asset) => [asset.id, asset.filename]));
          void trackProcess<{ rotated: number; failures: Map<string, string>; undo?: () => Promise<void> }>(
            {
              kind: ProcessKind.Generic,
              title: `Rotating ${_photosLabel(selectedImages.length)}`,
              progress: 0,
              successMessage: ({ rotated }) =>
                `Rotated ${rotated} ${rotated === 1 ? 'photo' : 'photos'} ${direction}`,
              getWarnings: ({ failures }) =>
                [...failures].map(([id, message]) => `${filenameById.get(id) ?? id}: ${message}`),
              getSuccessAction: ({ undo }) => (undo ? metadataUndoAction(undo) : undefined),
            },
            async (reporter) => {
              const beforeAssets = await Promise.all(
                selectedImages.map((asset) => AssetsService.getByUUID(asset.id)),
              );
              const result = await AssetsService.rotateAssets(
                selectedImages.map((asset) => asset.id),
                direction,
                (processed, total) => reporter.setProgress(processed, total),
              );
              const succeededBefore = beforeAssets.filter((asset) => !result.failures.has(asset.id));
              if (succeededBefore.length === 0) return result;
              const afterAssets = await Promise.all(
                succeededBefore.map((asset) => AssetsService.getByUUID(asset.id)),
              );
              const oppositeDirection: RotateDirection = direction === 'left' ? 'right' : 'left';
              const undo = async () => {
                const currentAssets = await Promise.all(
                  afterAssets.map((asset) => AssetsService.getByUUID(asset.id)),
                );
                for (const [index, current] of currentAssets.entries()) {
                  const expected = afterAssets[index];
                  if (
                    current.metadata.orientation !== expected.metadata.orientation ||
                    current.metadata.width !== expected.metadata.width ||
                    current.metadata.height !== expected.metadata.height
                  ) {
                    throw new Error(`${current.filename} changed after this rotation`);
                  }
                }
                const undoResult = await AssetsService.rotateAssets(
                  currentAssets.map((asset) => asset.id),
                  oppositeDirection,
                );
                if (undoResult.failures.size > 0) {
                  throw new Error([...undoResult.failures.values()].join('; '));
                }
              };
              return { ...result, undo };
            },
          ).catch(() => {
            // The process tracker already surfaced the error toast + state.
          });
        });
      },
      trash: () => {
        const { selectedImages } = useAppStore.getState();
        void useTrashDialog.getState().request('trash', selectedImages);
      },
      restore: () => {
        const { selectedImages } = useAppStore.getState();
        void useTrashDialog.getState().request('restore', selectedImages);
      },
      deletePermanently: () => {
        const { selectedImages } = useAppStore.getState();
        void useTrashDialog.getState().request('delete', selectedImages);
      },
    }),
    [],
  );
}
