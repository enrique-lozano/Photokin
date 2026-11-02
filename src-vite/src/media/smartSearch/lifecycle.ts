import {
  SMART_SEARCH_SETTINGS_EVENT,
  type SmartSearchPreferences,
  useSmartSearchSettingsStore,
} from '@/stores/smartSearchSettingsStore';
import { listen } from '@tauri-apps/api/event';
import { startBackgroundIndexing } from './indexing';
import { observeModelDownloads, useModelDownloads } from './modelDownload';

export async function observeSmartSearchChanges(): Promise<() => void> {
  const unsubscribeModel = useSmartSearchSettingsStore.subscribe((state, previous) => {
    if (state.activeModel !== previous.activeModel) startBackgroundIndexing();
  });
  const unsubscribeDownloads = useModelDownloads.subscribe((state, previous) => {
    const modelId = useSmartSearchSettingsStore.getState().activeModel;
    if (state.progress[modelId] === 1 && previous.progress[modelId] !== 1) {
      startBackgroundIndexing();
    }
  });
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<SmartSearchPreferences>(SMART_SEARCH_SETTINGS_EVENT, ({ payload }) => {
      useSmartSearchSettingsStore.setState(payload);
    });
    await observeModelDownloads();
    await useSmartSearchSettingsStore.persist.rehydrate();
  } catch (error) {
    unsubscribeModel();
    unsubscribeDownloads();
    unlisten?.();
    throw error;
  }

  return () => {
    unsubscribeModel();
    unsubscribeDownloads();
    unlisten?.();
  };
}
