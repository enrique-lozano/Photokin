import { trackBulkAction } from '@/components/bulk-action/trackBulkAction';
import { showMetadataUndoToast } from '@/components/metadataUndo';
import { describeFileWriteFailures } from '@/db/api/services/assets/tagFileWrites';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import type { TagRegionInfoDTO } from '@/db/models/TagRegionInfoDTO';
import { breakUpSuggestedFaceGroup, forgetBrokenUpFaceGroup } from '@/media/faces/dismissedFaceClusters';
import type { BulkOutcome } from '@/system/bulkOutcome';

/** Reports how many of the affected files have been written so far. */
type FileProgress = (processed: number, total: number) => void;

function _sameState(a: TagRegionInfoDTO, b: TagRegionInfoDTO): boolean {
  return (
    (a.tagId ?? null) === (b.tagId ?? null) &&
    (a.clusterId ?? null) === (b.clusterId ?? null) &&
    a.confirmed === b.confirmed &&
    a.faceStatus === b.faceStatus
  );
}

/**
 * Puts the affected faces back in the state captured in `before`, refusing to
 * run once someone has edited them again in the meantime.
 */
async function _restoreFaceStates(
  before: TagRegionInfoDTO[],
  after: TagRegionInfoDTO[],
  createdPersonId?: string,
): Promise<void> {
  const current = new Map(
    (await RegionsService.getRegionsByIds(after.map((row) => row.id))).map((row) => [row.id, row]),
  );
  if (
    after.some((expected) => !current.has(expected.id) || !_sameState(current.get(expected.id)!, expected))
  ) {
    throw new Error('One or more faces were edited again after this change');
  }

  await RegionsService.restoreRegionStates(before);
  if (createdPersonId) {
    const [assetCount, regionCount] = await Promise.all([
      TagsService.getAssetCount(createdPersonId),
      TagsService.getFaceRegionCount(createdPersonId),
    ]);
    if (assetCount === 0 && regionCount === 0) await TagsService.delete(createdPersonId);
  }
}

function _showFaceStateUndo(
  summary: string,
  before: TagRegionInfoDTO[],
  after: TagRegionInfoDTO[],
  createdPersonId?: string,
): void {
  showMetadataUndoToast(summary, () => _restoreFaceStates(before, after, createdPersonId));
}

export async function assignFacesWithUndo(regionIds: string[], tagId: string): Promise<void> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  await RegionsService.assignRegionsToPerson(regionIds, tagId, { confirm: true });
  const after = await RegionsService.getRegionsByIds(regionIds);
  _showFaceStateUndo(after.length === 1 ? 'Face assigned' : `${after.length} faces assigned`, before, after);
}

export async function createPersonFromFacesWithUndo(regionIds: string[], name: string): Promise<void> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const person = await RegionsService.createPersonFromRegions(name, regionIds, { confirm: true });
  const after = await RegionsService.getRegionsByIds(regionIds);
  _showFaceStateUndo(`Created ${person.name}`, before, after, person.id);
}

/** Assigns faces with structured per-file results for an owning review dialog. */
export async function assignFaces(
  regionIds: string[],
  tagId: string,
  onFileProgress?: FileProgress,
): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const fileFailures = await RegionsService.assignRegionsToPersonWithOutcome(regionIds, tagId, {
    confirm: true,
    onFileProgress,
  });
  const after = await RegionsService.getRegionsByIds(regionIds);

  return {
    total: after.length,
    fileCount: new Set(after.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after),
  };
}

/** Creates a person from faces with structured per-file results. */
export async function createPersonFromFaces(
  regionIds: string[],
  name: string,
  onFileProgress?: FileProgress,
): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const { person, fileFailures } = await RegionsService.createPersonFromRegionsWithOutcome(name, regionIds, {
    confirm: true,
    onFileProgress,
  });
  const after = await RegionsService.getRegionsByIds(regionIds);

  return {
    total: after.length,
    fileCount: new Set(after.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after, person.id),
  };
}

/**
 * Confirms suggested faces and reports per-file write problems in its result
 * rather than throwing: the library change stands even when a file stays stale,
 * so the caller decides where to show that — an in-dialog panel while a review
 * modal is open, a result toast otherwise.
 */
export async function confirmFaces(regionIds: string[], onFileProgress?: FileProgress): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const fileFailures = await RegionsService.confirmRegions(regionIds, onFileProgress);
  const after = await RegionsService.getRegionsByIds(regionIds);

  return {
    total: after.length,
    fileCount: new Set(after.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after),
  };
}

/** Marks the given detections as not faces; their boxes remain to block rescans. */
export async function discardFaces(regionIds: string[], onFileProgress?: FileProgress): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const fileFailures = await RegionsService.rejectRegions(regionIds, onFileProgress);
  const after = await RegionsService.getRegionsByIds(regionIds);

  return {
    total: before.length || regionIds.length,
    fileCount: new Set(before.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after),
  };
}

/**
 * Unlinks suggested faces from their person so they wait in the unverified
 * faces again. Suggestions are never written to files, so there is none to update.
 */
