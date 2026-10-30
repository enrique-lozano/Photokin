import { create } from 'zustand';

export type InfoSegment = 'overview' | 'tags' | 'location' | 'metadata';
export const useInfoPanelState = create<{
  segment: InfoSegment;
  captureExpanded: boolean;
  fileExpanded: boolean;
  setSegment: (segment: InfoSegment) => void;
  toggleCapture: () => void;
  toggleFile: () => void;
}>((set) => ({
  segment: 'overview',
  captureExpanded: false,
  fileExpanded: false,
  setSegment: (segment) => set({ segment }),
  toggleCapture: () => set((state) => ({ captureExpanded: !state.captureExpanded })),
  toggleFile: () => set((state) => ({ fileExpanded: !state.fileExpanded })),
}));
