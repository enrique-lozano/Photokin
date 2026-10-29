import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import {
  isMetadataWriteEnabled,
  shouldWriteBackOnSync,
} from '@/media/metadata/exiftool/write/metadataWritePolicy';
import { writeKeywordsToFiles } from '@/media/metadata/exiftool/write/write-keywords';
import type { BulkItemFailure } from '@/system/bulkOutcome';
import { TagsService } from '../tags.service';
import { assertAssetsMetadataScanned } from './assetMetadataGuard';
import { getByUUID } from './assetQueries';
import { keywordTagIdsByAsset, refreshFileTracking } from './assetRows';

/**
 * Mirrors each asset's current keyword set into its original file, including an
 * empty set (which clears embedded keywords). `readonly` never touches a file;
 * "on sync" queues the assets; "immediately" writes now. Disk failures do not
 * roll back the library edit — they are returned as `assetId → message`.
 */
export async function writeKeywordsForAssets(
  assetIds: string[],
  onFileProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const fileFailures = new Map<string, string>();
  const uniqueIds = [...new Set(assetIds)];
  if (uniqueIds.length === 0) return fileFailures;

  await assertAssetsMetadataScanned(uniqueIds);

  if (!isMetadataWriteEnabled()) return fileFailures;

  if (shouldWriteBackOnSync()) {
    await executeInDB(
      kyselyDB.updateTable('assets').set({ pendingFileWrite: 1 }).where('id', 'in', uniqueIds),
      'assets',
    );
    return fileFailures;
  }

  const tagIds = await keywordTagIdsByAsset(uniqueIds);
  const fullPathByTagId = new Map((await TagsService.getAll()).map((tag) => [tag.id, tag.fullPath]));
  const entries: { id: string; fullPath: string; tagPaths: string[] }[] = [];

  for (const id of uniqueIds) {
    try {
      const asset = await getByUUID(id);
      const tagPaths = [...(tagIds.get(id) ?? [])]
        .map((tagId) => fullPathByTagId.get(tagId))
        .filter((path): path is string => path != null);
      entries.push({ id, fullPath: asset.fullPath, tagPaths });
    } catch (error) {
      fileFailures.set(id, `could not resolve file (${String(error)})`);
    }
  }

  const pathFailures = await writeKeywordsToFiles(
    entries.map(({ fullPath, tagPaths }) => ({ fullPath, tagPaths })),
    onFileProgress,
  );

  for (const entry of entries) {
    const failure = pathFailures.get(entry.fullPath);
    if (failure) fileFailures.set(entry.id, failure);
    else await refreshFileTracking(entry.id, entry.fullPath);
  }

  return fileFailures;
}

/** Resolves a per-asset file-write failure map into the shared bulk failure rows. */
export async function describeFileWriteFailures(
  fileFailures: Map<string, string>,
): Promise<BulkItemFailure[]> {
  if (fileFailures.size === 0) return [];

  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .select(['id', 'filename'])
      .where('id', 'in', [...fileFailures.keys()]),
  );
  const filenameById = new Map(rows.map((row) => [row.id, row.filename]));

  return [...fileFailures].map(([id, message]) => ({
    id,
    label: filenameById.get(id) ?? id,
    reason: `could not write to file (${message})`,
  }));
}
