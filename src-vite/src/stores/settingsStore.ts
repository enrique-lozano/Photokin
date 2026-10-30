import {
  DEFAULT_METADATA_MODE,
  DEFAULT_WRITE_BACK_TIMING,
  MetadataMode,
  WriteBackTiming,
} from '@/common/metadataOptions';
import { DEFAULT_RATING_MODE, RatingMode } from '@/common/ratingModeOptions';
import { DEFAULT_RESYNC_MODE, ResyncMode } from '@/common/resyncOptions';
import { Appearance, SCALE_VALUES } from '@/utils/theme';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Settings tabs. Values are persisted, so they never change once shipped. */
export enum SettingsTab {
  General = 0,
  Library = 1,
  About = 2,
  System = 3,
  Viewer = 4,
  Metadata = 5,
}

export type TimelineGroupBy = 'day' | 'month' | 'year';
export type ViewerMouseWheel = 'navigate' | 'zoom';

export interface SettingsState {
  tabIndex: number;
  appearance: Appearance;
  lightTheme: number;
  darkTheme: number;
  scale: number;
  font: number;
  /** Whether Photokin checks for new and missing files after startup. */
  checkFoldersAtStartup: boolean;
  /** How the library sync decides an indexed file changed on disk. */
  resyncMode: ResyncMode;
  /** Whether Photokin may write edits back into the original files' metadata. */
  metadataMode: MetadataMode;
  /** When edits are flushed back into files (only relevant in `full` mode). */
  writeBackTiming: WriteBackTiming;
  /**
   * Whether a metadata write restores the file's previous modification time, so
   * sync and backup tools don't flag a photo Photokin only re-tagged.
   */
  preserveFileModifyTime: boolean;
  /** Whether photos are marked with a single favorite heart or a 1–5 star rating. */
  ratingMode: RatingMode;
  /**
   * In `favorites` mode with metadata write-back enabled, whether favoriting a
   * photo also writes a 5-star rating into the original file. Ignored in `stars`
   * mode (ratings always follow the normal write-back rules there).
   */
  embedFavorites: boolean;
  /** Whether timeline group headers show the number of photos in the group. */
  showTimelineGroupCount: boolean;
  /** Whether timeline group headers show the dominant location of the group. */
  showTimelineGroupLocation: boolean;
  /** Calendar unit used to group photos in timeline galleries. */
  timelineGroupBy: TimelineGroupBy;
  /** Include pending face detections in Alone/Group/No people filters. */
  countUnverifiedFaces: boolean;
  /** Initial visibility for hidden people, faces, and albums each launch. */
  showHiddenItemsAtStartup: boolean;
  autoPlayVideo: boolean;
  loopVideo: boolean;
  viewerMouseWheel: ViewerMouseWheel;
  showPhotoDescription: boolean;
  /** Program that "Open in…" uses for photos. Empty means the system default. */
  externalImageAppPath: string;
  /** Program that "Open in…" uses for videos. Empty means the system default. */
  externalVideoAppPath: string;
  /** Whether Photokin asks GitHub for a newer version when the app starts. */
  autoCheckForUpdates: boolean;
}

interface SettingsStore extends SettingsState {
  setTabIndex: (tabIndex: number) => void;
  setAppearance: (appearance: Appearance) => void;
  setLightTheme: (lightTheme: number) => void;
  setDarkTheme: (darkTheme: number) => void;
  setScale: (scale: number) => void;
  setFont: (font: number) => void;
  setCheckFoldersAtStartup: (checkFoldersAtStartup: boolean) => void;
  setResyncMode: (resyncMode: ResyncMode) => void;
  setMetadataMode: (metadataMode: MetadataMode) => void;
  setWriteBackTiming: (writeBackTiming: WriteBackTiming) => void;
  setPreserveFileModifyTime: (preserveFileModifyTime: boolean) => void;
  setRatingMode: (ratingMode: RatingMode) => void;
  setEmbedFavorites: (embedFavorites: boolean) => void;
  setShowTimelineGroupCount: (showTimelineGroupCount: boolean) => void;
  setShowTimelineGroupLocation: (showTimelineGroupLocation: boolean) => void;
  setTimelineGroupBy: (timelineGroupBy: TimelineGroupBy) => void;
  setCountUnverifiedFaces: (countUnverifiedFaces: boolean) => void;
  setShowHiddenItemsAtStartup: (showHiddenItemsAtStartup: boolean) => void;
  setAutoPlayVideo: (autoPlayVideo: boolean) => void;
  setLoopVideo: (loopVideo: boolean) => void;
  setViewerMouseWheel: (viewerMouseWheel: ViewerMouseWheel) => void;
  setShowPhotoDescription: (showPhotoDescription: boolean) => void;
  setExternalImageAppPath: (externalImageAppPath: string) => void;
  setExternalVideoAppPath: (externalVideoAppPath: string) => void;
  setAutoCheckForUpdates: (autoCheckForUpdates: boolean) => void;
}

