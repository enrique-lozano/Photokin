import { DependencyStatusCards } from '@/components/dependencies/DependencyStatusCards';
import {
  SettingsButtonRow,
  SettingsGroup,
  SettingsIconButton,
  SettingsPageHeader,
  SettingsRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsRow';
import { SmartSearchModelsCard } from '@/components/smart-search/SmartSearchModelsCard';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { hasAnyDownloadedModel } from '@/media/smartSearch/models';
import { useModelDownloads } from '@/media/smartSearch/modelDownload';
import { AppRoutes } from '@/router';
import { useDependencyStatus } from '@/system/useDependencyStatus';
import {
  ThumbnailCacheStats,
  SearchModelsStorageStats,
  WIPE_USER_DATA_EVENT,
  WipeUserDataPayload,
  clearThumbnailCache,
  getDatabaseFolder,
  getDatabaseStorageSize,
  getSearchModelsStorageStats,
  getThumbnailCacheStats,
  getThumbnailsFolder,
} from '@/system/userData';
import { formatBytes } from '@/utils/numberFormatter';
import { IconDatabase, IconFolder, IconPhoto, IconSparkles, IconTrash } from '@tabler/icons-react';
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openPath } from '@tauri-apps/plugin-opener';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Folders = { database: string; thumbnails: string };
type StorageStats = {
  databaseBytes: number;
  thumbnails: ThumbnailCacheStats;
  models: SearchModelsStorageStats;
};

async function openFolder(path: string) {
  try {
    await openPath(path);
  } catch (error) {
    toast.error(`Could not open the folder: ${String(error)}`);
  }
}

function FolderRow({
  icon,
  label,
  path,
  size,
  children,
}: {
  icon: ReactNode;
  label: string;
  path: string | undefined;
  size: string;
  children?: ReactNode;
}) {
  return (
    <SettingsRow icon={icon} label={label} description={`${size} · ${path ?? 'Resolving…'}`}>
      <SettingsIconButton
        label={`Open ${label.toLowerCase()} folder`}
        disabled={!path}
        onClick={() => path && void openFolder(path)}
      >
        <IconFolder size={16} />
      </SettingsIconButton>
      {children}
    </SettingsRow>
  );
}

