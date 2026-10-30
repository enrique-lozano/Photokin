import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { TRASHED_ONLY_QUERY } from '@/common/trashQuery';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useAppStore } from '@/stores/appState';
import { trackProcess } from '@/system/processTracker';
import {
  deleteTrashedAssetsPermanently,
  emptyTrash,
  moveAssetsToTrash,
  restoreAssetsFromTrash,
  TRASH_RETENTION_DAYS,
  type TrashFailure,
} from '@/system/trash';
import { IconRestore, IconTrash } from '@tabler/icons-react';
import { useTrashDialog, type TrashDialogMode } from './trashDialogStore';
import { ProcessKind } from '@/stores/processStore';

function _label(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'}`;
}

function _failureWarnings(failures: TrashFailure[]): string[] | undefined {
  if (failures.length === 0) return undefined;
  return [
    `${failures.length} file(s) could not be processed`,
    ...failures.map((failure) => `${failure.filename}: ${failure.reason}`),
  ];
}

function _copyFor(mode: TrashDialogMode, count: number) {
  switch (mode) {
    case 'restore':
      return {
        title: `Restore ${_label(count)}?`,
        description: "They'll be moved back to their original folders.",
        confirmLabel: 'Restore',
        destructive: false,
        icon: <IconRestore size={24} />,
      };
    case 'delete':
      return {
        title: `Permanently delete ${_label(count)}?`,
        description: "This can't be undone — the files will be removed from your device.",
        confirmLabel: 'Delete permanently',
        destructive: true,
        icon: <IconTrash size={24} />,
      };
    case 'empty':
      return {
        title: 'Empty Trash?',
        description: `Permanently delete all ${_label(count)} in Trash. This can't be undone.`,
        confirmLabel: 'Empty Trash',
        destructive: true,
        icon: <IconTrash size={24} />,
      };
    case 'trash':
    default:
      return {
        title: `Move ${_label(count)} to Trash?`,
        description: `Items in Trash are recoverable for ${TRASH_RETENTION_DAYS} days, then they're deleted automatically.`,
        confirmLabel: 'Move to Trash',
        destructive: true,
        icon: <IconTrash size={24} />,
      };
  }
}

async function _run(mode: TrashDialogMode, assets: AssetInClient[]): Promise<void> {
  if (mode === 'trash') {
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Moving to Trash',
        message: `Moving ${_label(assets.length)} to Trash…`,
        successMessage: (result) => `Moved ${_label(result.trashedIds.length)} to Trash`,
        errorMessage: (error) => `Could not move to Trash: ${String(error)}`,
        getWarnings: (result) => _failureWarnings(result.failures),
      },
      () =>
        moveAssetsToTrash(
          assets.map((asset) => ({ id: asset.id, filename: asset.filename, fullPath: asset.fullPath })),
        ),
    );
    return;
  }

  if (mode === 'restore') {
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Restoring from Trash',
        message: `Restoring ${_label(assets.length)}…`,
        successMessage: (result) => `Restored ${_label(result.restoredIds.length)}`,
        errorMessage: (error) => `Could not restore: ${String(error)}`,
        getWarnings: (result) => _failureWarnings([...result.skipped, ...result.failures]),
      },
      () => restoreAssetsFromTrash(assets),
    );
    return;
  }

  if (mode === 'delete') {
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Deleting permanently',
        message: `Permanently deleting ${_label(assets.length)}…`,
        successMessage: (result) => `Permanently deleted ${_label(result.deletedIds.length)}`,
        errorMessage: (error) => `Could not delete: ${String(error)}`,
        getWarnings: (result) => _failureWarnings(result.failures),
      },
      () =>
        deleteTrashedAssetsPermanently(assets.map((asset) => ({ id: asset.id, filename: asset.filename }))),
    );
    return;
  }

  await trackProcess(
    {
      kind: ProcessKind.Generic,
      title: 'Emptying Trash',
      message: 'Emptying Trash…',
      successMessage: (result) => `Trash emptied · ${_label(result.deletedIds.length)}`,
      errorMessage: (error) => `Could not empty Trash: ${String(error)}`,
      getWarnings: (result) => _failureWarnings(result.failures),
    },
    () => emptyTrash(),
  );
}

/**
 * Single confirmation dialog for every Trash action (move to Trash, restore,
 * delete permanently, empty Trash), driven by {@link useTrashDialog}. Mounted
 * once in the app shell; its `z-index` sits above the fullscreen lightbox.
 */
export function TrashConfirmDialog() {
  const open = useTrashDialog((state) => state.open);
  const mode = useTrashDialog((state) => state.mode);
  const assets = useTrashDialog((state) => state.assets);
  const note = useTrashDialog((state) => state.note);
  const hide = useTrashDialog((state) => state.hide);
  const settle = useTrashDialog((state) => state.settle);
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);

  // The whole-Trash "empty" action shows a live count rather than a selection.
  const { data: trashedCount } = useLiveQuery(
    () =>
      mode === 'empty' && open
        ? AssetsService.getCount({ searchQuery: TRASHED_ONLY_QUERY })
        : Promise.resolve(0),
    ['assets'],
    { extDependencies: [mode, open] },
  );

  const count = mode === 'empty' ? (trashedCount ?? 0) : assets.length;
  const copy = _copyFor(mode, count);

  const handleConfirm = () => {
    const snapshotMode = mode;
    const snapshotAssets = [...assets];

    hide();
    if (snapshotMode !== 'empty') {
      setSelectedImages([]);
    }

    void _run(snapshotMode, snapshotAssets)
      .then(() => settle('completed'))
      .catch(() => {
        // trackProcess already surfaced the failure toast.
        settle('failed');
      });
  };

  return (
    <ConfirmationDialog
      open={open}
      // Radix also reports a close right after the confirm click; `hide()` has already run by then.
      onOpenChange={(value) => !value && useTrashDialog.getState().open && settle('cancelled')}
      icon={copy.icon}
      title={copy.title}
      description={`${note ? `${note} ` : ''}${copy.description}`}
      confirmLabel={copy.confirmLabel}
      onConfirm={handleConfirm}
      tone={copy.destructive ? 'destructive' : 'default'}
      confirmDisabled={count === 0}
    />
  );
}
