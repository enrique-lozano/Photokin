import { isSupportedVideoPath } from '@/common/supportedFormats';
import { RegionsService } from '@/db/api/services/regions.service';
import { selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AssetInClient } from '@/db/models/AssetInClient';
import {
  AreaBox,
  AreaBoxInClient,
  FaceStatus,
  TagRegionInfoDTO,
  TagRegionInfoInClient,
} from '@/db/models/TagRegionInfoDTO';
import { decodeEmbedding } from '@/media/embeddings';
import { spawnSidecar } from '@/system/commandRunner';
import { debugLog, errorLog, formatCommand, timingsSince, warningLog } from '@/system/devLogger';
import { joinPathSync } from '@/system/diskManager';
import { ProcessReporter } from '@/system/processTracker';
import { shuffle } from '@/utils/array.utils';
import { appCacheDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/sqlite';
import { filterDismissedFaceClusters, getDismissedFaceClusterKeys } from './dismissedFaceClusters';
import { clusterUnknownFaces, FACE_CLUSTER_K_NEIGHBORS } from './faceClustering';
import { clusterFaceEdges, matchFacesToPeople, storeRegionEmbeddings } from './faceEmbeddingStore';

/** The smallest faces a scan should find. Smaller means a slower, higher-resolution detection pass. */
export enum FaceDetectionSize {
  Tiny = 'tiny',
  Small = 'small',
  Medium = 'medium',
  Large = 'large',
}

/**
 * Longest side (px) photos are scaled to before detection, and the per-photo
 * cost relative to `small`, which keeps run estimates right when the size
 * changes between runs. Costs were measured on 10 MP JPEGs and rounded up,
 * since embedding and saving faces does not get cheaper with the size.
 */
export const FACE_DETECTION_SIZES: Record<FaceDetectionSize, { maxSide: number; relativeCost: number }> = {
  [FaceDetectionSize.Tiny]: { maxSide: 2560, relativeCost: 1.5 },
  [FaceDetectionSize.Small]: { maxSide: 1920, relativeCost: 1 },
  [FaceDetectionSize.Medium]: { maxSide: 1280, relativeCost: 0.45 },
  [FaceDetectionSize.Large]: { maxSide: 960, relativeCost: 0.3 },
};

export function isFaceDetectionSize(value: unknown): value is FaceDetectionSize {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FACE_DETECTION_SIZES, value);
}

export type FaceRecognitionOptions = {
  faceDetectionSize: FaceDetectionSize;
  minFaceConfidence: number;
  knownEmbeddingsPerTag: number;
  /** Max cosine distance (0-1, lower = stricter) for Recognize to suggest a person. */
  matchMaxDistance: number;
};

/** Smallest number of similar faces needed to form a suggested group. */
const MIN_CLUSTER_SIZE = 3;

export const DEFAULT_FACE_RECOGNITION_OPTIONS: FaceRecognitionOptions = {
  faceDetectionSize: FaceDetectionSize.Small,
  minFaceConfidence: 0.9,
  knownEmbeddingsPerTag: 10,
  // 1 - 0.363 (the Python sidecar's default recognition similarity threshold).
  matchMaxDistance: 0.64,
};

/** The matching knobs from persisted scan settings, without album-scope fields. */
export function faceRecognitionOptionsFrom(
  settings: Pick<
    FaceRecognitionOptions,
    'faceDetectionSize' | 'minFaceConfidence' | 'knownEmbeddingsPerTag' | 'matchMaxDistance'
  >,
): FaceRecognitionOptions {
  return {
    faceDetectionSize: settings.faceDetectionSize,
    minFaceConfidence: settings.minFaceConfidence,
    knownEmbeddingsPerTag: settings.knownEmbeddingsPerTag,
    matchMaxDistance: settings.matchMaxDistance,
  };
}

type TaggedRegionWithPath = TagRegionInfoDTO & { path: string; embedding: string | null };

type FaceRecognitionResult = {
  face_id: string;
  img_id: string;
  area: AreaBox;
  distance: number;
  /** Detector confidence, 0–1. Absent on output from an older sidecar. */
  score?: number;
  embedding?: number[];
};

type ReferenceEmbeddingResult = {
  region_id: string;
  embedding: number[];
};

type ReferenceFailure = {
  regionId: string;
  reason: string;
  path?: string;
};

