import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  unlisten: vi.fn(),
  startIndexing: vi.fn(),
  observeDownloads: vi.fn(),
  rehydrate: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('./indexing', () => ({ startBackgroundIndexing: mocks.startIndexing }));
vi.mock('./modelDownload', () => ({
  observeModelDownloads: mocks.observeDownloads,
  useModelDownloads: create(() => ({ progress: {} as Record<string, number>, revision: 0 })),
}));
vi.mock('@/stores/smartSearchSettingsStore', () => ({
  SMART_SEARCH_SETTINGS_EVENT: 'smart-search://settings-changed',
  useSmartSearchSettingsStore: Object.assign(
    create(() => ({ activeModel: 'old-model', indexMissingAtStartup: true })),
    {
      persist: { rehydrate: mocks.rehydrate },
    },
  ),
}));

import { SMART_SEARCH_SETTINGS_EVENT, useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { observeSmartSearchChanges } from './lifecycle';
import { useModelDownloads } from './modelDownload';

describe('main-window smart search lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSmartSearchSettingsStore.setState({ activeModel: 'old-model' });
    useModelDownloads.setState({ progress: {} });
    mocks.listen.mockResolvedValue(mocks.unlisten);
    mocks.observeDownloads.mockResolvedValue(() => {});
  });

  it('starts indexing for a model selected in another window, without event echoes', async () => {
    const cleanup = await observeSmartSearchChanges();
    const onModelChanged = mocks.listen.mock.calls[0][1];
    expect(mocks.listen).toHaveBeenCalledWith(SMART_SEARCH_SETTINGS_EVENT, expect.any(Function));
    onModelChanged({ payload: { activeModel: 'new-model', indexMissingAtStartup: false } });
    onModelChanged({ payload: { activeModel: 'new-model', indexMissingAtStartup: false } });
    expect(useSmartSearchSettingsStore.getState().activeModel).toBe('new-model');
    expect(mocks.startIndexing).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('syncs the startup preference without launching indexing', async () => {
    const cleanup = await observeSmartSearchChanges();
    mocks.listen.mock.calls[0][1]({ payload: { indexMissingAtStartup: false } });
    expect(useSmartSearchSettingsStore.getState().indexMissingAtStartup).toBe(false);
    expect(mocks.startIndexing).not.toHaveBeenCalled();
    cleanup();
  });

  it('observes local selection and only completed downloads of the active model', async () => {
    const cleanup = await observeSmartSearchChanges();
    useSmartSearchSettingsStore.setState({ activeModel: 'new-model' });
    useModelDownloads.setState({ progress: { 'other-model': 1, 'new-model': 0.5 } });
    expect(mocks.startIndexing).toHaveBeenCalledTimes(1);
    useModelDownloads.setState({ progress: { 'new-model': 1 } });
    useModelDownloads.setState({ progress: { 'new-model': 1 } });
    expect(mocks.startIndexing).toHaveBeenCalledTimes(2);
    cleanup();
    useSmartSearchSettingsStore.setState({ activeModel: 'another-model' });
    expect(mocks.startIndexing).toHaveBeenCalledTimes(2);
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  it('removes subscriptions if initialization fails', async () => {
    mocks.observeDownloads.mockRejectedValueOnce(new Error('Cannot observe downloads'));
    await expect(observeSmartSearchChanges()).rejects.toThrow('Cannot observe downloads');
    useSmartSearchSettingsStore.setState({ activeModel: 'new-model' });
    expect(mocks.startIndexing).not.toHaveBeenCalled();
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });
});
