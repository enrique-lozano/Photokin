import {
  getFileExtensionFromPath,
  SupportedFormatsWithDots,
  WEBVIEW_DISPLAYABLE_IMAGE_FORMATS,
} from '@/common/supportedFormats';
import { storeAssetPerceptualHash } from '@/db/api/services/assetFingerprints.service';
import { getLibraryDataDir } from '@/db/connection/libraryDataDir';
import { AssetInClient } from '@/db/models/AssetInClient';
import { debugLog } from '@/system/devLogger';
import { joinPathSync, tauriFileStat } from '@/system/diskManager';
import { TaskQueue } from '@/utils/taskQueue/taskQueue';
import { invoke } from '@tauri-apps/api/core';
import { exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { encodeWebpDerivative, libwebpEncodeArgs, runFfmpeg } from './imageEncoding';
import { default_thumbnail_options, ThumbnailOptions, ThumbnailSize } from './thumbnailOptions.model';

export const THUMBNAIL_SIZE_PREFIX = {
  [ThumbnailSize.DEFAULT]: '',
  [ThumbnailSize.XS]: 'XS__',
};

export const THUMBNAIL_SIZE_MAX_PIXELS = {
  [ThumbnailSize.DEFAULT]: 480,
  [ThumbnailSize.XS]: 180,
};
const VIDEO_THUMBNAIL_TIMEOUT_MS = 20_000;
const IMAGE_THUMBNAIL_TIMEOUT_MS = 20_000;
const THUMBNAIL_FAILURE_RETRY_DELAY_MS = 60_000;
const VIDEO_THUMBNAIL_CAPTURE_TIMESTAMP = '00:00:01.000';
/** Quality (0–100) for the in-process libwebp encoder used on still images. */
const THUMBNAIL_WEBP_QUALITY = 85;
/** libwebp `-q:v` (0–100) for video frames captured via ffmpeg. */
const VIDEO_THUMBNAIL_WEBP_QUALITY = {
  [ThumbnailSize.DEFAULT]: 38,
  [ThumbnailSize.XS]: 30,
};
/** libwebp `-q:v` (0–100) for still images decoded via the ffmpeg fallback. */
const FFMPEG_IMAGE_WEBP_QUALITY = {
  [ThumbnailSize.DEFAULT]: 80,
  [ThumbnailSize.XS]: 70,
};
const MAX_VIDEO_THUMBNAIL_SIZE_BYTES = {
  [ThumbnailSize.DEFAULT]: 350_000,
  [ThumbnailSize.XS]: 80_000,
};
/** Filesize threshold below which thumbnail generation may be skipped (65 KB). */
const SKIP_THUMBNAIL_MAX_FILESIZE_BYTES = 65_000;
/** Longest-side threshold below which thumbnail generation may be skipped. */
const SKIP_THUMBNAIL_MAX_LONGEST_SIDE_PX = 150;

/**
 * Returns true when the original file can be used directly instead of
 * generating a thumbnail. This is the case when all of the following hold:
 *  - the webview can paint the format itself (no HEIC/HEIF/TIF)
 *  - the file is smaller than 65 KB
 *  - neither dimension exceeds 150 px
 */
export function shouldUseOriginalAsset(
  asset: Pick<AssetInClient, 'filesize' | 'filename' | 'metadata'>,
): boolean {
  const ext = getFileExtensionFromPath(asset.filename);
  if (!WEBVIEW_DISPLAYABLE_IMAGE_FORMATS.has(ext)) return false;
  return (
    asset.filesize < SKIP_THUMBNAIL_MAX_FILESIZE_BYTES &&
    asset.metadata.longestSide <= SKIP_THUMBNAIL_MAX_LONGEST_SIDE_PX
  );
}

const thumbnailGenerationInFlight = new Map<string, Promise<void>>();
const failedThumbnailGenerationAt = new Map<string, number>();

/** Cap concurrent full-image decodes so a scrolling/importing grid cannot OOM.
 * Measured on 4000×3000 JPEGs: c=2 ≈99ms/file, c=4 ≈70ms/file, c=8 ≈55ms/file
 * with diminishing returns — 4 is the sweet spot before memory multiplies.
 * Newest first: only visible tiles request thumbnails, so the freshest request
 * is the one still on screen. */
const thumbnailGenerationQueue = new TaskQueue({ concurrency: 4, newestFirst: true });

/** Leave headroom for the import's own work without starving visible tiles. */
export function setThumbnailImportMode(active: boolean): void {
  const concurrency = active ? 3 : 4;
  thumbnailGenerationQueue.setConcurrency(concurrency);
  debugLog('thumbnails', 'concurrency-changed', { concurrency });
}

/**
 * In-memory cache of already-resolved thumbnail paths, keyed by asset id + size.
 * Lets a gallery tile set its <img> `src` synchronously when it remounts during
 * scrolling, skipping the `exists` IPC round-trip that would otherwise leave the
 * grey placeholder visible on a cache hit. It only stores the resolved path
 * string; the browser and disk remain the source of truth for the pixels.
 */
const resolvedThumbnailPaths = new Map<string, string>();

/**
 * Synchronously returns a thumbnail path resolved earlier this session, or null
 * if it has not been resolved yet. Never touches the disk or IPC.
 */
export function getCachedThumbnailPath(assetId: string, size: ThumbnailSize): string | null {
  return resolvedThumbnailPaths.get(_getGenerationKey(assetId, size)) ?? null;
}

type ResolveThumbnailPathOptions = {
  generationDelayMs?: number;
  signal?: AbortSignal;
};

type ThumbnailAsset = Pick<AssetInClient, 'id' | 'fullPath'> &
  Partial<Pick<AssetInClient, 'filesize' | 'filename' | 'metadata'>>;

const thumbnailResolutionInFlight = new Map<string, Promise<string | null>>();

/** The base path where all the thumbnails are stored. Cached: resolving it is IPC. */
let cachedThumbnailsBasePath: Promise<string> | null = null;

export async function getThumbnailsBasePath() {
  cachedThumbnailsBasePath ??= getLibraryDataDir()
    .then((path) => joinPathSync(path, 'thumbnails'))
    .catch((error) => {
      cachedThumbnailsBasePath = null;
      throw error;
    });

  return cachedThumbnailsBasePath;
}

export async function deleteAllThumbnails() {
  const pathToRemove = await getThumbnailsBasePath();

  resolvedThumbnailPaths.clear();

  if (!(await exists(pathToRemove))) return;

  return remove(pathToRemove, { recursive: true });
}

export async function deleteThumbnailOfFile(fileID: string) {
  await deleteThumbnailsOfFiles([fileID]);
}

export async function deleteThumbnailsOfFiles(fileIDs: string[]) {
  for (const fileID of fileIDs) {
    resolvedThumbnailPaths.delete(_getGenerationKey(fileID, ThumbnailSize.DEFAULT));
    resolvedThumbnailPaths.delete(_getGenerationKey(fileID, ThumbnailSize.XS));
  }

  if (fileIDs.length === 0) {
    return;
  }

  const thumbnailsDir = await getThumbnailsBasePath();
  await invoke('delete_asset_image_caches', { thumbnailsDir, assetIds: fileIDs });
}

/**
 * Discards all cached thumbnails and rebuilds the requested sizes. When sizes
 * are omitted, both default and XS thumbnails are regenerated.
 */
export async function regenerateThumbnailOfFile(
  asset: Pick<AssetInClient, 'id' | 'fullPath'>,
  sizes?: readonly ThumbnailSize[],
) {
  await deleteThumbnailOfFile(asset.id);

  const sizesToRegenerate = sizes ?? [ThumbnailSize.DEFAULT, ThumbnailSize.XS];
  await Promise.all(sizesToRegenerate.map((size) => resolveThumbnailPath(asset, size)));
}

/**
 * Path of a cached thumbnail for this asset, generating the file when missing.
 * Mutates the in-memory path cache as a side effect of that lookup.
 */
export async function resolveThumbnailPath(
  asset: ThumbnailAsset,
  size: ThumbnailSize = ThumbnailSize.DEFAULT,
  options: ResolveThumbnailPathOptions = {},
) {
  // Delayed/cancellable requests retain their own lifetime; immediate consumers
  // (e.g. a sidebar avatar and its overview card) share the whole disk lookup.
  if (options.signal || options.generationDelayMs) {
    return _resolveThumbnailPath(asset, size, options);
  }

  const key = _getGenerationKey(asset.id, size);
  let pending = thumbnailResolutionInFlight.get(key);
  if (!pending) {
    pending = _resolveThumbnailPath(asset, size, options);
    thumbnailResolutionInFlight.set(key, pending);
  }
  try {
    return await pending;
  } finally {
    if (thumbnailResolutionInFlight.get(key) === pending) thumbnailResolutionInFlight.delete(key);
  }
}

async function _resolveThumbnailPath(
  asset: ThumbnailAsset,
  size: ThumbnailSize,
  options: ResolveThumbnailPathOptions,
) {
  // When the caller provides filesize/dimensions, skip generation for small
  // HTML-compatible images and serve the original file directly.
  if (
    asset.filesize !== undefined &&
    asset.filename !== undefined &&
    asset.metadata !== undefined &&
    shouldUseOriginalAsset(asset as Pick<AssetInClient, 'filesize' | 'filename' | 'metadata'>)
  ) {
    resolvedThumbnailPaths.set(_getGenerationKey(asset.id, size), asset.fullPath);
    return asset.fullPath;
  }

  const thumbnailPath = await getThumbnailPath(asset.id, { size });
  const fileExtension = getFileExtensionFromPath(asset.fullPath);
  const isVideo = SupportedFormatsWithDots.videos.includes(fileExtension);
  const generationKey = _getGenerationKey(asset.id, size);
  const failedAt = failedThumbnailGenerationAt.get(generationKey);

  if (isVideo && (await exists(thumbnailPath))) {
    const maxAllowedThumbnailSize = MAX_VIDEO_THUMBNAIL_SIZE_BYTES[size];
    const thumbnailStats = await tauriFileStat(thumbnailPath);

    if (thumbnailStats.size > maxAllowedThumbnailSize) {
      await remove(thumbnailPath);
    }
  }

  if (!(await exists(thumbnailPath))) {
    if (failedAt && Date.now() - failedAt < THUMBNAIL_FAILURE_RETRY_DELAY_MS) {
      return null;
    }

    let runningGeneration = thumbnailGenerationInFlight.get(generationKey);

    if (!runningGeneration) {
      // Delay + abort happen *before* the queue so fast scrolling never parks
      // hundreds of off-screen jobs behind the concurrency gate.
      const shouldGenerate = await _waitForGenerationDelay(options.generationDelayMs, options.signal);

      if (!shouldGenerate) {
        return null;
      }

      if (await exists(thumbnailPath)) {
        resolvedThumbnailPaths.set(generationKey, thumbnailPath);
        return thumbnailPath;
      }

      // Another consumer may have queued this asset while the disk check awaited.
      runningGeneration = thumbnailGenerationInFlight.get(generationKey);
      if (!runningGeneration) {
        runningGeneration = thumbnailGenerationQueue.add(async () => {
          try {
            await generateThumbnail(asset, {
              ...default_thumbnail_options,
              size,
            });

            failedThumbnailGenerationAt.delete(generationKey);
          } catch (error) {
            failedThumbnailGenerationAt.set(generationKey, Date.now());
            throw error;
          }
        });

        thumbnailGenerationInFlight.set(generationKey, runningGeneration);
      }
    }

    try {
      await runningGeneration;
    } catch (error) {
      console.warn(`Failed to generate thumbnail for "${asset.fullPath}"`, error);
    } finally {
      if (thumbnailGenerationInFlight.get(generationKey) === runningGeneration) {
        thumbnailGenerationInFlight.delete(generationKey);
      }
    }

    if (!(await exists(thumbnailPath))) {
      return null;
    }
  }

  resolvedThumbnailPaths.set(generationKey, thumbnailPath);
  return thumbnailPath;
}

/** Returns the path of the thumbnail of an asset if it exists, without scheduling thumbnail generation. */
export async function getExistingThumbnailPath(
  asset: Pick<AssetInClient, 'id' | 'fullPath' | 'filesize' | 'filename' | 'metadata'>,
  size: ThumbnailSize = ThumbnailSize.DEFAULT,
) {
  if (shouldUseOriginalAsset(asset)) return asset.fullPath;

  const thumbnailPath = await getThumbnailPath(asset.id, { size });
  return (await exists(thumbnailPath)) ? thumbnailPath : null;
}

export async function generateThumbnail(
  input: Pick<AssetInClient, 'id' | 'fullPath'>,
  options: ThumbnailOptions = default_thumbnail_options,
) {
  const dirPath = await getThumbnailDir(input.id);
  const dirExists = await exists(dirPath);

  if (!dirExists) {
    await mkdir(dirPath, { recursive: true });
  }

  const outputPath = await getThumbnailPath(input.id, options);
  const maxPixels = THUMBNAIL_SIZE_MAX_PIXELS[options.size];
  const fileExtension = getFileExtensionFromPath(input.fullPath);
  const isVideo = SupportedFormatsWithDots.videos.includes(fileExtension);

  if (isVideo) {
    await _generateVideoThumbnail(input.fullPath, outputPath, maxPixels, options.size);

    return;
  }

  const perceptualHash = await encodeWebpDerivative({
    inputPath: input.fullPath,
    outputPath,
    command: 'generate_image_thumbnail',
    commandArgs: { maxPixels, quality: THUMBNAIL_WEBP_QUALITY },
    ffmpeg: {
      maxPixels,
      quality: FFMPEG_IMAGE_WEBP_QUALITY[options.size],
      timeoutMs: IMAGE_THUMBNAIL_TIMEOUT_MS,
    },
  });

  if (perceptualHash) await storeAssetPerceptualHash(input.id, perceptualHash);
}

/** Capture a single video frame, scaled to fit the thumbnail box, as a WebP. */
async function _generateVideoThumbnail(
  inputPath: string,
  outputPath: string,
  maxPixels: number,
  size: ThumbnailSize,
) {
  const args = [
    '-nostdin',
    '-ss',
    VIDEO_THUMBNAIL_CAPTURE_TIMESTAMP,
    '-i',
    inputPath,
    '-an',
    '-frames:v',
    '1',
    '-vf',
    `scale=${maxPixels}:${maxPixels}:force_original_aspect_ratio=decrease`,
    ...libwebpEncodeArgs(VIDEO_THUMBNAIL_WEBP_QUALITY[size]),
    '-y',
    outputPath,
  ];

  await runFfmpeg(args, inputPath, VIDEO_THUMBNAIL_TIMEOUT_MS);
}

const _getGenerationKey = (fileId: string, size: ThumbnailSize) => `${fileId}:${size}`;

const _waitForGenerationDelay = async (delayMs = 0, signal?: AbortSignal) => {
  if (signal?.aborted) {
    return false;
  }

  if (delayMs <= 0) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, delayMs);

    function onAbort() {
      window.clearTimeout(timeoutId);
      resolve(false);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

/** Get the path of the directory of a thumbnail. */
const getThumbnailDir = async (fileId: string) => {
  return joinPathSync(await getThumbnailsBasePath(), fileId.substring(0, 2));
};

const getThumbnailPath = async (fileId: string, options?: Partial<ThumbnailOptions>) => {
  return joinPathSync(
    await getThumbnailDir(fileId),
    `${THUMBNAIL_SIZE_PREFIX[options?.size ?? default_thumbnail_options.size]}${fileId}.${
      options?.format ?? default_thumbnail_options.format
    }`,
  );
};
