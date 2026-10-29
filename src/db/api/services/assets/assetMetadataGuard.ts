import { selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { MetadataStage } from '@/db/models/AssetDTO';
import { METADATA_SCAN_PENDING_MESSAGE } from '@/media/metadata/metadataScanState';

const IDS_PER_QUERY = 500;

/**
 * Prevents the initial metadata import from overwriting an edit made while an
 * asset is still at discovery stage (0). Stage 1 is safe: file metadata has
 * already been read and only reverse geocoding remains.
 */
export async function hasUnscannedMetadataAssets(ids: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(ids)];

  for (let index = 0; index < uniqueIds.length; index += IDS_PER_QUERY) {
    const chunk = uniqueIds.slice(index, index + IDS_PER_QUERY);
    const unscanned = await selectFromDB(
      kyselyDB
        .selectFrom('assets')
        .select('id')
        .where('id', 'in', chunk)
        .where('metadataStage', '=', MetadataStage.Discovered)
        .limit(1),
    );

    if (unscanned.length > 0) {
      return true;
    }
  }

  return false;
}

export async function assertAssetsMetadataScanned(ids: string[]): Promise<void> {
  if (await hasUnscannedMetadataAssets(ids)) {
    throw new Error(METADATA_SCAN_PENDING_MESSAGE);
  }
}

/** Applies the same guard when a face-edit API starts from region ids. */
export async function assertRegionAssetsMetadataScanned(regionIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(regionIds)];

  for (let index = 0; index < uniqueIds.length; index += IDS_PER_QUERY) {
    const chunk = uniqueIds.slice(index, index + IDS_PER_QUERY);
    const unscanned = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select('tagRegionInfo.id')
        .where('tagRegionInfo.id', 'in', chunk)
        .where('assets.metadataStage', '=', MetadataStage.Discovered)
        .limit(1),
    );

    if (unscanned.length > 0) {
      throw new Error(METADATA_SCAN_PENDING_MESSAGE);
    }
  }
}
