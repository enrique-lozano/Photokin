import { describe, expect, it } from 'vitest';
import { chunked } from '@/utils/array.utils';
import { IMPORT_BATCH_SIZE, isProgressTick, overallProgress } from './importProgress';

describe('overallProgress', () => {
  it('offsets a per-batch counter across the whole import', () => {
    const total = 2000;

    expect(overallProgress(0, 1, total)).toEqual({ done: 1, progress: 1 / 2000 });
    expect(overallProgress(0, IMPORT_BATCH_SIZE, total)).toEqual({ done: 200, progress: 0.1 });
    expect(overallProgress(IMPORT_BATCH_SIZE, 1, total)).toEqual({ done: 201, progress: 201 / 2000 });
    expect(overallProgress(1800, 200, total)).toEqual({ done: 2000, progress: 1 });
  });

  it('reports no progress fraction when the total is unknown', () => {
    expect(overallProgress(0, 3, 0)).toEqual({ done: 3, progress: null });
  });
});

describe('isProgressTick', () => {
  it('reports the first file, every 25th and the last one', () => {
    expect([1, 25, 50, 200].map((current) => isProgressTick(current, 200))).toEqual([true, true, true, true]);
  });

  it('skips the files in between', () => {
    expect([2, 24, 26, 199].map((current) => isProgressTick(current, 200))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('still reports the last file of a short batch', () => {
    expect(isProgressTick(7, 7)).toBe(true);
  });
});

describe('chunked', () => {
  it('splits a file list into consecutive batches, remainder last', () => {
    const files = Array.from({ length: 450 }, (_, index) => `f${index}`);
    const batches = chunked(files, IMPORT_BATCH_SIZE);

    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(batches[0][0]).toBe('f0');
    expect(batches[1][0]).toBe('f200');
    expect(batches.at(-1)?.at(-1)).toBe('f449');
  });

  it('returns no batches for an empty list', () => {
    expect(chunked([], IMPORT_BATCH_SIZE)).toEqual([]);
  });
});
