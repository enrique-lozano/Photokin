import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage = vi.fn();
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }));

import { installExiftool, locateExiftool, type ExiftoolInstallProgress } from './exiftoolSetup';

describe('ExifTool setup IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards native stage and percentage updates through a channel', async () => {
    const updates: ExiftoolInstallProgress[] = [
      { stage: 'downloading', version: '13.59', percent: 62 },
      { stage: 'unpacking', version: '13.59', percent: 50 },
      { stage: 'checking', version: '13.59', percent: null },
    ];
    invokeMock.mockImplementation(async (_command, { onProgress }) => {
      for (const progress of updates) onProgress.onmessage(progress);
    });
    const onProgress = vi.fn();
    await installExiftool(onProgress);

    expect(invokeMock).toHaveBeenCalledWith('install_exiftool', {
      onProgress: expect.objectContaining({ onmessage: onProgress }),
    });
    expect(onProgress.mock.calls.map(([update]) => update)).toEqual(updates);
  });

  it('propagates installation failures', async () => {
    invokeMock.mockRejectedValueOnce(new Error('Download failed'));
    await expect(installExiftool(vi.fn())).rejects.toThrow('Download failed');
  });

  it('does not change the tool location when manual selection is cancelled', async () => {
    openMock.mockResolvedValueOnce(null);
    expect(await locateExiftool()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('validates the selected executable using the existing native command', async () => {
    openMock.mockResolvedValueOnce('C:\\tools\\exiftool.exe');
    invokeMock.mockResolvedValueOnce(undefined);
    expect(await locateExiftool()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('set_exiftool_location', {
      exePath: 'C:\\tools\\exiftool.exe',
    });
  });

  it('propagates invalid manual selections', async () => {
    openMock.mockResolvedValueOnce('C:\\tools\\other.exe');
    invokeMock.mockRejectedValueOnce(new Error('Select ExifTool'));
    await expect(locateExiftool()).rejects.toThrow('Select ExifTool');
  });
});
