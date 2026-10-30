import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

type HiddenItemsStore = {
  /** Session-only visibility; initialized from the startup preference. */
  showHiddenItems: boolean;
  setShowHiddenItems: (show: boolean) => void;
};

export const useHiddenItemsStore = create<HiddenItemsStore>((set) => ({
  showHiddenItems: useSettingsStore.getState().showHiddenItemsAtStartup,
  setShowHiddenItems: (showHiddenItems) => set({ showHiddenItems }),
}));