/** People counter from older sidecars, or one missing reference face from the current one. */
const REFERENCE_LOAD_PROGRESS_REGEX = /Loading (?:embeddings for .+?|reference face) \[(\d+)\/(\d+)\]/;

/** Outcome of a Detect run, used to build the completion toast. */
export type FaceDetectSummary = {
  scannedPhotos: number;
  detectedFaces: number;
  /** Non-fatal issues collected during the run (e.g. unreadable output). */
  warnings: string[];
};

/** Matches the `Scanning faces in <path> [current/total]` progress line the sidecar prints to stderr. */
const SIDECAR_SCAN_PROGRESS_REGEX = /Scanning faces in .*\[(\d+)\/(\d+)\]/;

const SIDECAR = 'resources/face_recognition/face_recognition';
const LOG_SCOPE = 'faces';

/**
 * The sidecar streams its progress on stderr, so only the lines it marks as a
 * problem are reported as one; the rest is dev-only detail.
 */
function _logSidecarLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (/^(warning|error|traceback|exception)/i.test(trimmed)) {
    warningLog(LOG_SCOPE, 'sidecar-warning', { detail: trimmed });
  } else {
    debugLog(LOG_SCOPE, 'sidecar-output', { detail: trimmed });
  }
}

/**
 * `spawnSidecar` resolves with the exit code instead of rejecting, so a sidecar
 * that dies at startup (bad arguments, missing model) would otherwise pass for
 * a scan that simply found no faces.
 */
function _assertSidecarSucceeded(code: number | null, lastErrorLine: string | null): void {
  if (code === 0) return;
  throw new Error(lastErrorLine ?? `The face recognition sidecar exited with code ${code}`);
}

function _isSidecarErrorLine(line: string): boolean {
  return /\berror\b/i.test(line);
}

function _referenceLoadProgress(line: string): { current: number; total: number } | null {
  const match = line.match(REFERENCE_LOAD_PROGRESS_REGEX);
  if (!match?.[1] || !match[2]) return null;
  return { current: Number(match[1]), total: Number(match[2]) };
}

function _referenceFailureWarning(failure: ReferenceFailure): string {
  const filename = failure.path?.split(/[\\/]/).pop();
  return filename ? `${failure.reason} · ${filename}` : failure.reason;
}

/**
 * Reference-face protocol lines share stdout with detected faces. Returns true
 * when the line was consumed.
 */
function _consumeReferenceLine(
  line: string,
  handlers: {
    onReady?: () => void;
    onEmbedding?: (regionId: string, embedding: number[]) => void;
    onFailure?: (failure: ReferenceFailure) => void;
  },
): boolean {
  if (line.includes('========> REFERENCES_READY')) {
    handlers.onReady?.();
    return true;
  }

  const failed = line.match(/========> REFERENCE_FAILED: (.*)/);
  if (failed?.[1]) {
    try {
      const parsed = JSON.parse(failed[1]) as { region_id?: string; reason?: string; path?: string };
      if (parsed.region_id && parsed.reason) {
        handlers.onFailure?.({ regionId: parsed.region_id, reason: parsed.reason, path: parsed.path });
      }
    } catch (error) {
      errorLog(LOG_SCOPE, 'reference-failure-parse-failed', error);
    }
    return true;
  }

  const referenceMatch = line.match(/========> REFERENCE: (.*)/);
  if (!referenceMatch?.[1]) return false;

  try {
    const reference = JSON.parse(referenceMatch[1]) as ReferenceEmbeddingResult;
    if (reference.region_id && reference.embedding?.length) {
      handlers.onEmbedding?.(reference.region_id, reference.embedding);
    }
  } catch (error) {
    errorLog(LOG_SCOPE, 'reference-embedding-parse-failed', error);
  }
  return true;
}

function _reportReferenceLoadProgress(line: string, reporter?: ProcessReporter): boolean {
  const progress = _referenceLoadProgress(line);
  if (!progress) return false;
  reporter?.update({
    message: `Loading reference faces · ${progress.current}/${progress.total}`,
    progress: progress.total > 0 ? progress.current / progress.total : null,
  });
  return true;
}

type KnownFace = ReturnType<typeof _buildKnownFaces>[number];
type ImageToParse = ReturnType<typeof _buildImagesToParse>[number];
const REGION_COORD_DECIMALS = 6;

/**
 * Finds new faces in the photos and stores them unnamed, with their embeddings.
 * Never matches against people: that is {@link recognizeFaces}.
 */
