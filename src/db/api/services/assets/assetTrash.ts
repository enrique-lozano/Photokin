import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { useAppStore } from '@/stores/appState';
import { TrashedAssetRef } from './assetTypes';

/**
 * Flags (or un-flags) assets as trashed. Passing an ISO timestamp moves them into
 * Trash; passing `null` restores them. Only the flag is touched here — the caller
 * is responsible for the on-disk file move.
 */
export async function setAssetsTrashed(ids: string[], trashedAt: string | null): Promise<void> {
  if (ids.length === 0) return;

  await executeInDB(kyselyDB.updateTable('assets').set({ trashedAt }).where('id', 'in', ids), 'assets');

  useAppStore.getState().markAssetChanged(ids);
}

/**
 * Lightweight identity of every trashed asset (optionally only those trashed
 * before `before`, used by the retention purge). Enough to locate the file in the
 * Trash folder and drop the row, without building full asset models.
 */
export async function getTrashedAssetRefs(params?: { before?: string }): Promise<TrashedAssetRef[]> {
  let query = kyselyDB
    .selectFrom('assets')
    .select(['id', 'filename', 'trashedAt'])
    .where('trashedAt', 'is not', null);

  if (params?.before) {
    query = query.where('trashedAt', '<', params.before);
  }

  const rows = await selectFromDB(query);

  return rows
    .filter((row): row is { id: string; filename: string; trashedAt: string } => row.trashedAt !== null)
    .map((row) => ({ id: row.id, filename: row.filename, trashedAt: row.trashedAt }));
}
