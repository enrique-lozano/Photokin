import { toast } from '@/components/ui/toast';
import { DEFAULT_CLIP_MODEL_ID } from '@/media/smartSearch/models';
import { isTauri } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SMART_SEARCH_SETTINGS_EVENT = 'smart-search://settings-changed';

export type SmartSearchPreferences = {
  /** HuggingFace repo id of the CLIP model used for indexing and search. */
  activeModel: string;
  indexMissingAtStartup: boolean;
};

type SmartSearchSettingsStore = SmartSearchPreferences & {
  setActiveModel: (id: string) => void;
  setIndexMissingAtStartup: (enabled: boolean) => void;
};

export const useSmartSearchSettingsStore = create<SmartSearchSettingsStore>()(
  persist(
    (set, get) => {
      const update = (patch: Partial<SmartSearchPreferences>) => {
        set(patch);
        if (isTauri()) {
          const { activeModel, indexMissingAtStartup } = get();
          void emit(SMART_SEARCH_SETTINGS_EVENT, { activeModel, indexMissingAtStartup }).catch((error) => {
            toast.error(`Could not sync smart search settings: ${String(error)}`);
          });
        }
      };
      return {
        activeModel: DEFAULT_CLIP_MODEL_ID,
        indexMissingAtStartup: true,
        setActiveModel: (activeModel) => update({ activeModel }),
        setIndexMissingAtStartup: (indexMissingAtStartup) => update({ indexMissingAtStartup }),
      };
    },
    { name: 'photokin-smart-search-settings', version: 1 },
  ),
);