export function SettingsSystem() {
  const { dependencies, isLoading, error, reload } = useDependencyStatus();
  const [folders, setFolders] = useState<Folders | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const thumbnailStats = storageStats?.thumbnails ?? null;
  const downloadRevision = useModelDownloads((state) => state.revision);
  const [clearThumbnailsConfirmOpen, setClearThumbnailsConfirmOpen] = useState(false);
  const [isClearingThumbnails, setIsClearingThumbnails] = useState(false);
  const [hasDownloadedModels, setHasDownloadedModels] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteAiModels, setDeleteAiModels] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const refreshStorageStats = useCallback(async () => {
    try {
      const [databaseBytes, thumbnails, models] = await Promise.all([
        getDatabaseStorageSize(),
        getThumbnailCacheStats(),
        getSearchModelsStorageStats(),
      ]);
      setStorageStats({ databaseBytes, thumbnails, models });
      setStorageError(null);
    } catch (error) {
      setStorageError(`Could not calculate storage use: ${String(error)}`);
    }
  }, []);

  const refreshDownloadedModels = useCallback(async () => {
    try {
      setHasDownloadedModels(await hasAnyDownloadedModel());
    } catch (error) {
      toast.error(`Could not check downloaded models: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getDatabaseFolder(), getThumbnailsFolder()])
      .then(([database, thumbnails]) => {
        if (!cancelled) setFolders({ database, thumbnails });
      })
      .catch((error) => {
        if (!cancelled) toast.error(String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshStorageStats();
    void refreshDownloadedModels();
  }, [refreshStorageStats, refreshDownloadedModels, downloadRevision]);

  const handleClearThumbnails = async () => {
    setIsClearingThumbnails(true);

    try {
      await clearThumbnailCache();
      toast.success('Thumbnail cache cleared');
      await refreshStorageStats();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsClearingThumbnails(false);
      setClearThumbnailsConfirmOpen(false);
    }
  };

  const handleRemoveAllData = async () => {
    setIsWiping(true);

    try {
      // The main window owns the live database connection, so it performs the
      // wipe and reloads itself. The settings window simply closes afterwards.
      const payload: WipeUserDataPayload = {
        deleteAiModels: hasDownloadedModels && deleteAiModels,
      };
      await emitTo('main', WIPE_USER_DATA_EVENT, payload);
      toast.success('Removing all user data...');
      await getCurrentWindow().close();
    } catch (error) {
      toast.error(String(error));
      setIsWiping(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <SettingsPageHeader title="System" />

      <SettingsGroup title="Smart search">
        <SmartSearchModelsCard selectionPath={AppRoutes.settingsModels} />
      </SettingsGroup>

      <SettingsGroup title="Photo tools">
        <DependencyStatusCards
          dependencies={dependencies}
          isLoading={isLoading}
          error={error}
          onRecheck={reload}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Storage"
        footer={
          <p className="text-xs text-muted-foreground" role={storageError ? 'alert' : undefined}>
            {storageError ??
              (storageStats
                ? `Total: ${formatBytes(storageStats.databaseBytes + storageStats.thumbnails.sizeBytes + storageStats.models.sizeBytes)}. Your photos aren’t included.`
                : 'Calculating storage use…')}
          </p>
        }
      >
        <FolderRow
          icon={<IconDatabase size={18} />}
          label="Database"
          path={folders?.database}
          size={
            storageStats
              ? formatBytes(storageStats.databaseBytes)
              : storageError
                ? 'Unavailable'
                : 'Calculating…'
          }
        />
        <FolderRow
          icon={<IconPhoto size={18} />}
          label="Thumbnails"
          path={folders?.thumbnails}
          size={
            thumbnailStats === null
              ? storageError
                ? 'Unavailable'
                : 'Calculating…'
              : `${formatBytes(thumbnailStats.sizeBytes)} · ${thumbnailStats.fileCount.toLocaleString()} ${
                  thumbnailStats.fileCount === 1 ? 'file' : 'files'
                }`
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={(thumbnailStats?.fileCount ?? 0) === 0}
            isLoading={isClearingThumbnails}
            onClick={() => setClearThumbnailsConfirmOpen(true)}
          >
            <IconTrash size={16} /> Clear
          </Button>
        </FolderRow>
        <SettingsRow
          icon={<IconSparkles size={18} />}
          label="Search models"
          description={
            storageStats
              ? `${formatBytes(storageStats.models.sizeBytes)} · ${storageStats.models.modelCount} ${
                  storageStats.models.modelCount === 1 ? 'model' : 'models'
                } on disk`
              : storageError
                ? 'Unavailable'
                : 'Calculating…'
          }
        >
          <Button asChild variant="outline" size="sm">
            <Link to={AppRoutes.settingsModels}>Manage</Link>
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsButtonRow
          icon={<IconTrash size={18} className="text-destructive-text" />}
          label="Remove all data"
          description="Deletes the library database and thumbnails. Your photos and videos are never touched."
          buttonLabel="Remove all data"
          buttonVariant="destructive"
          onAction={() => {
            setDeleteAiModels(false);
            setConfirmOpen(true);
            void refreshDownloadedModels();
          }}
        />
      </SettingsGroup>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={(value) => !isWiping && setConfirmOpen(value)}
        icon={<IconTrash size={24} />}
        title="Remove all user data?"
        description="This deletes the Photokin database and every generated thumbnail. All indexed albums, tags and people will be lost, the app will restart, and this cannot be undone. Your original photos and videos on disk are never deleted or modified."
        confirmLabel="Remove all data"
        onConfirm={() => void handleRemoveAllData()}
        tone="destructive"
        isConfirming={isWiping}
        keepOpenOnConfirm
        content={
          hasDownloadedModels ? (
            <SettingsToggleRow
              label="Also delete downloaded AI models"
              checked={deleteAiModels}
              onCheckedChange={setDeleteAiModels}
              disabled={isWiping}
            />
          ) : undefined
        }
      />

      <ConfirmationDialog
        open={clearThumbnailsConfirmOpen}
        onOpenChange={(value) => !isClearingThumbnails && setClearThumbnailsConfirmOpen(value)}
        icon={<IconTrash size={24} />}
        title="Clear thumbnail cache?"
        description={`Delete every generated thumbnail${
          thumbnailStats ? ` (${formatBytes(thumbnailStats.sizeBytes)})` : ''
        }. Photos, videos and library data stay as they are — thumbnails are recreated as you browse.`}
        confirmLabel="Clear cache"
        onConfirm={() => void handleClearThumbnails()}
        isConfirming={isClearingThumbnails}
        keepOpenOnConfirm
      />
    </>
  );
}
