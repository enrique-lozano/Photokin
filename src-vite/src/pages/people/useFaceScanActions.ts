import { expandAlbumScope } from '@/common/albumScope';
import { SearchCondition, SearchQuery, SearchQueryType } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { isSupportedVideoPath } from '@/common/supportedFormats';
import { AlbumsService } from '@/db/api/services/albums.service';
import { AssetsService } from '@/db/api/services/assets.service';
import {
  describeRecognizeChanges,
  describeRecognizeResult,
  detectFaces,
  FACE_DETECTION_SIZES,
  FaceDetectSummary,
  FaceRecognitionOptions,
  FaceRecognizeSummary,
  recognizeFaces,
} from '@/media/faces/faceRecognition';
import { useFaceRunRateStore } from '@/stores/faceRunRateStore';
import { ProcessKind } from '@/stores/processStore';
import { useMemo } from 'react';
import { isProcessStopped } from '../../system/processCancellation';
import { trackProcess } from '../../system/processTracker';

/** A stopped scan still teaches the rate, once it has covered enough photos to be representative. */
const MIN_STOPPED_PHOTOS_TO_MEASURE = 500;

/** Which albums Find faces should cover. Empty `albumIds` means the whole library. */
export type ScanScope = {
  albumIds: string[];
  includeSubAlbums: boolean;
  /** Runs the unchanged pipeline over a random subset (used by Test run). */
  sampleSize?: number;
};

type FaceScanActions = {
  /** Detect, then recognize, the photos in scope. */
  findFaces: (options: FaceRecognitionOptions, scope?: ScanScope) => Promise<void>;
  /** Recognize every unverified face in the library, without detecting new ones. */
  recognizeFaces: (options: FaceRecognitionOptions) => Promise<void>;
};

type FindFacesSummary = { detect: FaceDetectSummary; recognize: FaceRecognizeSummary };

function _buildFindSuccessMessage({ detect, recognize }: FindFacesSummary): string {
  const faceLabel = `${detect.detectedFaces} face${detect.detectedFaces === 1 ? '' : 's'} found`;
  return `Finished finding faces · ${faceLabel} · ${describeRecognizeChanges(recognize)}`;
}

/** Builds a photo-only asset query for the requested scan scope. */
export async function buildFaceScanSearchQuery(scope?: ScanScope): Promise<SearchQuery> {
  const photosOnly: SearchCondition = {
    filters: [{ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'photo' }],
  };

  if (!scope || scope.albumIds.length === 0) {
    return photosOnly;
  }

  const albumIds = scope.includeSubAlbums
    ? expandAlbumScope(await AlbumsService.getAll(), scope.albumIds)
    : scope.albumIds;

  if (albumIds.length === 0) {
    return photosOnly;
  }

  return [
    photosOnly,
    {
      type: SearchQueryType.OR,
      filters: albumIds.map((id) => ({
        filterCriteria: FilterCriteria.path,
        operator: 'contains',
        value: [{ id }],
      })),
    },
  ];
}

/**
 * Shared face actions (find / recognize) so the sidebar footer, the All People
 * hero and the Suggested and Unknown faces heroes all run the exact same
 * pipeline with the user's persisted settings.
 */
export function useFaceScanActions(): FaceScanActions {
  return useMemo<FaceScanActions>(
    () => ({
      async findFaces(options, scope) {
        const startedAt = performance.now();

        const recordDetectRun = (photos: number) =>
          useFaceRunRateStore
            .getState()
            .recordFindRun(
              photos,
              (performance.now() - startedAt) / 1000,
              FACE_DETECTION_SIZES[options.faceDetectionSize].relativeCost,
            );

        let photosBeforeStop = 0;

        await trackProcess<FindFacesSummary>(
          {
            kind: ProcessKind.FaceDetect,
            title: 'Finding faces',
            message: 'Loading photos…',
            canStop: true,
            successMessage: _buildFindSuccessMessage,
            errorMessage: (error) => `Could not find faces: ${String(error)}`,
            getWarnings: ({ detect, recognize }) => [...detect.warnings, ...recognize.warnings],
          },
          async (reporter) => {
            const searchQuery = await buildFaceScanSearchQuery(scope);
            let assets = await AssetsService.getFiles({ searchQuery });
            // Defense in depth: duration-based media classification lives in SQL,
            // while this extension check guarantees no supported video reaches
            // the image-only face sidecar if metadata is incomplete.
            assets = assets.filter((asset) => !isSupportedVideoPath(asset.filename));
            if (scope?.sampleSize && assets.length > scope.sampleSize) {
              assets = [...assets].sort(() => Math.random() - 0.5).slice(0, scope.sampleSize);
            }
            // Recognize regroups the remaining faces, so Detect skips it.
            const detect = await detectFaces(
              assets,
              options,
              reporter,
              (photos) => (photosBeforeStop = photos),
              { recluster: false },
            );
            recordDetectRun(detect.scannedPhotos);
            photosBeforeStop = 0;

            const recognizeStartedAt = performance.now();
            const recognize = await recognizeFaces(assets, options, reporter);
            useFaceRunRateStore
              .getState()
              .recordMatchRun(recognize.checkedFaces, (performance.now() - recognizeStartedAt) / 1000);
            return { detect, recognize };
          },
        ).catch((error) => {
          if (isProcessStopped(error) && photosBeforeStop > MIN_STOPPED_PHOTOS_TO_MEASURE) {
            recordDetectRun(photosBeforeStop);
          }
          throw error;
        });
      },

      async recognizeFaces(options) {
        const startedAt = performance.now();
        const summary = await trackProcess<FaceRecognizeSummary>(
          {
            kind: ProcessKind.FaceRecognize,
            title: 'Recognizing faces',
            message: 'Comparing unverified faces…',
            canStop: true,
            successMessage: (summary) => `Face recognition finished · ${describeRecognizeResult(summary)}`,
            errorMessage: (error) => `Could not recognize faces: ${String(error)}`,
            getWarnings: (summary) => summary.warnings,
          },
          async (reporter) => {
            const assets = (await AssetsService.getFiles({})).filter(
              (asset) => !isSupportedVideoPath(asset.filename),
            );
            return recognizeFaces(assets, options, reporter);
          },
        );

        useFaceRunRateStore
          .getState()
          .recordMatchRun(summary.checkedFaces, (performance.now() - startedAt) / 1000);
      },
    }),
    [],
  );
}