export async function detectFaces(
  assetsToScan: AssetInClient[],
  options: FaceRecognitionOptions = DEFAULT_FACE_RECOGNITION_OPTIONS,
  reporter?: ProcessReporter,
  onStopped?: (scannedPhotos: number) => void,
  behavior: { recluster?: boolean } = {},
): Promise<FaceDetectSummary> {
  reporter?.throwIfStopped();
  reporter?.update({ message: 'Preparing photos…', progress: null });

  const photoAssets = assetsToScan.filter((asset) => !isSupportedVideoPath(asset.filename));
  const taggedRegions = await _fetchTaggedRegions();
  const imagesToParse = _buildImagesToParse(photoAssets, taggedRegions);
  const imagesToParseJsonPath = await _writeTempJson('files_to_parse.json', imagesToParse);

  const totalPhotos = imagesToParse.length;
  let detectedFaces = 0;
  let scannedPhotos = 0;
  const warnings: string[] = [];
  const pendingEmbeddings: { regionId: string; embedding: number[] }[] = [];
  let embeddingFlush = Promise.resolve();

  const flushEmbeddings = () => {
    if (pendingEmbeddings.length === 0) return;
    const batch = pendingEmbeddings.splice(0);
    embeddingFlush = embeddingFlush
      .then(() => storeRegionEmbeddings(batch))
      .catch((error) => {
        errorLog(LOG_SCOPE, 'embedding-store-failed', error, { embeddings: batch.length });
        warnings.push(`Could not save ${batch.length} face embedding(s).`);
      });
  };

  // Composes the scan-phase message from the latest photo/face counters so
  // progress (driven by stderr) and the live face tally (driven by stdout)
  // stay in a single line instead of overwriting each other.
  const reportScanProgress = () => {
    const faceSuffix =
      detectedFaces > 0 ? ` · ${detectedFaces} face${detectedFaces === 1 ? '' : 's'} found` : '';
    reporter?.update({
      message: `Detecting faces in ${totalPhotos} photo${totalPhotos === 1 ? '' : 's'} · ${scannedPhotos}/${totalPhotos}${faceSuffix}`,
      progress: totalPhotos > 0 ? scannedPhotos / totalPhotos : null,
    });
  };

  const scanArgs = [
    imagesToParseJsonPath,
    '--min_face_confidence',
    String(options.minFaceConfidence),
    '--detection_size',
    String(FACE_DETECTION_SIZES[options.faceDetectionSize].maxSide),
  ];
  const startedAt = performance.now();
  let lastErrorLine: string | null = null;

  try {
    const { data: exit } = await spawnSidecar(SIDECAR, {
      args: scanArgs,
      signal: reporter?.signal,
      onExecutionStarted: (child) => {
        debugLog(LOG_SCOPE, 'scan-started', {
          pid: child.pid,
          photos: totalPhotos,
          command: formatCommand('face_recognition', scanArgs),
        });
      },
      onStdout: async (line) => {
        // Existing faces without an embedding come back on the reference protocol.
        if (
          _consumeReferenceLine(line, {
            onEmbedding: (regionId, embedding) => {
              pendingEmbeddings.push({ regionId, embedding });
              flushEmbeddings();
            },
          })
        ) {
          return;
        }

        // Look for lines that start with '========> FACE: ' and contain JSON data
        const faceMatch = line.match(/========> FACE: (.*)/);

        if (!faceMatch || !faceMatch[1]) {
          return;
        }

        let faceJson: undefined | FaceRecognitionResult;
        try {
          faceJson = JSON.parse(faceMatch[1]) as FaceRecognitionResult;
        } catch (error) {
          errorLog(LOG_SCOPE, 'face-parse-failed', error);
        }

        if (!faceJson) return;

        detectedFaces += 1;
        reportScanProgress();

        const faceArea = new AreaBoxInClient(faceJson.area);
        const insertingFaceForAssetId = photoAssets.find((asset) => asset.id === faceJson.img_id);

        if (!insertingFaceForAssetId) {
          throw Error('Invalid file ID');
        }

        const toInsert = TagRegionInfoInClient.fromDB({
          assetId: faceJson.img_id,
          tagId: undefined,
          confirmed: 0,
          faceStatus: FaceStatus.Pending,
          detectionScore: typeof faceJson.score === 'number' ? faceJson.score : null,
          ..._roundAreaCoordinates(
            faceArea.splitBy({
              h: insertingFaceForAssetId.metadata.height,
              w: insertingFaceForAssetId.metadata.width,
            }),
          ),
        });

        // The embedding is saved with its face, not at the end of the run: a
        // stopped or failed scan keeps its faces, and Recognize faces can only
        // compare faces that have an embedding.
        try {
          const { id, inserted } = await RegionsService.insertRegionIfNotDuplicate(toInsert.toDB());
          if (inserted && faceJson.embedding?.length) {
            await storeRegionEmbeddings([{ regionId: id, embedding: faceJson.embedding }]);
          }
        } catch (error) {
          errorLog(LOG_SCOPE, 'region-insert-failed', error, { assetId: faceJson.img_id });
        }
      },
      onStderr: (line) => {
        const scanMatch = line.match(SIDECAR_SCAN_PROGRESS_REGEX);
        if (scanMatch) {
          scannedPhotos = Number(scanMatch[1]);
          reportScanProgress();
          return;
        }

        if (_isSidecarErrorLine(line)) lastErrorLine = line.trim();
        _logSidecarLine(line);
      },
      onError: (message) => {
        // Non-fatal stream errors (e.g. a log line with a non-UTF-8 path) must
        // not abort the scan: the process keeps detecting faces, so we record
        // the issue and surface it as a summary once the scan completes.
        warningLog(LOG_SCOPE, 'stream-warning', { detail: message });
        warnings.push(message);
      },
    });
    // Save embeddings that already finished, including when the run is
    // stopped or the sidecar exits with an error afterwards.
    flushEmbeddings();
    await embeddingFlush;
    reporter?.throwIfStopped();
    _assertSidecarSucceeded(exit.code, lastErrorLine);

    debugLog(LOG_SCOPE, 'scan-complete', {
      photos: scannedPhotos,
      faces: detectedFaces,
      ...timingsSince(startedAt, scannedPhotos),
    });

    if (behavior.recluster !== false) {
      reporter?.update({ message: 'Grouping similar faces…', progress: null });
      await _reclusterUnknownFaces();
    }
  } catch (error) {
    if (reporter?.signal.aborted) {
      onStopped?.(scannedPhotos);
      throw error;
    }
    errorLog(LOG_SCOPE, 'scan-failed', error, {
      photos: scannedPhotos,
      ...timingsSince(startedAt, scannedPhotos),
    });
    const detail = error instanceof Error ? error.message : String(error);
    throw `Face detection failed: ${detail}`;
  } finally {
    await remove(imagesToParseJsonPath);
  }

  return { scannedPhotos, detectedFaces, warnings };
}

