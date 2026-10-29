import {
  getFileExtensionFromPath,
  isSupportedVideoPath,
  WEBVIEW_DISPLAYABLE_IMAGE_FORMATS,
} from '@/common/supportedFormats';
import { join } from '@tauri-apps/api/path';
import { exists, remove } from '@tauri-apps/plugin-fs';
import { AssetInClient } from '@/db/models/AssetInClient';
import { encodeWebpDerivative } from './imageEncoding';
import { getThumbnailsBasePath } from './thumbnail';

const PREVIEW_FILENAME_PREFIX = 'PREVIEW__';
/** libwebp compression effort used when re-encoding previews through ffmpeg. */
const PREVIEW_FFMPEG_EFFORT = 80;
const PREVIEW_TIMEOUT_MS = 30_000;

const previewGenerationInFlight = new Map<string, Promise<void>>();

/**
 * Whether a generated preview is required to display this asset at full size.
 * Videos are handled separately by the player, and webview-native image formats
 * can be shown directly, so neither needs one.
 */
export function needsGeneratedPreview(filename: string): boolean {
  if (isSupportedVideoPath(filename)) {
    return false;
  }

  return !WEBVIEW_DISPLAYABLE_IMAGE_FORMATS.has(getFileExtensionFromPath(filename));
}

async function _getPreviewPath(fileId: string) {
  return join(await getThumbnailsBasePath(), `${PREVIEW_FILENAME_PREFIX}${fileId}.webp`);
}

/** Delete the cached full-size preview of an asset, if any. */
export async function deletePreviewOfFile(fileId: string) {
  const previewPath = await _getPreviewPath(fileId);

  if (await exists(previewPath)) {
    await remove(previewPath);
  }
}

/**
 * Return the path to a full-resolution, lossless WebP preview of `asset`,
 * generating it on demand. Used in the lightbox to display formats the webview
 * cannot decode natively. Returns `null` if generation fails.
 */
export async function getOrCreateFullPreview(
  asset: Pick<AssetInClient, 'id' | 'fullPath'>,
): Promise<string | null> {
  const previewPath = await _getPreviewPath(asset.id);

  if (await exists(previewPath)) {
    return previewPath;
  }

  let runningGeneration = previewGenerationInFlight.get(asset.id);

  if (!runningGeneration) {
    runningGeneration = _generatePreview(asset, previewPath);
    previewGenerationInFlight.set(asset.id, runningGeneration);
  }

  try {
    await runningGeneration;
  } catch (error) {
    console.warn(`Failed to generate preview for "${asset.fullPath}"`, error);
    return null;
  } finally {
    if (previewGenerationInFlight.get(asset.id) === runningGeneration) {
      previewGenerationInFlight.delete(asset.id);
    }
  }

  return (await exists(previewPath)) ? previewPath : null;
}

async function _generatePreview(asset: Pick<AssetInClient, 'id' | 'fullPath'>, previewPath: string) {
  await encodeWebpDerivative({
    inputPath: asset.fullPath,
    outputPath: previewPath,
    command: 'generate_image_preview',
    // Full resolution, lossless: this is what the lightbox shows at 1:1.
    ffmpeg: { lossless: true, quality: PREVIEW_FFMPEG_EFFORT, timeoutMs: PREVIEW_TIMEOUT_MS },
  });
}
