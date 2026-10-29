import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { copyImageFileToClipboard } from './clipboard';

describe('copyImageFileToClipboard', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes the native clipboard command with the given path', async () => {
    invokeMock.mockResolvedValue(undefined);

    await copyImageFileToClipboard('/photos/one.jpg');

    expect(invokeMock).toHaveBeenCalledWith('copy_image_to_clipboard', { path: '/photos/one.jpg' });
  });

  it('propagates a native failure', async () => {
    invokeMock.mockRejectedValue(new Error('unsupported format'));

    await expect(copyImageFileToClipboard('/photos/one.heic')).rejects.toThrow('unsupported format');
  });
});