async function _fetchTaggedRegions(): Promise<TaggedRegionWithPath[]> {
  const query = kyselyDB
    .selectFrom('tagRegionInfo')
    .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
    .leftJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
    .select((eb) => [
      'tagRegionInfo.id as id',
      'tagId',
      'assetId',
      'filename',
      'confirmed',
      'faceStatus',
      'faceEmbeddings.embedding as embedding',
      sql<string>`""`.as('path'),
      sql<number>`ROUND(x * width, 1)`.as('x'),
      sql<number>`ROUND(y * height, 1)`.as('y'),
      sql<number>`ROUND(w * width, 1)`.as('w'),
      sql<number>`ROUND(h * height, 1)`.as('h'),
      jsonObjectFrom(
        eb
          .selectFrom('albums')
          .innerJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
          .select(['rootAlbums.path as rootPath', 'albums.relativePath', 'albums.rootAlbumId'])
          .whereRef('albums.id', '=', 'assets.albumId'),
      ).as('album'),
    ]);

  const allTaggedRegions = await selectFromDB(query);
  const photoRegions = allTaggedRegions.filter(
    (region) => region.filename && !isSupportedVideoPath(region.filename),
  );

  for (const region of photoRegions) {
    if (typeof region.album === 'string') {
      region.album = JSON.parse(region.album);
    }
    region.path = joinPathSync(region.album!.rootPath, region.album!.relativePath!, region.filename!);
  }

  return photoRegions;
}

