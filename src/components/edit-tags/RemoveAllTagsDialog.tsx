import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import { useBulkActionDialog } from '@/components/bulk-action/useBulkActionDialog';
import { Button } from '@/components/ui/button';
import { MetadataImpactNotice } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AssetsService } from '@/db/api/services/assets.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AssetInClient } from '@/db/models/AssetInClient';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { IconTagOff } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useRemoveAllTagsDialog } from './removeAllTagsDialogStore';

function _photosLabel(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

function _keywordsLabel(count: number): string {
  return `${count} ${count === 1 ? 'keyword' : 'keywords'}`;
}

async function _run(
  assets: AssetInClient[],
  removeTagIds: string[],
  onFileProgress: (processed: number, total: number) => void,
): Promise<BulkOutcome> {
  const assetIds = assets.map((asset) => asset.id);
  const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
  const beforeByAsset = await AssetsService.getTagIdsByAsset(assetIds);
  const { updated, fileFailures } = await AssetsService.updateAssetsTags(
    { assetIds, addTagIds: [], removeTagIds },
    onFileProgress,
  );
  const afterByAsset = await AssetsService.getTagIdsByAsset(assetIds);
  const changedAssets = assets.filter((asset) => {
    const before = [...(beforeByAsset.get(asset.id) ?? [])].sort();
    const after = [...(afterByAsset.get(asset.id) ?? [])].sort();
    return JSON.stringify(before) !== JSON.stringify(after);
  });

  return {
    total: updated,
    fileCount: updated,
    fileFailures: [...fileFailures].map(([id, message]) => ({
      id,
      label: filenameById.get(id) ?? id,
      reason: `could not write to file (${message})`,
    })),
    undo:
      changedAssets.length === 0
        ? undefined
        : () =>
            AssetsService.restoreAssetsTags(
              changedAssets.map((asset) => ({
                id: asset.id,
                beforeTagIds: [...(beforeByAsset.get(asset.id) ?? [])],
                expectedTagIds: [...(afterByAsset.get(asset.id) ?? [])],
              })),
            ).then((failures) => {
              if (failures.size > 0) throw new Error([...failures.values()].join('; '));
            }),
  };
}

/**
 * Confirmation for the "Remove all tags" selection action, driven by
 * {@link useRemoveAllTagsDialog}. Mounted once in the app shell. Confirming
 * strips every keyword currently on the selection without opening the tag
 * editor.
 */
export function RemoveAllTagsDialog() {
  const open = useRemoveAllTagsDialog((state) => state.open);
  const assets = useRemoveAllTagsDialog((state) => state.assets);
  const close = useRemoveAllTagsDialog((state) => state.close);
  const bulkAction = useBulkActionDialog();
  const isRunning = bulkAction.phase.kind === 'running';

  useEffect(() => {
    if (open) bulkAction.reset();
  }, [open, bulkAction.reset]);

  // The keywords present on the selection are exactly the ones to remove.
  const { data: tagIds } = useLiveQuery(
    async () =>
      open ? [...(await TagsService.getTagCountsForAssets(assets.map((asset) => asset.id))).keys()] : [],
    ['fileTags'],
    { extDependencies: [open, assets] },
  );

  const tagCount = tagIds?.length ?? 0;

  const handleConfirm = async () => {
    const snapshotAssets = [...assets];
    const snapshotTagIds = [...(tagIds ?? [])];

    await bulkAction.run({
      label: 'Removing tags',
      summary: (outcome) => `Removed all tags from ${_photosLabel(outcome.total)}`,
      action: (onFileProgress) => _run(snapshotAssets, snapshotTagIds, onFileProgress),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !isRunning && close()}>
      <DialogContent className="w-[min(92vw,34rem)]" hideCloseButton={isRunning}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTagOff size={20} className="text-destructive-text" />
            Remove all tags
          </DialogTitle>
          <DialogDescription>
            {bulkAction.phase.kind === 'running'
              ? 'Removing keywords from the library and photo files.'
              : bulkAction.phase.kind === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : tagCount === 0
                  ? `${assets.length === 1 ? 'This photo has' : 'These photos have'} no tags to remove.`
                  : `Remove ${_keywordsLabel(tagCount)} from ${_photosLabel(assets.length)}.`}
          </DialogDescription>
        </DialogHeader>

        {bulkAction.phase.kind === 'result' ? (
          <BulkActionResultStep
            summary={bulkAction.phase.summary}
            outcome={bulkAction.phase.outcome}
            isUndoing={bulkAction.isUndoing}
            onUndo={() => void bulkAction.undo(close)}
            onDone={close}
          />
        ) : (
          <>
            <DialogBody>
              {bulkAction.phase.kind === 'edit' && tagCount > 0 && (
                <MetadataImpactNotice impact="automatic" showReadOnly />
              )}
            </DialogBody>
            <DialogFooter>
              {bulkAction.phase.kind === 'running' ? (
                <BulkActionProgress label={bulkAction.phase.label} progress={bulkAction.phase.progress} />
              ) : (
                <>
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleConfirm()}
                    disabled={tagCount === 0}
                  >
                    Remove all tags
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
