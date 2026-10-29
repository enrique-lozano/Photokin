import { confirm } from '@/components/ui/confirmationDialogStore';
import { toast } from '@/components/ui/toast';
import { RootAlbumsService } from '@/db/api/services/rootAlbums.service';
import {
  IconDatabaseImport,
  IconFileExport,
  IconFolderBolt,
  IconPhoto,
  IconRefresh,
  IconTrash,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';
import { EntityAction } from '@/components/entity-actions/entityAction.model';
import { EntityContextMenuContent } from '@/components/entity-actions/EntityActionItems';
import { EntityOverflowMenu } from '@/components/entity-actions/HeaderActionsBar';
import {
  getAlbumSubtreeAssetCount,
  rebuildThumbnailsForAlbum,
  reloadMetadataForAlbum,
  syncAlbum,
  writeMetadataForAlbum,
} from '../../db/api/services/assetIndexer.service.ts';
import { AlbumInClient } from '../../db/models/AlbumDTO';
import { useSettingsStore } from '../../stores/settingsStore.ts';
import { trackProcess } from '../../system/processTracker.ts';
import { notifySyncResult } from '../../system/syncFeedback.ts';
import { appTaskQueue } from '../../utils/taskQueue/taskQueue.ts';
import { AlbumsService } from '@/db/api/services/albums.service';
import { ProcessKind } from '@/stores/processStore';

/**
 * Single source of truth for an album's object verbs, shared by the albums
 * sidebar right-click menu ({@link AlbumContextMenu}) and the album header ⋮
 * menu ({@link AlbumHeaderActions}).
 */
export function useAlbumActions(album: AlbumInClient): EntityAction[] {
  function handleSyncAlbum() {
    trackProcess(
      {
        kind: ProcessKind.Sync,
        title: `Syncing "${album.name}"`,
        message: 'Waiting in queue…',
        canStop: true,
        successMessage: false,
        errorMessage: (error) => `Sync failed: ${String(error)}`,
      },
      (reporter) =>
        appTaskQueue.add(
          () => syncAlbum({ album, resyncMode: useSettingsStore.getState().resyncMode, reporter }),
          { signal: reporter.signal },
        ),
    )
      .then((result) => notifySyncResult(result))
      .catch(() => {
        // The process tracker already surfaced the error toast + state.
      });
  }

  async function handleReloadMetadata() {
    const count = await getAlbumSubtreeAssetCount(album);
    const confirmed = await confirm({
      icon: <IconDatabaseImport size={24} />,
      title: `Reload metadata from ${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}?`,
      description:
        'Photokin will re-read metadata from disk. In-app edits that were never written back will be overwritten; original files are not modified.',
      confirmLabel: 'Reload metadata',
      tone: 'warning',
    });
    if (!confirmed) return;

    trackProcess<{ reloaded: number; warnings: string[] }>(
      {
        kind: ProcessKind.Sync,
        title: `Reloading metadata · "${album.name}"`,
        message: 'Waiting in queue…',
        successMessage: ({ reloaded }) =>
          `Reloaded metadata for ${reloaded} ${reloaded === 1 ? 'file' : 'files'}.`,
        errorMessage: (error) => `Reload failed: ${String(error)}`,
        getWarnings: ({ warnings }) => warnings,
      },
      (reporter) => appTaskQueue.add(() => reloadMetadataForAlbum({ album, reporter })),
    ).catch(() => {
      // The process tracker already surfaced the error toast + state.
    });
  }

  function handleRebuildThumbnails() {
    trackProcess<{ rebuilt: number; warnings: string[] }>(
      {
        kind: ProcessKind.Generic,
        title: `Rebuilding thumbnails · "${album.name}"`,
        message: 'Waiting in queue…',
        successMessage: ({ rebuilt }) => `Rebuilt ${rebuilt} ${rebuilt === 1 ? 'thumbnail' : 'thumbnails'}.`,
        errorMessage: (error) => `Rebuild failed: ${String(error)}`,
        getWarnings: ({ warnings }) => warnings,
      },
      (reporter) => appTaskQueue.add(() => rebuildThumbnailsForAlbum({ album, reporter })),
    ).catch(() => {
      // The process tracker already surfaced the error toast + state.
    });
  }

  async function handleWriteMetadataToFiles() {
    const count = await getAlbumSubtreeAssetCount(album);
    const confirmed = await confirm({
      icon: <IconFileExport size={24} />,
      title: `Write metadata to ${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}?`,
      description: `Photokin will rewrite embedded metadata in every indexed file under “${album.name}” to match its library.`,
      confirmLabel: 'Write metadata',
      tone: 'warning',
      fileMetadataImpact: 'explicit',
    });
    if (!confirmed) return;

    trackProcess<{ written: number; warnings: string[] }>(
      {
        kind: ProcessKind.Generic,
        title: `Writing metadata · "${album.name}"`,
        message: 'Waiting in queue…',
        successMessage: ({ written }) => `Wrote metadata to ${written} ${written === 1 ? 'file' : 'files'}.`,
        errorMessage: (error) => `Metadata write failed: ${String(error)}`,
        getWarnings: ({ warnings }) => warnings,
      },
      (reporter) => appTaskQueue.add(() => writeMetadataForAlbum({ album, reporter })),
    ).catch(() => {
      // The process tracker already surfaced the error toast + state.
    });
  }

  async function handleRemoveAlbumFolder() {
    const confirmed = await confirm({
      icon: <IconTrash size={24} />,
      title: `Remove “${album.name}”?`,
      description:
        "Remove this folder, its index, and any app-only edits from Photokin. Files on disk won't be deleted or changed.",
      confirmLabel: 'Remove folder',
      tone: 'destructive',
    });
    if (!confirmed) return;

    toast.promise(RootAlbumsService.delete(album.rootAlbumId), {
      loading: 'Removing album folder...',
      success: () => 'Album folder removed from Photokin. Files are still on your device.',
      error: (err) => String(err),
    });
  }

  return [
    {
      id: 'open',
      label: 'Open in File Explorer',
      description: 'Reveal this folder on your device.',
      icon: <IconFolderBolt size={16} />,
      onSelect: () => album.open(),
    },
    {
      id: 'sync',
      label: 'Sync this album',
      description: 'Find new, removed and changed files in this folder.',
      icon: <IconRefresh size={16} />,
      onSelect: handleSyncAlbum,
    },
    {
      id: 'visibility',
      label: album.isHidden ? 'Show album' : 'Hide album',
      description: album.isHidden
        ? 'Show this album. Folders starting with a dot stay hidden.'
        : 'Hide this album and its photos.',
      icon: album.isHidden ? <IconEye size={16} /> : <IconEyeOff size={16} />,
      onSelect: () => void AlbumsService.setHidden(album, !album.isHidden),
    },
    {
      id: 'reload-metadata',
      label: 'Reload metadata',
      description: 'Re-read metadata from every file, including unchanged ones.',
      icon: <IconDatabaseImport size={16} />,
      onSelect: () => void handleReloadMetadata(),
    },
    {
      id: 'rebuild-thumbnails',
      label: 'Rebuild thumbnails',
      description: 'Regenerate thumbnails for this album.',
      icon: <IconPhoto size={16} />,
      onSelect: handleRebuildThumbnails,
    },
    {
      id: 'write-metadata',
      label: 'Write metadata to files',
      description: "Save Photokin edits into the original files' metadata.",
      icon: <IconFileExport size={16} />,
      onSelect: () => void handleWriteMetadataToFiles(),
    },
    {
      id: 'remove',
      label: 'Remove Album Folder',
      description: 'Remove this folder from Photokin.',
      icon: <IconTrash size={16} />,
      destructive: true,
      hidden: !album.isAtTheRootLevel,
      onSelect: () => void handleRemoveAlbumFolder(),
    },
  ];
}

/** Sidebar right-click menu content for an album (used as a Tree `popover`). */
export function AlbumContextMenu({ album }: { album: AlbumInClient }) {
  const actions = useAlbumActions(album);
  return <EntityContextMenuContent label={album.name} actions={actions} />;
}

/** Header ⋮ menu for the currently-selected album, in parity with the sidebar. */
export function AlbumHeaderActions({ album }: { album: AlbumInClient }) {
  const actions = useAlbumActions(album);
  return <EntityOverflowMenu actions={actions} menuLabel="Album actions" />;
}
