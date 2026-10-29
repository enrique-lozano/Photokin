import { ConfirmationDialog, ConfirmationOptions } from '@/components/ui/confirmation-dialog';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { geocodePendingLocations } from '@/media/import/importPipeline';
import { ProcessReporter, trackProcess } from '@/system/processTracker';
import { IconDatabaseImport, IconFileExport } from '@tabler/icons-react';
import { MetadataActionKind, useMetadataActionsDialog } from './metadataActionsStore';
import { ProcessKind } from '@/stores/processStore';

function _label(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

/** Turns an `assetId → message` failure map into filename-prefixed warnings. */
function _warningsFor(assets: AssetInClient[], failures: Map<string, string>): string[] {
  const nameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
  return [...failures].map(([id, message]) => `${nameById.get(id) ?? id}: ${message}`);
}

async function _runReload(assets: AssetInClient[]): Promise<void> {
  await trackProcess(
    {
      kind: ProcessKind.Generic,
      title: 'Reloading metadata',
      progress: 0,
      successMessage: (result: { reloaded: number; warnings: string[] }) =>
        `Reloaded metadata for ${_label(result.reloaded)}`,
      getWarnings: (result) => result.warnings,
    },
    async (reporter: ProcessReporter) => {
      const { reloaded, failures } = await AssetsService.reloadMetadataForAssets(
        assets.map((asset) => ({ id: asset.id, fullPath: asset.fullPath })),
        (processed, total) => reporter.setProgress(processed, total),
        { place: 'defer' },
      );
      await geocodePendingLocations(reporter);
      return { reloaded, warnings: _warningsFor(assets, failures) };
    },
  );
}

async function _runWrite(assets: AssetInClient[]): Promise<void> {
  await trackProcess(
    {
      kind: ProcessKind.Generic,
      title: 'Writing metadata to files',
      progress: 0,
      successMessage: (result: { written: number; warnings: string[] }) =>
        `Wrote metadata to ${_label(result.written)}`,
      getWarnings: (result) => result.warnings,
    },
    async (reporter: ProcessReporter) => {
      const { written, failures } = await AssetsService.writeCurrentMetadataToFiles(
        assets.map((asset) => asset.id),
        (processed, total) => reporter.setProgress(processed, total),
      );
      return { written, warnings: _warningsFor(assets, failures) };
    },
  );
}

function _copyFor(kind: MetadataActionKind, count: number): ConfirmationOptions {
  if (kind === 'write') {
    return {
      icon: <IconFileExport size={24} />,
      title: `Write metadata to ${_label(count)}?`,
      description:
        "Photokin rewrites the embedded metadata (orientation, title, description, rating, camera) of the selected originals to match its database. This can't be undone.",
      confirmLabel: 'Write metadata',
      tone: 'warning',
      fileMetadataImpact: 'explicit',
    };
  }

  return {
    icon: <IconDatabaseImport size={24} />,
    title: `Reload metadata from ${_label(count)}?`,
    description:
      'Photokin re-reads the selected files from disk and refreshes their title, description, rating, tags and faces. The files are not modified, but in-app edits that were never written back are overwritten.',
    confirmLabel: 'Reload metadata',
    tone: 'warning',
  };
}

/** Global host: mounted once in the app shell, driven by {@link useMetadataActionsDialog}. */
export function MetadataActionsDialog() {
  const open = useMetadataActionsDialog((state) => state.open);
  const kind = useMetadataActionsDialog((state) => state.kind);
  const assets = useMetadataActionsDialog((state) => state.assets);
  const close = useMetadataActionsDialog((state) => state.close);

  const copy = _copyFor(kind, assets.length);

  const handleConfirm = () => {
    const snapshot = assets;
    close();
    // Fire-and-forget: the process center surfaces progress and the result toast.
    void (kind === 'write' ? _runWrite(snapshot) : _runReload(snapshot));
  };

  return (
    <ConfirmationDialog
      {...copy}
      open={open}
      onOpenChange={(value) => !value && close()}
      onConfirm={handleConfirm}
    />
  );
}
