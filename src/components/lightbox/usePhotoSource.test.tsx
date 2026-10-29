import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoSource } from './usePhotoSource';

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  layout: vi.fn(),
  setSrc: vi.fn(),
  setError: vi.fn(),
  setFullResolution: vi.fn(),
  setAttempt: vi.fn(),
  thumbnail: vi.fn(),
  preview: vi.fn(),
  decode: vi.fn(),
  revision: 0,
  stateIndex: 0,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: mocks.effect,
  useLayoutEffect: mocks.layout,
  useState: (initial: unknown) => [
    initial,
    [mocks.setSrc, mocks.setError, mocks.setFullResolution, mocks.setAttempt][mocks.stateIndex++],
  ],
}));
vi.mock('@/media/thumbnails/preview', async () => {
  const { WEBVIEW_DISPLAYABLE_IMAGE_FORMATS, getFileExtensionFromPath } =
    await import('@/common/supportedFormats');
  return {
    getOrCreateFullPreview: mocks.preview,
    needsGeneratedPreview: (filename: string) =>
      !WEBVIEW_DISPLAYABLE_IMAGE_FORMATS.has(getFileExtensionFromPath(filename)),
  };
});
vi.mock('@/media/thumbnails/thumbnail', () => ({ resolveThumbnailPath: mocks.thumbnail }));
vi.mock('@/system/diskManager', () => ({ pathToImageSrc: (path: string) => `asset:${path}` }));
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (state: { assetRevisions: Record<string, number> }) => unknown) =>
    selector({ assetRevisions: { a: mocks.revision } }),
}));

const asset = { id: 'a', filename: 'a.jpg', fullPath: 'C:\\photos\\a.jpg' };

function _render(photo: typeof asset | null = asset, enabled = true): (() => void) | undefined {
  mocks.stateIndex = 0;
  function Probe() {
    usePhotoSource(photo, enabled);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  for (const [layout] of mocks.layout.mock.calls) layout();
  return mocks.effect.mock.lastCall?.[0]();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revision = 0;
  mocks.thumbnail.mockResolvedValue(null);
  mocks.preview.mockResolvedValue('C:\\previews\\a.webp');
  mocks.decode.mockResolvedValue(undefined);
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('document', { querySelector: () => null });
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = mocks.decode;
    },
  );
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared full-resolution photo loading', () => {
  it('decodes an original before replacing the thumbnail', async () => {
    _render();
    await vi.waitFor(() =>
      expect(mocks.setSrc).toHaveBeenLastCalledWith('asset:C:\\photos\\a.jpg?v=0&attempt=0'),
    );
    expect(mocks.setFullResolution).toHaveBeenLastCalledWith(true);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('uses the native preview pipeline for HEIC', async () => {
    _render({ ...asset, filename: 'a.heic' });
    await vi.waitFor(() =>
      expect(mocks.setSrc).toHaveBeenLastCalledWith('asset:C:\\previews\\a.webp?v=0&attempt=0'),
    );
    expect(mocks.preview).toHaveBeenCalledWith({ id: asset.id, fullPath: asset.fullPath });
  });

  it('surfaces a preview failure instead of pretending a thumbnail is full size', async () => {
    mocks.preview.mockResolvedValue(null);
    _render({ ...asset, filename: 'a.heic' });
    await vi.waitFor(() =>
      expect(mocks.setError).toHaveBeenLastCalledWith(expect.stringContaining('Could not load')),
    );
    expect(mocks.setFullResolution).not.toHaveBeenCalledWith(true);
    expect(console.warn).toHaveBeenCalled();
  });

  it('reports decode errors and does not mark the image ready', async () => {
    mocks.decode.mockRejectedValue(new Error('unavailable'));
    _render();
    await vi.waitFor(() => expect(mocks.setError).toHaveBeenLastCalledWith(expect.any(String)));
    expect(mocks.setFullResolution).not.toHaveBeenCalledWith(true);
  });

  it('ignores asynchronous results after closing or changing the photo', async () => {
    let finish: (() => void) | undefined;
    mocks.decode.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const cleanup = _render();
    await vi.waitFor(() => expect(mocks.decode).toHaveBeenCalled());
    cleanup?.();
    finish?.();
    await Promise.resolve();
    expect(mocks.setFullResolution).not.toHaveBeenCalledWith(true);
  });

  it('versions the original when the asset revision changes', async () => {
    mocks.revision = 2;
    _render();
    await vi.waitFor(() =>
      expect(mocks.setSrc).toHaveBeenLastCalledWith('asset:C:\\photos\\a.jpg?v=2&attempt=0'),
    );
  });

  it('does not load an absent photo or a video owned by the video player', () => {
    _render(null);
    expect(mocks.decode).not.toHaveBeenCalled();
    expect(mocks.thumbnail).not.toHaveBeenCalled();
    mocks.effect.mockClear();
    _render(asset, false);
    expect(mocks.decode).not.toHaveBeenCalled();
  });
});
