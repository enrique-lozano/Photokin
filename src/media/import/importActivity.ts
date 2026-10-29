import { setThumbnailImportMode } from '@/media/thumbnails/thumbnail';

let depth = 0;

export function beginImportWork(): void {
  depth += 1;
  if (depth === 1) setThumbnailImportMode(true);
}

export function endImportWork(): void {
  depth = Math.max(0, depth - 1);
  if (depth === 0) setThumbnailImportMode(false);
}

export function isImportWorkActive(): boolean {
  return depth > 0;
}
