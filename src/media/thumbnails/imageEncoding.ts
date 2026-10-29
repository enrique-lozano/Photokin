import { getFileExtensionFromPath, SupportedImageFormats } from '@/common/supportedFormats';
import { CommandError, spawnSidecar } from '@/system/commandRunner';
import { warningLog } from '@/system/devLogger';
import { invoke } from '@tauri-apps/api/core';

const FFMPEG_SIDECAR_NAME = 'resources/ffmpeg/ffmpeg';
const DEFAULT_FFMPEG_TIMEOUT_MS = 20_000;

/**
 * Image formats the pure-Rust `image` crate cannot decode. These are routed
 * straight to the ffmpeg sidecar, which is also the fallback for any image that
 * fails to decode in Rust.
 */
export const IMAGE_FORMATS_DECODED_BY_FFMPEG = new Set([
  `.${SupportedImageFormats.HEIC}`,
  `.${SupportedImageFormats.HEIF}`,
  `.${SupportedImageFormats.AVIF}`,
]);

export interface FfmpegImageEncodeOptions {
  /** Fit within a `maxPixels` × `maxPixels` box. Omit to keep full resolution. */
  maxPixels?: number;
  /** Encode losslessly (for full-quality previews). */
  lossless?: boolean;
  /** libwebp quality 0–100 (lossy quality, or compression effort when lossless). */
  quality: number;
  timeoutMs?: number;
}

/**
 * Writes a WebP derivative of an image: `command` is the in-process Rust encoder,
 * used whenever it can decode the format, with the broader ffmpeg sidecar taking
 * over for the formats it cannot read and for files it fails on (corrupt data or
 * an unsupported variant of a format it normally handles).
 */
export async function encodeWebpDerivative(params: {
  inputPath: string;
  outputPath: string;
  command: 'generate_image_thumbnail' | 'generate_image_preview';
  commandArgs?: Record<string, unknown>;
  ffmpeg: FfmpegImageEncodeOptions;
}): Promise<string | null> {
  const { inputPath, outputPath, command, commandArgs, ffmpeg } = params;

  if (IMAGE_FORMATS_DECODED_BY_FFMPEG.has(getFileExtensionFromPath(inputPath))) {
    await encodeImageWithFfmpeg(inputPath, outputPath, ffmpeg);
    return null;
  }

  try {
    if (command === 'generate_image_thumbnail') {
      return await invoke<string>(command, { inputPath, outputPath, ...commandArgs });
    }
    await invoke(command, { inputPath, outputPath, ...commandArgs });
    return null;
  } catch (error) {
    warningLog('thumbnails', 'rust-decode-failed', { command, error: String(error) });
    await encodeImageWithFfmpeg(inputPath, outputPath, ffmpeg);
    return null;
  }
}

/**
 * Decode a still image with the ffmpeg sidecar and re-encode it as WebP — scaled
 * and lossy for thumbnails, full size and lossless for previews.
 */
export async function encodeImageWithFfmpeg(
  inputPath: string,
  outputPath: string,
  options: FfmpegImageEncodeOptions,
) {
  const { maxPixels, lossless = false, quality, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS } = options;

  // `-filter_complex` (not `-vf`): HEIF/HEIC "tile grid" stills are assembled by
  // ffmpeg through a complex filtergraph, and simple `-vf` filtering cannot be
  // mixed with that. `-filter_complex` works for both tile-grid and regular
  // single-stream images.
  const scaleArgs = maxPixels
    ? ['-filter_complex', `scale=${maxPixels}:${maxPixels}:force_original_aspect_ratio=decrease`]
    : [];

  await runFfmpeg(
    [
      '-nostdin',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      ...scaleArgs,
      ...libwebpEncodeArgs(quality, lossless),
      '-y',
      outputPath,
    ],
    inputPath,
    timeoutMs,
  );
}

/** ffmpeg libwebp encoder arguments. `lossless` keeps full fidelity. */
export function libwebpEncodeArgs(quality: number, lossless = false) {
  return [
    '-c:v',
    'libwebp',
    '-lossless',
    lossless ? '1' : '0',
    '-compression_level',
    '4',
    '-q:v',
    `${quality}`,
  ];
}

export async function runFfmpeg(args: string[], inputPath: string, timeoutMs: number) {
  // ffmpeg writes everything (banner, stream info, progress, the final summary)
  // to stderr even on success, so collect those lines and only surface them as
  // part of an error rather than logging each one as a warning.
  const stderrLines: string[] = [];

  const response = await spawnSidecar(FFMPEG_SIDECAR_NAME, {
    args,
    timeoutMs,
    onStderr: (line) => {
      stderrLines.push(line);
    },
  });

  if (response.data.code && response.data.code !== 0) {
    const details = stderrLines.join('\n').trim();

    throw new CommandError(
      `ffmpeg failed (exit ${response.data.code}) for "${inputPath}"${details ? `:\n${details}` : ''}`,
      response.command,
    );
  }
}
