import { create } from 'zustand';

export type InfoSegment = 'overview' | 'tags' | 'location' | 'metadata';
export const useInfoPanelState = create<{
  segment: InfoSegment;
  captureExpanded: boolean;
  fileExpanded: boolean;
  metadataQuery: string;
  setSegment: (segment: InfoSegment) => void;
  setMetadataQuery: (metadataQuery: string) => void;
  toggleCapture: () => void;
  toggleFile: () => void;
}>((set) => ({
  segment: 'overview',
  captureExpanded: false,
  fileExpanded: false,
  metadataQuery: '',
  setSegment: (segment) => set({ segment }),
  setMetadataQuery: (metadataQuery) => set({ metadataQuery }),
  toggleCapture: () => set((state) => ({ captureExpanded: !state.captureExpanded })),
  toggleFile: () => set((state) => ({ fileExpanded: !state.fileExpanded })),
}));
