import { describe, expect, it } from 'vitest';
import { useAppStore } from '@/stores/appState';
import { canComparePhotos } from './comparisonViewport';

const photos = [
  { id: 'a', filename: 'A.JPG', trashedAt: null },
  { id: 'b', filename: 'B.heic', trashedAt: null },
];

describe('fixed comparison selection', () => {
  it('accepts exactly two different photos, including preview-only formats', () => {
    expect(canComparePhotos(photos)).toBe(true);
  });

  it('rejects empty, single, larger, and duplicate selections', () => {
    for (const selection of [
      [],
      [photos[0]],
      [...photos, { ...photos[0], id: 'c' }],
      [photos[0], photos[0]],
    ]) {
      expect(canComparePhotos(selection)).toBe(false);
    }
  });

  it.each(['mp4', 'MP4', 'webm', 'ogv', 'ogg'])('rejects a photo paired with a %s video', (extension) => {
    expect(canComparePhotos([photos[0], { id: 'b', filename: `video.${extension}`, trashedAt: null }])).toBe(
      false,
    );
  });

  it('rejects trashed photos even when the basket is viewed outside Trash', () => {
    expect(canComparePhotos([photos[0], { ...photos[1], trashedAt: new Date() }])).toBe(false);
  });

  it('closing comparison does not clear or replace the selection basket', () => {
    const selected = useAppStore.getState().selectedImages;
    useAppStore.getState().setComparisonPair(null);
    expect(useAppStore.getState().selectedImages).toBe(selected);
    expect(useAppStore.getState().comparisonPair).toBeNull();
  });
});
