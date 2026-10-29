import {
  rateAssets,
  removeFaceData,
  restoreAssetsTags,
  rotateAssets,
  updateAssetEditableFields,
  updateAssetsCaptureDate,
  updateAssetsEditableFields,
  updateAssetsLocation,
  saveAssetLocationToFile,
  updateAssetsTags,
} from './assets/assetEdits';
import {
  flushPendingFileWrites,
  getPendingFileWriteCount,
  writeCurrentMetadataToFiles,
} from './assets/assetFileWrites';
import { getExposureHistograms } from './assets/assetFilterFacets';
import {
  applyDeferredLocations,
  getPendingMetadataAssets,
  getPendingMetadataCount,
  insertDiscoveredFiles,
  insertFilesByPaths,
  moveAssetToAlbum,
  updateFileTracking,
} from './assets/assetImport';
import { hasUnscannedMetadataAssets } from './assets/assetMetadataGuard';
import {
  getAdjacentFile,
  getAlbumFileIndex,
  getByUUID,
  getCount,
  getCountsWithin,
  getDateRange,
  getFileCountByDay,
  getFileCountByLocation,
  getFileCountByMonth,
  getFileCountByPlace,
  getFileCountByYear,
  getFiles,
  getScopedAssetIds,
  getTopPeopleInScope,
  getTopPlacesInScope,
} from './assets/assetQueries';
import { reloadMetadataForAsset, reloadMetadataForAssets } from './assets/assetReload';
import { tagIdsByAsset } from './assets/assetRows';
import {
  getApertureDistribution,
  getFocalLengthDistribution,
  getIsoDistribution,
  getRatingDistribution,
  getShutterSpeedDistribution,
  getStatsOverview,
  getTopApertures,
  getTopCameraBodies,
  getTopFlashValues,
  getTopFocalLengths,
  getTopIso,
  getTopLenses,
  getTopShutterSpeeds,
  getTopWhiteBalances,
} from './assets/assetStatsQueries';
import { getTrashedAssetRefs, setAssetsTrashed } from './assets/assetTrash';

export type {
  AlbumFileIndexEntry,
  AssetDateField,
  FileReadyToProcess,
  FileTrackingStat,
  PendingMetadataAsset,
  ScopeParams,
  ScopePlace,
  StatsCountBucket,
  StatsNumericBucket,
  StatsOverview,
  StatsRatingBucket,
  TrashedAssetRef,
} from './assets/assetTypes';

/**
 * Everything the app does with assets, grouped by concern in `./assets/`:
 * reads (`assetQueries`), ingestion (`assetImport`), re-reading files
 * (`assetReload`), user edits (`assetEdits`), explicit file write-back
 * (`assetFileWrites`) and the trash flag (`assetTrash`).
 */
export const AssetsService = {
  getByUUID,
  getFiles,
  getScopedAssetIds,
  getAdjacentFile,
  getCount,
  getCountsWithin,
  getDateRange,
  getFileCountByDay,
  getFileCountByMonth,
  getFileCountByYear,
  getFileCountByLocation,
  getFileCountByPlace,
  getTopPeopleInScope,
  getTopPlacesInScope,
  getStatsOverview,
  getTopCameraBodies,
  getTopLenses,
  getTopWhiteBalances,
  getTopFlashValues,
  getTopIso,
  getIsoDistribution,
  getFocalLengthDistribution,
  getApertureDistribution,
  getShutterSpeedDistribution,
  getTopFocalLengths,
  getTopApertures,
  getTopShutterSpeeds,
  getRatingDistribution,
  getAlbumFileIndex,
  getTagIdsByAsset: tagIdsByAsset,

  insertFilesByPaths,
  insertDiscoveredFiles,
  getPendingMetadataAssets,
  getPendingMetadataCount,
  applyDeferredLocations,
  updateFileTracking,
  moveAssetToAlbum,

  reloadMetadataForAsset,
  reloadMetadataForAssets,

  updateAssetEditableFields,
  updateAssetsEditableFields,
  rateAssets,
  restoreAssetsTags,
  rotateAssets,
  updateAssetsCaptureDate,
  updateAssetsLocation,
  saveAssetLocationToFile,
  updateAssetsTags,
  removeFaceData,
  hasUnscannedMetadataAssets,

  writeCurrentMetadataToFiles,
  flushPendingFileWrites,
  getPendingFileWriteCount,

  setAssetsTrashed,
  getTrashedAssetRefs,

  getExposureHistograms,
};
