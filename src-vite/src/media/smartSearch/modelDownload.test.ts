import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('./models', () => ({
  getModelDir: async (id: string) => `models\\${id}`,
  MODEL_FILES: ['visual/model.onnx'],
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.listen.mockResolvedValue(vi.fn());
});

describe('download state across navigation', () => {
  it('subscribes once and retains progress independently of mounted components', async () => {
    const { observeModelDownloads, useModelDownloads } = await import('./modelDownload');
    await observeModelDownloads();
    await observeModelDownloads();
    expect(mocks.listen).toHaveBeenCalledOnce();
    const onEvent = mocks.listen.mock.calls[0][1];
    onEvent({ payload: { modelId: 'balanced', fraction: 0.38 } });
    expect(useModelDownloads.getState().progress.balanced).toBe(0.38);
    onEvent({ payload: { modelId: 'balanced', fraction: 1 } });
    expect(useModelDownloads.getState().progress.balanced).toBe(1);
    expect(useModelDownloads.getState().revision).toBe(1);
  });

  it('tracks completion even when no final event arrives', async () => {
    mocks.invoke.mockResolvedValue({ status: 'completed' });
    const { downloadModel, useModelDownloads } = await import('./modelDownload');
    await expect(downloadModel('balanced')).resolves.toEqual({ status: 'completed' });
    expect(useModelDownloads.getState().progress.balanced).toBe(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      'download_model',
      expect.objectContaining({
        modelId: 'balanced',
        destDir: 'models\\balanced',
      }),
    );
  });

  it('retains existing progress when Rust reports an already-running download', async () => {
    mocks.invoke.mockResolvedValue({ status: 'alreadyRunning' });
    const { downloadModel, useModelDownloads } = await import('./modelDownload');
    useModelDownloads.setState({ progress: { balanced: 0.38 } });
    await downloadModel('balanced');
    expect(useModelDownloads.getState().progress.balanced).toBe(0.38);
  });

  it('clears progress when the download is cancelled', async () => {
    mocks.invoke.mockResolvedValue({ status: 'cancelled' });
    const { downloadModel, useModelDownloads } = await import('./modelDownload');
    await expect(downloadModel('balanced')).resolves.toEqual({ status: 'cancelled' });
    expect(useModelDownloads.getState().progress.balanced).toBeUndefined();
    expect(useModelDownloads.getState().revision).toBe(0);
  });

  it('clears busy state on failure and allows a retry', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('Offline'));
    const { downloadModel, useModelDownloads } = await import('./modelDownload');
    await expect(downloadModel('balanced')).rejects.toThrow('Offline');
    expect(useModelDownloads.getState().progress.balanced).toBeUndefined();
    mocks.invoke.mockResolvedValue({ status: 'completed' });
    await downloadModel('balanced');
    expect(useModelDownloads.getState().progress.balanced).toBe(1);
  });

  it('surfaces listener failures and retries subscription before starting a transfer', async () => {
    mocks.listen.mockRejectedValueOnce(new Error('Events unavailable'));
    const { downloadModel } = await import('./modelDownload');
    await expect(downloadModel('balanced')).rejects.toThrow('Events unavailable');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.invoke.mockResolvedValue({ status: 'completed' });
    await downloadModel('balanced');
    expect(mocks.listen).toHaveBeenCalledTimes(2);
  });
});
