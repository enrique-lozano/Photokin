import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, exists, mkdir, appLocalDataDir } = vi.hoisted(() => ({
  invoke: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  appLocalDataDir: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: (...args: unknown[]) => appLocalDataDir(...args),
  join: async (...parts: string[]) => parts.join('/'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: (...args: unknown[]) => exists(...args),
  mkdir: (...args: unknown[]) => mkdir(...args),
  remove: vi.fn(),
}));

vi.mock('@/system/diskManager', () => ({
  joinPathSync: (...segments: string[]) => segments.join('/'),
  tauriFileStat: vi.fn(),
}));

vi.mock('@/system/commandRunner', () => ({
  CommandError: class extends Error {},
  spawnSidecar: vi.fn(),
}));

vi.mock('@/db/api/services/assetFingerprints.service', () => ({
  storeAssetPerceptualHash: vi.fn(),
}));

import { ThumbnailSize } from './thumbnailOptions.model';

describe('resolveThumbnailPath concurrency', () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    exists.mockReset();
    mkdir.mockReset().mockResolvedValue(undefined);
    appLocalDataDir.mockReset().mockResolvedValue('/tmp');
  });

  it('runs at most four thumbnail generations at once', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    let active = 0;
    let peak = 0;
    const written = new Set<string>();

    exists.mockImplementation(async (path: string) => written.has(path));

    invoke.mockImplementation(async (_cmd: string, args: { outputPath: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      written.add(args.outputPath);
      active -= 1;
    });

    const jobs = Array.from({ length: 6 }, (_, index) =>
      resolveThumbnailPath({ id: `asset-${index}`, fullPath: `C:/photos/${index}.jpg` }, ThumbnailSize.XS, {
        generationDelayMs: 0,
      }),
    );

    const results = await Promise.all(jobs);

    expect(peak).toBeLessThanOrEqual(4);
    expect(invoke).toHaveBeenCalledTimes(6);
    expect(results.every((path) => typeof path === 'string')).toBe(true);
  });

  it('shares the base-directory IPC across a cold batch of 150 faces', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    exists.mockResolvedValue(true);

    await Promise.all(
      Array.from({ length: 150 }, (_, index) =>
        resolveThumbnailPath({ id: `person-${index}`, fullPath: `C:/photos/${index}.jpg` }),
      ),
    );

    expect(appLocalDataDir).toHaveBeenCalledOnce();
    expect(exists).toHaveBeenCalledTimes(150);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shares an existing-thumbnail lookup between the sidebar and overview', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    exists.mockResolvedValue(true);
    const asset = { id: 'shared-avatar', fullPath: 'C:/photos/shared.jpg' };

    const paths = await Promise.all(Array.from({ length: 4 }, () => resolveThumbnailPath(asset)));

    expect(new Set(paths).size).toBe(1);
    expect(exists).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('generates a missing avatar only once for concurrent consumers', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    const written = new Set<string>();
    exists.mockImplementation(async (path: string) => written.has(path));
    invoke.mockImplementation(async (_cmd: string, args: { outputPath: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      written.add(args.outputPath);
    });
    const asset = { id: 'missing-avatar', fullPath: 'C:/photos/missing.jpg' };

    const paths = await Promise.all(Array.from({ length: 4 }, () => resolveThumbnailPath(asset)));

    expect(paths.every((path) => typeof path === 'string')).toBe(true);
    expect(new Set(paths).size).toBe(1);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('deduplicates generation even when callers use independent cancellation signals', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    const written = new Set<string>();
    exists.mockImplementation(async (path: string) => written.has(path));
    invoke.mockImplementation(async (_cmd: string, args: { outputPath: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      written.add(args.outputPath);
    });
    const asset = { id: 'independent-avatar', fullPath: 'C:/photos/independent.jpg' };

    const paths = await Promise.all(
      Array.from({ length: 4 }, () =>
        resolveThumbnailPath(asset, ThumbnailSize.DEFAULT, { signal: new AbortController().signal }),
      ),
    );

    expect(paths.every((path) => typeof path === 'string')).toBe(true);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('allows retrying the directory lookup after an IPC failure', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    exists.mockResolvedValue(true);
    appLocalDataDir.mockRejectedValueOnce(new Error('IPC failed'));
    const asset = { id: 'retry-avatar', fullPath: 'C:/photos/retry.jpg' };

    await expect(resolveThumbnailPath(asset)).rejects.toThrow('IPC failed');
    await expect(resolveThumbnailPath(asset)).resolves.toContain('retry-avatar');
    expect(appLocalDataDir).toHaveBeenCalledTimes(2);
  });

  it('does not let an abandoned caller cancel another consumer of the same avatar', async () => {
    const { resolveThumbnailPath } = await import('./thumbnail');
    const written = new Set<string>();
    exists.mockImplementation(async (path: string) => written.has(path));
    invoke.mockImplementation(async (_cmd: string, args: { outputPath: string }) => {
      written.add(args.outputPath);
    });
    const asset = { id: 'cancelled-avatar', fullPath: 'C:/photos/cancelled.jpg' };
    const controller = new AbortController();
    controller.abort();

    const [abandoned, active] = await Promise.all([
      resolveThumbnailPath(asset, ThumbnailSize.DEFAULT, { signal: controller.signal }),
      resolveThumbnailPath(asset),
    ]);

    expect(abandoned).toBeNull();
    expect(active).toContain('cancelled-avatar');
    expect(invoke).toHaveBeenCalledOnce();
  });
});
