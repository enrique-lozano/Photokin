import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTableObservable, notifyTableUpdate } from './tableObservables';

describe('table update notifications', () => {
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of writes into one emission per table', () => {
    vi.useFakeTimers();

    const onAssets = vi.fn();
    const onFileTags = vi.fn();
    getTableObservable('assets').subscribe(onAssets);
    getTableObservable('fileTags').subscribe(onFileTags);

    // What applying one metadata batch looks like: many statements, few tables.
    for (let index = 0; index < 50; index += 1) {
      notifyTableUpdate('assets');
      notifyTableUpdate('fileTags');
    }

    expect(onAssets).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);

    expect(onAssets).toHaveBeenCalledTimes(1);
    expect(onFileTags).toHaveBeenCalledTimes(1);

    notifyTableUpdate('assets');
    vi.advanceTimersByTime(250);

    expect(onAssets).toHaveBeenCalledTimes(2);
    expect(onFileTags).toHaveBeenCalledTimes(1);
  });

  it('keeps a write that happens before the first subscriber', () => {
    vi.useFakeTimers();

    notifyTableUpdate('rootAlbums');

    const onRootAlbums = vi.fn();
    getTableObservable('rootAlbums').subscribe(onRootAlbums);

    vi.advanceTimersByTime(250);

    expect(onRootAlbums).toHaveBeenCalledTimes(1);
  });
});
