import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return {
    storage: values,
    check: vi.fn(),
    relaunch: vi.fn(),
    shutdownExiftool: vi.fn(),
    toastInfo: vi.fn(),
    toastWarning: vi.fn(),
    setProgress: vi.fn(),
    processErrors: [] as string[],
  };
});

vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), listen: vi.fn() }));
vi.mock('@/media/metadata/exiftool/exiftoolSession', () => ({
  shutdownExiftoolSession: mocks.shutdownExiftool,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { info: mocks.toastInfo, warning: mocks.toastWarning },
}));
vi.mock('@/system/processTracker', () => ({
  trackProcess: async (
    config: { kind: never; title: string; errorMessage: (error: unknown) => string },
    work: (reporter: unknown) => Promise<unknown>,
  ) => {
    // Resolved per call so it shares the store instance of the freshly loaded updater.
    const { useProcessStore } = await import('@/stores/processStore');
    const id = useProcessStore.getState().startProcess({ kind: config.kind, title: config.title });
    try {
      return await work({ update: vi.fn(), setProgress: mocks.setProgress, setIndeterminate: vi.fn() });
    } catch (error) {
      mocks.processErrors.push(config.errorMessage(error));
      throw error;
    } finally {
      useProcessStore.getState().removeProcess(id);
    }
  },
}));

function _fakeUpdate() {
  const calls: string[] = [];
  return {
    calls,
    version: '1.2.0',
    currentVersion: '1.0.0',
    rawJson: {},
    close: vi.fn(),
    download: vi.fn(async (onEvent: (event: unknown) => void) => {
      calls.push('download');
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      onEvent({ event: 'Finished' });
    }),
    install: vi.fn(async () => {
      calls.push('install');
    }),
  };
}

async function _loadUpdater() {
  vi.resetModules();
  const updater = await import('./appUpdater');
  const { useProcessStore } = await import('@/stores/processStore');
  const { DEFAULT_SETTINGS, useSettingsStore } = await import('@/stores/settingsStore');
  useSettingsStore.setState(DEFAULT_SETTINGS);
  return { ...updater, useProcessStore, useSettingsStore };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.storage.clear();
  mocks.processErrors.length = 0;
});

describe('update check on app start', () => {
  it('remembers the latest answer for this app version only', async () => {
    const update = _fakeUpdate();
    mocks.check.mockResolvedValueOnce({ ...update, rawJson: { pub_date: '2026-10-21T12:00:00Z' } });
    const { checkForAppUpdate, getLastUpdateCheck } = await _loadUpdater();

    await checkForAppUpdate();
    expect(getLastUpdateCheck()).toMatchObject({ version: '1.2.0', releasedAt: '2026-10-21T12:00:00Z' });

    mocks.check.mockResolvedValueOnce(null);
    await checkForAppUpdate();
    expect(getLastUpdateCheck()).toMatchObject({ version: null, releasedAt: null });

    const stored = JSON.parse(mocks.storage.get('photokin-last-update-check')!);
    mocks.storage.set('photokin-last-update-check', JSON.stringify({ ...stored, appVersion: 'older' }));
    expect(getLastUpdateCheck()).toBeNull();
  });
  it('never phones home from development builds', async () => {
    const { startAutoUpdateCheck } = await _loadUpdater();
    startAutoUpdateCheck();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('respects the user turning automatic checks off', async () => {
    vi.stubEnv('DEV', false);
    const { startAutoUpdateCheck, useSettingsStore } = await _loadUpdater();
    useSettingsStore.getState().setAutoCheckForUpdates(false);
    startAutoUpdateCheck();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('checks once per launch and offers to install a newer version', async () => {
    vi.stubEnv('DEV', false);
    const update = _fakeUpdate();
    mocks.check.mockResolvedValue(update);
    const { startAutoUpdateCheck } = await _loadUpdater();

    startAutoUpdateCheck();
    startAutoUpdateCheck();
    await vi.waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledOnce());

    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 15_000 });
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Photokin 1.2.0 is available',
      expect.objectContaining({
        duration: false,
        action: expect.objectContaining({ label: 'Install and restart' }),
      }),
    );
  });

  it('stays quiet when offline', async () => {
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.check.mockRejectedValue(new Error('error sending request'));
    const { startAutoUpdateCheck } = await _loadUpdater();

    startAutoUpdateCheck();
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());

    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });
});

describe('installing an update', () => {
  it('waits for running library tasks instead of interrupting them', async () => {
    const { installAppUpdate, useProcessStore } = await _loadUpdater();
    useProcessStore.getState().startProcess({ kind: 'sync' as never, title: 'Syncing' });

    await installAppUpdate();

    expect(mocks.toastWarning).toHaveBeenCalledWith('Finish or stop running tasks first');
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('downloads with progress, then installs and restarts', async () => {
    const update = _fakeUpdate();
    mocks.check.mockResolvedValue(update);
    mocks.relaunch.mockImplementation(async () => update.calls.push('relaunch'));
    mocks.shutdownExiftool.mockImplementation(() => update.calls.push('exiftool'));
    const { installAppUpdate } = await _loadUpdater();

    await installAppUpdate();

    expect(mocks.setProgress).toHaveBeenCalledWith(40, 100);
    expect(update.calls).toEqual(['download', 'exiftool', 'install', 'relaunch']);
  });

  it('does not install if a task started during the download', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update = _fakeUpdate();
    const { installAppUpdate, useProcessStore } = await _loadUpdater();
    update.download.mockImplementation(async () => {
      useProcessStore.getState().startProcess({ kind: 'import' as never, title: 'Importing' });
    });
    mocks.check.mockResolvedValue(update);

    await installAppUpdate();

    expect(update.install).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(mocks.processErrors).toEqual(['Finish or stop running tasks first']);
  });

  it('shows a friendly error when the download fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.check.mockRejectedValue(new Error('error sending request for url (https://github.com/...)'));
    const { installAppUpdate } = await _loadUpdater();

    await installAppUpdate();

    expect(mocks.processErrors).toEqual(['Couldn’t install the update']);
  });
});