export async function dismissSuggestions(regionIds: string[]): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  await RegionsService.clearUnconfirmedAssignments(regionIds);
  const after = await RegionsService.getRegionsByIds(regionIds);
  return {
    total: before.length,
    fileCount: 0,
    fileFailures: [],
    undo: () => _restoreFaceStates(before, after),
  };
}

export async function hideFaces(regionIds: string[], onFileProgress?: FileProgress): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const fileFailures = await RegionsService.hideRegions(regionIds, onFileProgress);
  const after = await RegionsService.getRegionsByIds(regionIds);
  return {
    total: before.length,
    fileCount: new Set(before.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after),
  };
}

/**
 * {@link confirmFaces} for the entry points with no surface of their own, e.g.
 * the suggestion banner's "Accept all" — which is itself removed from the page
 * the moment the library commits, so the progress has to live elsewhere.
 *
 * Both of these resolve even on failure: the process center has already shown
 * the error, and a second toast from the caller would only repeat it.
 */
export async function confirmFacesWithUndo(regionIds: string[]): Promise<void> {
  await trackBulkAction({
    title: 'Confirming faces',
    summary: (outcome) =>
      `Confirmed ${outcome.total.toLocaleString()} ${outcome.total === 1 ? 'face' : 'faces'}`,
    run: (onFileProgress) => confirmFaces(regionIds, onFileProgress),
  }).catch(() => {});
}

export async function discardFacesWithReceipt(regionIds: string[]): Promise<void> {
  if (regionIds.length === 0) return;

  await trackBulkAction({
    title: 'Discarding faces',
    summary: (outcome) =>
      outcome.total === 1 ? 'Face discarded' : `${outcome.total.toLocaleString()} faces discarded`,
    run: (onFileProgress) => discardFaces(regionIds, onFileProgress),
  }).catch(() => {});
}

/**
 * {@link dismissSuggestions} for the Suggested faces page's "Dismiss all",
 * which clears the page it is on and so has nowhere of its own to report.
 */
export async function dismissSuggestionsWithUndo(regionIds: string[]): Promise<void> {
  if (regionIds.length === 0) return;
  await trackBulkAction({
    title: 'Dismissing suggestions',
    summary: (outcome) =>
      outcome.total === 1
        ? 'Suggestion dismissed'
        : `${outcome.total.toLocaleString()} suggestions dismissed`,
    run: () => dismissSuggestions(regionIds),
  }).catch(() => {});
}

/** {@link breakUpSuggestedFaceGroup} with an undo that restores the group. */
export async function breakUpFaceGroup(regionIds: string[]): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  await breakUpSuggestedFaceGroup(regionIds);
  const after = await RegionsService.getRegionsByIds(regionIds);
  return {
    total: before.length,
    fileCount: 0,
    fileFailures: [],
    undo: async () => {
      await _restoreFaceStates(before, after);
      await forgetBrokenUpFaceGroup(regionIds);
    },
  };
}

export async function hideFacesWithUndo(regionIds: string[]): Promise<void> {
  if (regionIds.length === 0) return;
  await trackBulkAction({
    title: 'Ignoring faces',
    summary: (outcome) =>
      outcome.total === 1 ? 'Face ignored' : `${outcome.total.toLocaleString()} faces ignored`,
    run: (onFileProgress) => hideFaces(regionIds, onFileProgress),
  }).catch(() => {});
}

/** Unlinks faces from their person; the faces wait in Unknown faces again. */
export async function unassignFaces(
  regionIds: string[],
  onFileProgress?: FileProgress,
): Promise<BulkOutcome> {
  const before = await RegionsService.getRegionsByIds(regionIds);
  const fileFailures = await RegionsService.unassignRegions(regionIds, onFileProgress);
  const after = await RegionsService.getRegionsByIds(regionIds);
  return {
    total: before.length,
    fileCount: new Set(before.map((row) => row.assetId)).size,
    fileFailures: await describeFileWriteFailures(fileFailures),
    undo: () => _restoreFaceStates(before, after),
  };
}

/** {@link unassignFaces} for a person's photo selection, reported per photo. */
export async function removePhotosFromPersonWithUndo(regionIds: string[], personName: string): Promise<void> {
  if (regionIds.length === 0) return;
  await trackBulkAction({
    title: `Removing photos from ${personName}`,
    summary: (outcome) =>
      `Removed ${outcome.fileCount.toLocaleString()} ${outcome.fileCount === 1 ? 'photo' : 'photos'} from ${personName}`,
    run: (onFileProgress) => unassignFaces(regionIds, onFileProgress),
  }).catch(() => {});
}

export async function restoreHiddenFacesWithUndo(regionIds: string[]): Promise<void> {
  if (regionIds.length === 0) return;
  const before = await RegionsService.getRegionsByIds(regionIds);
  await RegionsService.restoreHiddenRegions(regionIds);
  const after = await RegionsService.getRegionsByIds(regionIds);
  _showFaceStateUndo(
    after.length === 1 ? 'Face returned for review' : `${after.length.toLocaleString()} faces returned`,
    before,
    after,
  );
}
