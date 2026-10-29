import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the behaviour behind the lightbox copy button: clicking it should
 * eventually surface a success toast, whether the asset is a format the webview
 * renders directly (JPEG) or one that has to go through a generated preview
 * (HEIF). Both cases are exercised so the webview-native vs generated-preview
 * branch is decided by production logic (`needsGeneratedPreview`) rather than a
 * hand-set flag.
 *
 * The actual bitmap encoding (`copyImageFileToClipboard`) and preview generation
 * are stubbed — those hit the browser canvas and Tauri/ffmpeg, which aren't
 * available under vitest and are covered separately in `clipboard.test.ts`.
 */
const { copyImageFileToClipboardMock, getOrCreateFullPreviewMock, toastMock } = vi.hoisted(() => ({
  copyImageFileToClipboardMock: vi.fn(),
  getOrCreateFullPreviewMock: vi.fn(),
  toastMock: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/system/clipboard', () => ({
  copyImageFileToClipboard: (...args: unknown[]) => copyImageFileToClipboardMock(...args),
}));
vi.mock('@/components/ui/toast', () => ({ toast: toastMock }));
// The real preview module pulls in Tauri (which needs a webview `window`), so we
// mock it — but keep `needsGeneratedPreview` faithful to production by rebuilding
// it from the same pure format helpers the real implementation uses.
vi.mock('@/media/thumbnails/preview', async () => {
  const { getFileExtensionFromPath, isSupportedVideoPath } = await import('@/common/supportedFormats');
  const WEBVIEW_DISPLAYABLE = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.ico',
    '.svg',
    '.avif',
  ]);
  return {
    needsGeneratedPreview: (filename: string) =>
      !isSupportedVideoPath(filename) && !WEBVIEW_DISPLAYABLE.has(getFileExtensionFromPath(filename)),
    getOrCreateFullPreview: getOrCreateFullPreviewMock,
  };
});

import { copyImageToClipboardWithFeedback } from './copyImageAction';

const JPG_ASSET = {
  id: 'nasa-jpg',
  filename: 'art002e009288~orig.jpg',
  fullPath: '/demo/images/Nasa/art002e009288~orig.jpg',
};
const HEIF_ASSET = {
  id: 'nokia-heif',
  filename: 'HMD_Nokia_8.3_5G.heif',
  fullPath: '/demo/exif-samples/heic/mobile/HMD_Nokia_8.3_5G.heif',
};

beforeEach(() => {
  copyImageFileToClipboardMock.mockResolvedValue(undefined);
  getOrCreateFullPreviewMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('copyImageToClipboardWithFeedback', () => {
  it('copies a webview-native JPEG from the original and reports success', async () => {
    await copyImageToClipboardWithFeedback(JPG_ASSET);

    expect(toastMock.loading).toHaveBeenCalledWith('Copying image...', expect.any(Object));
    expect(getOrCreateFullPreviewMock).not.toHaveBeenCalled();
    expect(copyImageFileToClipboardMock).toHaveBeenCalledWith(JPG_ASSET.fullPath);

    expect(toastMock.success).toHaveBeenCalledWith('Image copied to clipboard', expect.any(Object));
    expect(toastMock.error).not.toHaveBeenCalled();

    // Loading and success update the same toast in place.
    const loadingId = toastMock.loading.mock.calls[0][1].id;
    const successId = toastMock.success.mock.calls[0][1].id;
    expect(successId).toBe(loadingId);
  });

  it('copies a HEIF through its generated preview and reports success', async () => {
    const previewPath = '/thumbs/PREVIEW__nokia-heif.webp';
    getOrCreateFullPreviewMock.mockResolvedValue(previewPath);

    await copyImageToClipboardWithFeedback(HEIF_ASSET);

    expect(getOrCreateFullPreviewMock).toHaveBeenCalledWith(HEIF_ASSET);
    expect(copyImageFileToClipboardMock).toHaveBeenCalledWith(previewPath);
    expect(toastMock.success).toHaveBeenCalledWith('Image copied to clipboard', expect.any(Object));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('surfaces an error toast (without throwing) when copying fails', async () => {
    copyImageFileToClipboardMock.mockRejectedValueOnce(new Error('boom'));

    await expect(copyImageToClipboardWithFeedback(JPG_ASSET)).resolves.toBeUndefined();

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('reports an error when a HEIF preview cannot be generated', async () => {
    getOrCreateFullPreviewMock.mockResolvedValue(null);

    await copyImageToClipboardWithFeedback(HEIF_ASSET);

    expect(copyImageFileToClipboardMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