function _buildKnownFaces(
  taggedRegionsByTag: Partial<Record<string, TaggedRegionWithPath[]>>,
  options: FaceRecognitionOptions,
) {
  const knownFaces: {
    name: string;
    images: { path: string; region: AreaBox; region_id: string; embedding?: number[] }[];
  }[] = [];

  for (const tagId in taggedRegionsByTag) {
    if (!Object.prototype.hasOwnProperty.call(taggedRegionsByTag, tagId)) continue;

    const regions = taggedRegionsByTag[tagId];
    if (!regions) continue;

    for (const region of regions) {
      if (region.confirmed !== 1) continue;

      const regionData = { x: region.x, y: region.y, h: region.h, w: region.w };
      const reference = {
        path: region.path,
        region: regionData,
        region_id: region.id,
        ...(region.embedding ? { embedding: Array.from(decodeEmbedding(region.embedding)) } : {}),
      };
      const knownFace = knownFaces.find((face) => face.name === tagId);

      if (knownFace) {
        knownFace.images.push(reference);
      } else {
        knownFaces.push({
          name: tagId,
          images: [reference],
        });
      }
    }
  }

  // Limit the number of images for each tag
  knownFaces.forEach((face) => {
    if (face.images.length > options.knownEmbeddingsPerTag) {
      const stored = shuffle(face.images.filter((image) => image.embedding));
      const missing = shuffle(face.images.filter((image) => !image.embedding));
      face.images = [...stored, ...missing].slice(0, options.knownEmbeddingsPerTag);
    }
  });

  return knownFaces;
}

function _buildImagesToParse(assets: AssetInClient[], taggedRegions: TaggedRegionWithPath[]) {
  return assets.map((asset) => ({
    path: asset.fullPath,
    id: asset.id,
    longest_side: asset.metadata.longestSide,
    areas_already_tagged: taggedRegions
      .filter((region) => region.assetId === asset.id)
      .map((region) => ({
        x: region.x,
        y: region.y,
        h: region.h,
        w: region.w,
      })),
    // Recognize faces can only compare faces with an embedding, and a scan that
    // was stopped used to leave its faces without one.
    regions_to_embed: taggedRegions
      .filter(
        (region) =>
          region.assetId === asset.id && !region.embedding && region.faceStatus !== FaceStatus.Rejected,
      )
      .map((region) => ({ id: region.id, x: region.x, y: region.y, h: region.h, w: region.w })),
  }));
}

async function _writeTempJson(filename: string, data: KnownFace[] | ImageToParse[]): Promise<string> {
  const tempJsonDir = await appCacheDir();

  if (!(await exists(tempJsonDir))) {
    await mkdir(tempJsonDir, { recursive: true });
  }

  const path = await join(tempJsonDir, filename);
  await writeTextFile(path, JSON.stringify(data));
  return path;
}

/** Cosine distance above which two unknown faces stay in different groups. */
const CLUSTER_MAX_DISTANCE = 0.55;

async function _reclusterUnknownFaces() {
  const graph = await clusterFaceEdges({
    maxDistance: CLUSTER_MAX_DISTANCE,
    kNeighbors: FACE_CLUSTER_K_NEIGHBORS,
  });

  if (graph.regionIds.length === 0) {
    return;
  }

  // Faces without embeddings cannot participate in this pass. Keep any
  // existing groups they have instead of erasing information we cannot rebuild.
  await RegionsService.clearRegionClusters(graph.regionIds);

  const clusteringResult = clusterUnknownFaces(graph, { minClusterSize: MIN_CLUSTER_SIZE });
  const dismissedClusterKeys = await getDismissedFaceClusterKeys();
  const visibleClusters = filterDismissedFaceClusters(
    clusteringResult.clusteredRegionIds,
    dismissedClusterKeys,
  );

  await Promise.all(
    Object.entries(visibleClusters).map(([clusterId, regionIds]) =>
      RegionsService.assignCluster(regionIds, clusterId),
    ),
  );
}

