import { describe, expect, it } from 'vitest';
import { estimateEditBytes, fileSizeChange, QUALITY_MARKS, qualityLabel } from './editPreview';

describe('editor preview estimates', () => {
  const sample = { previewPath: 'sample.png', width: 1600, height: 800, bytes: 100_000, profileBytes: 2000 };

  it('scales measured sample bytes to output pixels and adds the profile once', () => {
    expect(estimateEditBytes(sample, { width: 3200, height: 1600 })).toBe(402_000);
    expect(estimateEditBytes(sample, { width: 1600, height: 800 })).toBe(102_000);
    expect(estimateEditBytes(sample, { width: 800, height: 400 })).toBe(27_000);
  });

  it('updates estimates with crop area and leaves quarter-turns unchanged', () => {
    expect(estimateEditBytes(sample, { width: 800, height: 1600 })).toBe(102_000);
    expect(estimateEditBytes(sample, { width: 1600, height: 400 })).toBe(52_000);
  });

  it('reports reductions, increases and unchanged sizes without hiding growth', () => {
    expect(fileSizeChange(1000, 300)).toBe(-70);
    expect(fileSizeChange(1000, 1500)).toBe(50);
    expect(fileSizeChange(1000, 1000)).toBe(0);
    expect(fileSizeChange(0, 1000)).toBeUndefined();
  });

  it('keeps marks in ascending order and labels the mocked 80% setting as balanced', () => {
    expect(QUALITY_MARKS.map(({ quality }) => quality)).toEqual([30, 60, 85]);
    for (const { quality, label } of QUALITY_MARKS) expect(qualityLabel(quality)).toBe(label);
    expect(qualityLabel(1)).toBe('Small');
    expect(qualityLabel(80)).toBe('Balanced');
    expect(qualityLabel(100)).toBe('High');
  });
});
