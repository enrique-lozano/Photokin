import {
  DEFAULT_FACE_RECOGNITION_OPTIONS,
  FaceDetectionSize,
  FaceRecognitionOptions,
  isFaceDetectionSize,
} from '@/media/faces/faceRecognition';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FaceScanSettings = FaceRecognitionOptions & {
  /** Album ids a Scan is limited to. Empty means the whole library. */
  scanAlbumIds: string[];
  /** When scanning specific albums, also include their nested sub-albums. */
  scanIncludeSubAlbums: boolean;
};

type FaceScanSettingsStore = FaceScanSettings & {
  setFaceDetectionSize: (value: FaceDetectionSize) => void;
  setMinFaceConfidence: (value: number) => void;
  setKnownEmbeddingsPerTag: (value: number) => void;
  setMatchMaxDistance: (value: number) => void;
  setScanAlbumIds: (value: string[]) => void;
  setScanIncludeSubAlbums: (value: boolean) => void;
  resetRecognitionSettings: () => void;
};

export const DEFAULT_FACE_SCAN_SETTINGS: FaceScanSettings = {
  ...DEFAULT_FACE_RECOGNITION_OPTIONS,
  scanAlbumIds: [],
  scanIncludeSubAlbums: true,
};

export const useFaceScanSettingsStore = create<FaceScanSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_FACE_SCAN_SETTINGS,
      setFaceDetectionSize: (value) => set({ faceDetectionSize: value }),
      setMinFaceConfidence: (value) => set({ minFaceConfidence: value }),
      setKnownEmbeddingsPerTag: (value) => set({ knownEmbeddingsPerTag: value }),
      setMatchMaxDistance: (value) => set({ matchMaxDistance: value }),
      setScanAlbumIds: (value) => set({ scanAlbumIds: value }),
      setScanIncludeSubAlbums: (value) => set({ scanIncludeSubAlbums: value }),
      resetRecognitionSettings: () => set({ ...DEFAULT_FACE_RECOGNITION_OPTIONS }),
    }),
    {
      name: 'photokin-face-scan-settings',
      version: 5,
      migrate: (persisted) => _sanitizePersisted(persisted),
    },
  ),
);

function _sanitizePersisted(persisted: unknown): FaceScanSettings {
  if (typeof persisted !== 'object' || persisted === null) return { ...DEFAULT_FACE_SCAN_SETTINGS };

  const stored = persisted as Record<string, unknown>;
  const next: FaceScanSettings = { ...DEFAULT_FACE_SCAN_SETTINGS };

  if (isFaceDetectionSize(stored.faceDetectionSize)) next.faceDetectionSize = stored.faceDetectionSize;
  if (typeof stored.minFaceConfidence === 'number') next.minFaceConfidence = stored.minFaceConfidence;
  if (typeof stored.knownEmbeddingsPerTag === 'number') {
    next.knownEmbeddingsPerTag = stored.knownEmbeddingsPerTag;
  }
  if (typeof stored.matchMaxDistance === 'number') next.matchMaxDistance = stored.matchMaxDistance;
  if (Array.isArray(stored.scanAlbumIds) && stored.scanAlbumIds.every((id) => typeof id === 'string')) {
    next.scanAlbumIds = stored.scanAlbumIds;
  }
  if (typeof stored.scanIncludeSubAlbums === 'boolean') {
    next.scanIncludeSubAlbums = stored.scanIncludeSubAlbums;
  }

  return next;
}