/** Suggests a named person for the unverified faces already detected in these photos. */
export async function recognizeFaces(
  assetsToCheck: AssetInClient[],
  options: FaceRecognitionOptions = DEFAULT_FACE_RECOGNITION_OPTIONS,
  reporter?: ProcessReporter,
  behavior: { recluster?: boolean } = {},
): Promise<FaceRecognizeSummary> {
  reporter?.throwIfStopped();
  const referenceWarnings = await _ensureReferenceEmbeddings(options, reporter);
  reporter?.throwIfStopped();
  reporter?.update({ message: 'Comparing unverified faces…', progress: null });

  const candidateAssetIds = assetsToCheck
    .filter((asset) => !isSupportedVideoPath(asset.filename))
    .map((asset) => asset.id);

  const { candidates, referencePeople } = await matchFacesToPeople({
    candidateAssetIds,
    matchMaxDistance: options.matchMaxDistance,
    maxRefsPerTag: options.knownEmbeddingsPerTag,
  });
  const facesWithoutEmbedding = await _countUnverifiedFacesWithoutEmbedding(new Set(candidateAssetIds));

  // Only the faces whose person actually changes are written. Rewriting the
  // verdict a face already carries would churn the live queries for nothing,
  // and clearing a face that never had a person would drop the cluster it was
  // grouped into — which a scoped run does not rebuild.
  const regionIdsByTagId = new Map<string, string[]>();
  const clearedRegionIds: string[] = [];
  const summary: FaceRecognizeSummary = {
    checkedFaces: candidates.length,
    referencePeople,
    newSuggestions: 0,
    reassignedSuggestions: 0,
    removedSuggestions: 0,
    facesWithoutEmbedding,
    warnings: referenceWarnings,
  };

  for (const { regionId, previousTagId, matchedTagId } of candidates) {
    if (matchedTagId) {
      if (matchedTagId === previousTagId) continue;

      const ids = regionIdsByTagId.get(matchedTagId) ?? [];
      ids.push(regionId);
      regionIdsByTagId.set(matchedTagId, ids);
      if (previousTagId) summary.reassignedSuggestions += 1;
      else summary.newSuggestions += 1;
    } else if (previousTagId) {
      clearedRegionIds.push(regionId);
      summary.removedSuggestions += 1;
    }
  }

  await Promise.all([
    RegionsService.clearUnconfirmedAssignments(clearedRegionIds),
    ...[...regionIdsByTagId.entries()].map(([tagId, regionIds]) =>
      RegionsService.assignRegionsToPerson(regionIds, tagId, { confirm: false }),
    ),
  ]);

  // Re-clustering is global, so scoped runs only match faces to known people.
  if (behavior.recluster !== false) {
    reporter?.throwIfStopped();
    reporter?.update({ message: 'Grouping remaining faces…', progress: null });
    await _reclusterUnknownFaces();
  }

  return summary;
}

async function _countUnverifiedFacesWithoutEmbedding(assetIds: ReadonlySet<string>): Promise<number> {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('tagRegionInfo')
      .leftJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
      .select('tagRegionInfo.assetId as assetId')
      .where('tagRegionInfo.confirmed', '=', 0)
      .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending)
      .where('faceEmbeddings.regionId', 'is', null),
  );
  return rows.filter((row) => assetIds.has(row.assetId)).length;
}

/**
 * What a Recognize run changed, so its completion toast can say so. A run over
 * unchanged references is expected to be a no-op, and saying that plainly beats
 * a "finished" that looks identical to a run that found twenty faces.
 */
export type FaceRecognizeSummary = {
  checkedFaces: number;
  referencePeople: number;
  /** Faces that had no person and now have a suggestion. */
  newSuggestions: number;
  /** Faces whose suggested person changed. */
  reassignedSuggestions: number;
  /** Faces whose suggestion no longer holds and was cleared. */
  removedSuggestions: number;
  /** Unverified faces in scope that could not be compared: Detect faces has to embed them first. */
  facesWithoutEmbedding: number;
  /** Reference faces this run could not embed. */
  warnings: string[];
};

/**
 * The change part of a Recognize completion toast — the caller supplies the
 * prefix, since the library-wide and selection-scoped runs name themselves
 * differently.
 */
export function describeRecognizeChanges(summary: FaceRecognizeSummary): string {
  if (summary.referencePeople === 0) {
    return 'no named people with confirmed faces to match against yet';
  }

  const parts: string[] = [];
  if (summary.newSuggestions > 0) {
    parts.push(
      `${summary.newSuggestions.toLocaleString()} new suggestion${summary.newSuggestions === 1 ? '' : 's'}`,
    );
  }
  if (summary.reassignedSuggestions > 0) {
    parts.push(`${summary.reassignedSuggestions.toLocaleString()} reassigned`);
  }
  if (summary.removedSuggestions > 0) {
    parts.push(`${summary.removedSuggestions.toLocaleString()} removed`);
  }

  if (parts.length === 0) {
    const faces = `${summary.checkedFaces.toLocaleString()} face${summary.checkedFaces === 1 ? '' : 's'}`;
    return `no changes · ${faces} checked`;
  }

  return parts.join(' · ');
}

