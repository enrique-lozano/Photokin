import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AssetInClient } from '@/db/models/AssetInClient';
import { trackProcess } from '@/system/processTracker';
import { IconUserOff } from '@tabler/icons-react';
import { useRemoveFaceDataDialog } from './removeFaceDataDialogStore';
import { ProcessKind } from '@/stores/processStore';

function _photosLabel(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

function _facesLabel(count: number): string {
  return `${count} ${count === 1 ? 'face' : 'faces'}`;
}

async function _run(assets: AssetInClient[]): Promise<void> {
  const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
  await trackProcess(
    {
      kind: ProcessKind.Generic,
      title: `Removing face data · ${_photosLabel(assets.length)}`,
      progress: 0,
      successMessage: () => `Removed face data from ${_photosLabel(assets.length)}`,
      getWarnings: (result: { warnings: string[] }) => result.warnings,
    },
    async (reporter) => {
      const { fileFailures } = await AssetsService.removeFaceData(assets, (processed, total) =>
        reporter.setProgress(processed, total),
      );

      return {
        warnings: [...fileFailures].map(
          ([id, message]) => `${filenameById.get(id) ?? id}: could not update file (${message})`,
        ),
      };
    },
  );
}

/** Confirms removal of all face data from the selected photos. */
export function RemoveFaceDataDialog() {
  const open = useRemoveFaceDataDialog((state) => state.open);
  const assets = useRemoveFaceDataDialog((state) => state.assets);
  const close = useRemoveFaceDataDialog((state) => state.close);

  const { data: faceCount } = useLiveQuery(
    async () => {
      if (!open) return 0;
      const counts = await RegionsService.getRegionCountsForAssets(assets.map((asset) => asset.id));
      return [...counts.values()].reduce((sum, n) => sum + n, 0);
    },
    ['tagRegionInfo'],
    { extDependencies: [open, assets] },
  );

  const count = faceCount ?? 0;

  const handleConfirm = () => {
    const snapshotAssets = [...assets];
    close();
    void _run(snapshotAssets).catch(() => {
      // trackProcess already surfaced the failure toast.
    });
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(value) => !value && close()}
      icon={<IconUserOff size={24} />}
      title={`Remove face data from ${_photosLabel(assets.length)}?`}
      description={
        count === 0
          ? `${assets.length === 1 ? 'This photo has' : 'These photos have'} no detected faces to remove.`
          : `Permanently delete ${_facesLabel(count)} and their recognition data from ${_photosLabel(assets.length)}, including assigned people. Photo files stay on disk.`
      }
      confirmLabel="Remove face data"
      onConfirm={handleConfirm}
      tone="destructive"
      fileMetadataImpact={count > 0 ? 'automatic' : undefined}
      confirmDisabled={count === 0}
    />
  );
}