export const DEFAULT_SETTINGS: SettingsState = {
  tabIndex: 0,
  appearance: Appearance.Dark,
  lightTheme: 0,
  darkTheme: 0,
  scale: 1,
  font: 0,
  checkFoldersAtStartup: false,
  resyncMode: DEFAULT_RESYNC_MODE,
  metadataMode: DEFAULT_METADATA_MODE,
  writeBackTiming: DEFAULT_WRITE_BACK_TIMING,
  preserveFileModifyTime: false,
  ratingMode: DEFAULT_RATING_MODE,
  embedFavorites: false,
  showTimelineGroupCount: true,
  showTimelineGroupLocation: true,
  timelineGroupBy: 'day',
  countUnverifiedFaces: true,
  showHiddenItemsAtStartup: false,
  autoPlayVideo: true,
  loopVideo: false,
  viewerMouseWheel: 'navigate',
  showPhotoDescription: true,
  externalImageAppPath: '',
  externalVideoAppPath: '',
  autoCheckForUpdates: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setTabIndex: (tabIndex) => set({ tabIndex }),
      setAppearance: (appearance) => set({ appearance }),
      setLightTheme: (lightTheme) => set({ lightTheme }),
      setDarkTheme: (darkTheme) => set({ darkTheme }),
      setScale: (scale) => set({ scale }),
      setFont: (font) => set({ font }),
      setCheckFoldersAtStartup: (checkFoldersAtStartup) => set({ checkFoldersAtStartup }),
      setResyncMode: (resyncMode) => set({ resyncMode }),
      setMetadataMode: (metadataMode) => set({ metadataMode }),
      setWriteBackTiming: (writeBackTiming) => set({ writeBackTiming }),
      setPreserveFileModifyTime: (preserveFileModifyTime) => set({ preserveFileModifyTime }),
      setRatingMode: (ratingMode) => set({ ratingMode }),
      setEmbedFavorites: (embedFavorites) => set({ embedFavorites }),
      setShowTimelineGroupCount: (showTimelineGroupCount) => set({ showTimelineGroupCount }),
      setShowTimelineGroupLocation: (showTimelineGroupLocation) => set({ showTimelineGroupLocation }),
      setTimelineGroupBy: (timelineGroupBy) => set({ timelineGroupBy }),
      setCountUnverifiedFaces: (countUnverifiedFaces) => set({ countUnverifiedFaces }),
      setShowHiddenItemsAtStartup: (showHiddenItemsAtStartup) => set({ showHiddenItemsAtStartup }),
      setAutoPlayVideo: (autoPlayVideo) => set({ autoPlayVideo }),
      setLoopVideo: (loopVideo) => set({ loopVideo }),
      setViewerMouseWheel: (viewerMouseWheel) => set({ viewerMouseWheel }),
      setShowPhotoDescription: (showPhotoDescription) => set({ showPhotoDescription }),
      setExternalImageAppPath: (externalImageAppPath) => set({ externalImageAppPath }),
      setExternalVideoAppPath: (externalVideoAppPath) => set({ externalVideoAppPath }),
      setAutoCheckForUpdates: (autoCheckForUpdates) => set({ autoCheckForUpdates }),
    }),
    {
      name: 'photokin-settings',
      // A persisted blob written by an older schema can hold values that are no
      // longer valid (an out-of-range `scale` reaches the root font size and can
      // blank out every label). Sanitize on rehydrate so a bad stored value
      // repairs itself instead of bricking the UI.
      merge: (persisted, current) => ({ ...current, ..._sanitizePersisted(persisted) }),
    },
  ),
);

function _sanitizePersisted(persisted: unknown): Partial<SettingsState> {
  if (typeof persisted !== 'object' || persisted === null) return {};

  const stored = persisted as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof SettingsState>) {
    if (!(key in stored)) continue;

    const value = stored[key];
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
    clean[key] = value;
  }

  if (clean.appearance !== Appearance.Light && clean.appearance !== Appearance.Dark) {
    delete clean.appearance;
  }
  if (!SCALE_VALUES.some((value) => value === clean.scale)) {
    delete clean.scale;
  }
  if (!Number.isInteger(clean.font) || (clean.font as number) < 0) {
    delete clean.font;
  }
  if (!['day', 'month', 'year'].includes(clean.timelineGroupBy as string)) {
    delete clean.timelineGroupBy;
  }
  if (!['navigate', 'zoom'].includes(clean.viewerMouseWheel as string)) {
    delete clean.viewerMouseWheel;
  }

  return clean as Partial<SettingsState>;
}