/** Recognize toast body, including faces this run could not use. */
export function describeRecognizeResult(summary: FaceRecognizeSummary): string {
  const parts = [describeRecognizeChanges(summary)];
  if (summary.facesWithoutEmbedding > 0) {
    parts.push(`${summary.facesWithoutEmbedding.toLocaleString()} need Detect faces first`);
  }
  if (summary.warnings.length > 0) {
    parts.push(
      `${summary.warnings.length.toLocaleString()} reference face${summary.warnings.length === 1 ? '' : 's'} skipped`,
    );
  }
  return parts.join(' · ');
}

async function _ensureReferenceEmbeddings(
  options: FaceRecognitionOptions = DEFAULT_FACE_RECOGNITION_OPTIONS,
  reporter?: ProcessReporter,
): Promise<string[]> {
  reporter?.throwIfStopped();
  reporter?.update({ message: 'Checking reference faces…', progress: null });

  const taggedRegions = await _fetchTaggedRegions();
  const taggedRegionsByTag = Object.groupBy(taggedRegions, ({ tagId }) => tagId!);
  const knownFaces = _buildKnownFaces(taggedRegionsByTag, options);
  // Matching reads stored embeddings from the database. This pass only opens
  // the photos still needed to reach the configured reference count.
  const facesToRead = knownFaces.flatMap((person) => {
    const images = person.images.filter((image) => !image.embedding);
    return images.length > 0 ? [{ ...person, images }] : [];
  });
  const missingCount = facesToRead.reduce((total, person) => total + person.images.length, 0);

  if (missingCount === 0) return [];

  const knownRegionsJsonPath = await _writeTempJson('known_regions.json', facesToRead);
  const imagesToParseJsonPath = await _writeTempJson('files_to_parse.json', []);
  const updates: { regionId: string; embedding: number[] }[] = [];
  const failures: ReferenceFailure[] = [];
  const referenceArgs = [
    imagesToParseJsonPath,
    '--known_regions_json',
    knownRegionsJsonPath,
    '--min_face_confidence',
    String(options.minFaceConfidence),
  ];
  const startedAt = performance.now();
  debugLog(LOG_SCOPE, 'reference-fill-started', {
    missingReferences: missingCount,
    command: formatCommand('face_recognition', referenceArgs),
  });

  reporter?.update({
    message: `Loading reference faces · 0/${missingCount}`,
    progress: 0,
  });

  let lastErrorLine: string | null = null;
  let exitCode: number | null = null;

  try {
    const { data: exit } = await spawnSidecar(SIDECAR, {
      args: referenceArgs,
      signal: reporter?.signal,
      onStdout: (line) => {
        _consumeReferenceLine(line, {
          onEmbedding: (regionId, embedding) => {
            updates.push({ regionId, embedding });
          },
          onFailure: (failure) => {
            failures.push(failure);
          },
        });
      },
      onStderr: (line) => {
        if (_reportReferenceLoadProgress(line, reporter)) return;
        if (_isSidecarErrorLine(line)) lastErrorLine = line.trim();
        _logSidecarLine(line);
      },
      onError: (message) => {
        warningLog(LOG_SCOPE, 'stream-warning', { detail: message });
      },
    });
    exitCode = exit.code;
  } finally {
    try {
      await storeRegionEmbeddings(updates);
    } finally {
      await remove(knownRegionsJsonPath);
      await remove(imagesToParseJsonPath);
    }
  }

  reporter?.throwIfStopped();
  _assertSidecarSucceeded(exitCode, lastErrorLine);

  debugLog(LOG_SCOPE, 'reference-fill-complete', {
    requested: missingCount,
    embeddings: updates.length,
    failures: failures.length,
    ...timingsSince(startedAt, missingCount),
  });

  return failures.map(_referenceFailureWarning);
}

function _roundAreaCoordinates(area: AreaBox): AreaBox {
  const toFixedNumber = (value: number) => Number(value.toFixed(REGION_COORD_DECIMALS));
  return {
    x: toFixedNumber(area.x),
    y: toFixedNumber(area.y),
    w: toFixedNumber(area.w),
    h: toFixedNumber(area.h),
  };
}
