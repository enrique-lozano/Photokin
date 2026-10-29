import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button.tsx';
import { toast } from '@/components/ui/toast';
import { ProcessKind } from '@/stores/processStore';
import { IconAlertTriangle, IconFolderPlus, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { RootAlbumImportPreview, RootAlbumsService } from '../../db/api/services/rootAlbums.service.ts';
import { trackProcess } from '../../system/processTracker.ts';
import { formatBytes } from '../../utils/numberFormatter.ts';
import { appTaskQueue } from '../../utils/taskQueue/taskQueue.ts';

interface AddAlbumsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAlbumsModal({ open, onOpenChange }: AddAlbumsModalProps) {
  const [previewData, setPreviewData] = useState<RootAlbumImportPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isAddingAlbums, setIsAddingAlbums] = useState(false);

  const canAddAlbums = useMemo(() => {
    if (!previewData) {
      return false;
    }

    return previewData.directoriesWithSupportedFiles.length > 0 && !isLoadingPreview && !isAddingAlbums;
  }, [isAddingAlbums, isLoadingPreview, previewData]);

  const resetState = () => {
    setPreviewData(null);
    setIsLoadingPreview(false);
    setIsAddingAlbums(false);
  };

  const handleOpenChange = (nextValue: boolean) => {
    if (!nextValue) {
      resetState();
    }

    if (!isAddingAlbums) {
      onOpenChange(nextValue);
    }
  };

  const handleSelectFolders = async () => {
    setIsLoadingPreview(true);

    try {
      const directories = await RootAlbumsService.selectDirectories();

      if (directories.length === 0) {
        setPreviewData(null);
        return;
      }

      const preview = await RootAlbumsService.previewDirectories(directories);
      setPreviewData(preview);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleAddAlbums = async () => {
    if (!previewData) {
      return;
    }

    const validDirectories = previewData.directoriesWithSupportedFiles;
    if (validDirectories.length === 0) {
      toast.info('No supported photo or video files found');
      return;
    }

    const foldersLabel = validDirectories.length === 1 ? 'folder' : 'folders';
    setIsAddingAlbums(true);

    // Close the modal right away: import progress is shown in the process
    // center so the user can keep browsing while it runs in the background.
    handleOpenChange(false);

    trackProcess(
      {
        kind: ProcessKind.Import,
        title: 'Importing photos',
        message: `Preparing ${validDirectories.length} ${foldersLabel}…`,
        canStop: true,
        successMessage: `${validDirectories.length} album ${foldersLabel} added successfully`,
        errorMessage: (error) => `Import failed: ${String(error)}`,
      },
      (reporter) =>
        appTaskQueue.add(
          () => RootAlbumsService.addDirectories(validDirectories, reporter, previewData.supportedFilesCount),
          { signal: reporter.signal },
        ),
    )
      .then(() => {
        if (previewData.unsupportedFilesCount > 0) {
          toast.warning(
            `${previewData.unsupportedFilesCount} unsupported file${previewData.unsupportedFilesCount > 1 ? 's were' : ' was'} skipped`,
          );
        }

        if (previewData.directoriesWithoutSupportedFiles.length > 0) {
          toast.info(
            `${previewData.directoriesWithoutSupportedFiles.length} folder${previewData.directoriesWithoutSupportedFiles.length > 1 ? 's were' : ' was'} skipped because they contain no supported files`,
          );
        }
      })
      .catch(() => {
        // The tracker already surfaced the error toast + process state.
      })
      .finally(() => {
        setIsAddingAlbums(false);
      });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[min(92vw,38.75rem)]">
        <AlertDialogHeader>
          <AlertDialogTitle>Add albums</AlertDialogTitle>
          <AlertDialogDescription>
            Select one or more folders. Photokin will import only supported image/video formats.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogBody className="add-albums-content">
          <Button
            variant="outline-primary"
            onClick={() => void handleSelectFolders()}
            disabled={isAddingAlbums}
          >
            <IconFolderPlus size={18} />
            {isLoadingPreview ? 'Scanning folders...' : 'Select folders'}
          </Button>

          {previewData && (
            <div className="add-albums-preview">
              <p className="add-albums-line">
                <span>Selected folders</span>
                <strong>{previewData.selectedDirectories.length}</strong>
              </p>
              <p className="add-albums-line add-albums-line--success">
                <span>Files to add</span>
                <strong>{previewData.supportedFilesCount}</strong>
              </p>
              <p className="add-albums-line">
                <span>Total size to add</span>
                <strong>{formatBytes(previewData.supportedFilesSize)}</strong>
              </p>

              {previewData.unsupportedFilesCount > 0 && (
                <div className="add-albums-warning">
                  <div className="add-albums-warning-title">
                    <IconAlertTriangle size={16} />
                    <span>
                      {previewData.unsupportedFilesCount} unsupported file
                      {previewData.unsupportedFilesCount > 1 ? 's' : ''} will be skipped
                    </span>
                  </div>
                  <p className="add-albums-warning-subtitle">
                    Unsupported size: {formatBytes(previewData.unsupportedFilesSize)}
                  </p>
                  {previewData.unsupportedExtensions.length > 0 && (
                    <div className="add-albums-extension-list">
                      {previewData.unsupportedExtensions.slice(0, 8).map((entry) => (
                        <Badge key={entry.extension} variant="destructive">
                          {entry.extension} ({entry.count})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {previewData.supportedFilesCount === 0 && (
                <p className="add-albums-empty-state">
                  <IconInfoCircle size={16} />
                  No supported media files found in the selected folders.
                </p>
              )}
            </div>
          )}
        </AlertDialogBody>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isAddingAlbums}>
            Cancel
          </Button>
          <Button onClick={() => void handleAddAlbums()} disabled={!canAddAlbums}>
            {isAddingAlbums ? 'Adding...' : 'Add albums'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
