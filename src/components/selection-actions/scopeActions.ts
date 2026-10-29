import { trackBulkAction } from '@/components/bulk-action/trackBulkAction';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { removePhotosFromPersonWithUndo } from '@/pages/people/faceMutations';
import type { BulkOutcome } from '@/system/bulkOutcome';
import type { GalleryScope } from './galleryScope';
import { personRegionIds } from './selectionMenuItems';

function _photosLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'}`;
}

async function _removeTag(
  assets: AssetInClient[],
  tagId: string,
  onFileProgress: (processed: number, total: number) => void,
): Promise<BulkOutcome> {
  const assetIds = assets.map((asset) => asset.id);
  const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
  const beforeByAsset = await AssetsService.getTagIdsByAsset(assetIds);
  const { updated, fileFailures } = await AssetsService.updateAssetsTags(
    { assetIds, addTagIds: [], removeTagIds: [tagId] },
    onFileProgress,
  );
  const changed = assetIds.filter((id) => beforeByAsset.get(id)?.has(tagId));

  return {
    total: updated,
    fileCount: updated,
    fileFailures: [...fileFailures].map(([id, message]) => ({
      id,
      label: filenameById.get(id) ?? id,
      reason: `could not write to file (${message})`,
    })),
    undo:
      changed.length === 0
        ? undefined
        : () =>
            AssetsService.restoreAssetsTags(
              changed.map((id) => {
                const before = [...(beforeByAsset.get(id) ?? [])];
                return { id, beforeTagIds: before, expectedTagIds: before.filter((tag) => tag !== tagId) };
              }),
            ).then((failures) => {
              if (failures.size > 0) throw new Error([...failures.values()].join('; '));
            }),
  };
}

/** Takes the selected photos out of the page's scope (a person's or a tag's photos). */
export function removeFromScope(scope: GalleryScope, assets: AssetInClient[]): void {
  if (scope.kind === 'person') {
    void removePhotosFromPersonWithUndo(
      personRegionIds(
        scope,
        assets.map((asset) => asset.id),
      ),
      scope.personName,
    );
    return;
  }

  void trackBulkAction({
    title: `Removing tag “${scope.tagName}”`,
    summary: (outcome) => `Removed “${scope.tagName}” from ${_photosLabel(outcome.total)}`,
    run: (onFileProgress) => _removeTag(assets, scope.tagId, onFileProgress),
  }).catch(() => {
    // The process tracker already surfaced the error toast + state.
  });
}
