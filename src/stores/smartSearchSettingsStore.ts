import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CLIP_MODEL_ID } from '@/media/smartSearch/models';

type SmartSearchSettingsStore = {
  /** HuggingFace repo id of the CLIP model used for indexing and search. */
  activeModel: string;
  setActiveModel: (id: string) => void;
};

export const useSmartSearchSettingsStore = create<SmartSearchSettingsStore>()(
  persist(
    (set) => ({
      activeModel: DEFAULT_CLIP_MODEL_ID,
      setActiveModel: (id) => set({ activeModel: id }),
    }),
    { name: 'photokin-smart-search-settings', version: 1 },
  ),
);
