import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetsService } from '@/db/api/services/assets.service';
import { getCachedThumbnailPath, resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { errorLog } from '@/system/devLogger';
import { createMapThumbnailLoader } from './mapThumbnails';

vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getFiles: vi.fn() },
}));
vi.mock('@/media/thumbnails/thumbnail', () => ({
  getCachedThumbnailPath: vi.fn(),
  resolveThumbnailPath: vi.fn(),
}));
vi.mock('@/system/diskManager', () => ({ pathToImageSrc: (path: string) => `asset:${path}` }));
vi.mock('@/system/devLogger', () => ({ errorLog: vi.fn() }));

function _pin() {
  return { style: { backgroundImage: '' } } as HTMLElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCachedThumbnailPath).mockReturnValue(null);
  vi.mocked(AssetsService.getFiles).mockImplementation(
    async ({ assetIds }) =>
      (assetIds ?? []).map((id) => ({ id })) as Awaited<ReturnType<typeof AssetsService.getFiles>>,
  );
});

describe('map thumbnails', () => {
  it.each([ThumbnailSize.XS, ThumbnailSize.DEFAULT])(
    'paints cached %s synchronously without a database read',
    (size) => {
      vi.mocked(getCachedThumbnailPath).mockImplementation((_id, requested) =>
        requested === size ? 'cached.webp' : null,
      );
      const element = _pin();
      createMapThumbnailLoader()(new Map([['cached', element]]));
      expect(element.style.backgroundImage).toBe('url("asset:cached.webp")');
      expect(AssetsService.getFiles).not.toHaveBeenCalled();
      expect(resolveThumbnailPath).not.toHaveBeenCalled();
    },
  );

  it('paints ready images without waiting for the slowest thumbnail', async () => {
    let finishSlow!: (path: string) => void;
    vi.mocked(resolveThumbnailPath).mockImplementation(async (asset) =>
      asset.id === 'fast'
        ? 'fast.webp'
        : new Promise<string>((resolve) => {
            finishSlow = resolve;
          }),
    );
    const fast = _pin();
    const slow = _pin();
    createMapThumbnailLoader()(
      new Map([
        ['fast', fast],
        ['slow', slow],
      ]),
    );
    await vi.waitFor(() => expect(fast.style.backgroundImage).toBe('url("asset:fast.webp")'));
    expect(slow.style.backgroundImage).toBe('');
    finishSlow('slow.webp');
    await vi.waitFor(() => expect(slow.style.backgroundImage).toBe('url("asset:slow.webp")'));
  });

  it('shares in-flight work and paints the newest pins after a redraw', async () => {
    let finish!: (path: string) => void;
    vi.mocked(resolveThumbnailPath).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const load = createMapThumbnailLoader();
    const old = _pin();
    const current = _pin();
    load(new Map([['photo', old]]));
    load(new Map([['photo', current]]));
    await vi.waitFor(() => expect(resolveThumbnailPath).toHaveBeenCalledTimes(1));
    expect(AssetsService.getFiles).toHaveBeenCalledTimes(1);
    finish('photo.webp');
    await vi.waitFor(() => expect(current.style.backgroundImage).toBe('url("asset:photo.webp")'));
    expect(old.style.backgroundImage).toBe('');
    const cached = _pin();
    load(new Map([['photo', cached]]));
    expect(cached.style.backgroundImage).toBe('url("asset:photo.webp")');
    expect(AssetsService.getFiles).toHaveBeenCalledTimes(1);
  });

  it('reports failures and allows a later redraw to retry', async () => {
    vi.mocked(AssetsService.getFiles).mockRejectedValueOnce(new Error('Database unavailable'));
    const load = createMapThumbnailLoader();
    load(new Map([['photo', _pin()]]));
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());
    vi.mocked(resolveThumbnailPath).mockResolvedValue('photo.webp');
    const element = _pin();
    load(new Map([['photo', element]]));
    await vi.waitFor(() => expect(element.style.backgroundImage).toBe('url("asset:photo.webp")'));
  });
});
