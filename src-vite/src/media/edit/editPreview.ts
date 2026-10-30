import type { ImageEdit } from './editGeometry';
import type { EditorPreview } from './editorProtocol';

export const QUALITY_MARKS = [
  { quality: 30, label: 'Small' },
  { quality: 60, label: 'Balanced' },
  { quality: 85, label: 'High' },
] as const;

export function qualityLabel(quality: number): string {
  return quality < 50 ? 'Small' : quality < 85 ? 'Balanced' : 'High';
}

export function estimateEditBytes(preview: EditorPreview, edit: Pick<ImageEdit, 'width' | 'height'>): number {
  const pixelRatio = (edit.width * edit.height) / (preview.width * preview.height);
  return Math.max(1, Math.round(preview.bytes * pixelRatio + preview.profileBytes));
}

export function fileSizeChange(original: number, edited: number): number | undefined {
  if (original <= 0) return undefined;
  return Math.round(((edited - original) / original) * 100);
}
