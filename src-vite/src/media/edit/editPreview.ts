import type { ImageEdit } from './editGeometry';
import type { EditorPreview } from './editorProtocol';

export const QUALITY_MARKS = [
  { quality: 55, label: 'Small' },
  { quality: 75, label: 'Balanced' },
  { quality: 92, label: 'High' },
] as const;

// Above this, JPEG grows quickly without any visible gain.
export const QUALITY_DIMINISHING_RETURNS = 95;

export function qualityLabel(quality: number): string {
  return quality < 65 ? 'Small' : quality < 84 ? 'Balanced' : 'High';
}

export function estimateEditBytes(preview: EditorPreview, edit: Pick<ImageEdit, 'width' | 'height'>): number {
  const pixelRatio = (edit.width * edit.height) / (preview.width * preview.height);
  return Math.max(1, Math.round(preview.bytes * pixelRatio + preview.profileBytes));
}

/** A lossless crop keeps the original compression, so size follows the kept area. */
export function estimateLosslessBytes(
  originalBytes: number,
  original: { width: number; height: number },
  kept: { width: number; height: number },
): number {
  const ratio = (kept.width * kept.height) / (original.width * original.height);
  return Math.max(1, Math.round(originalBytes * ratio));
}

export function fileSizeChange(original: number, edited: number): number | undefined {
  if (original <= 0) return undefined;
  return Math.round(((edited - original) / original) * 100);
}
