import { isMetadataMode, isWriteBackTiming } from '@/common/metadataOptions';
import { RatingMode } from '@/common/ratingModeOptions';
import { isResyncMode } from '@/common/resyncOptions';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { TimelineGroupBy, useSettingsStore, ViewerMouseWheel } from '../stores/settingsStore';
import { Appearance, applyAllSettings } from '../utils/theme';
import type { ExternalAppKind } from '@/system/externalApp';

export function useSettingsSync(): void {
  const appearance = useSettingsStore((state) => state.appearance);
  const lightTheme = useSettingsStore((state) => state.lightTheme);
  const darkTheme = useSettingsStore((state) => state.darkTheme);
  const scale = useSettingsStore((state) => state.scale);
  const font = useSettingsStore((state) => state.font);

  useEffect(() => {
    applyAllSettings({ appearance, lightTheme, darkTheme, scale, font });
  }, [appearance, lightTheme, darkTheme, scale, font]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    void (async () => {
      unlisteners.push(
        await listen<number>('settings-tabIndex-changed', (event) => {
          useSettingsStore.getState().setTabIndex(event.payload);
        }),
      );
      unlisteners.push(
        await listen<Appearance>('settings-appearance-changed', (event) => {
          useSettingsStore.getState().setAppearance(event.payload);
        }),
      );
      unlisteners.push(
        await listen<number>('settings-lightTheme-changed', (event) => {
          useSettingsStore.getState().setLightTheme(event.payload);
        }),
      );
      unlisteners.push(
        await listen<number>('settings-darkTheme-changed', (event) => {
          useSettingsStore.getState().setDarkTheme(event.payload);
        }),
      );
      unlisteners.push(
        await listen<number>('settings-scale-changed', (event) => {
          useSettingsStore.getState().setScale(event.payload);
        }),
      );
      unlisteners.push(
        await listen<number>('settings-font-changed', (event) => {
          useSettingsStore.getState().setFont(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-checkFoldersAtStartup-changed', (event) => {
          useSettingsStore.getState().setCheckFoldersAtStartup(event.payload);
        }),
      );
      unlisteners.push(
        await listen<string>('settings-resyncMode-changed', (event) => {
          if (isResyncMode(event.payload)) {
            useSettingsStore.getState().setResyncMode(event.payload);
          }
        }),
      );
      unlisteners.push(
        await listen<string>('settings-metadataMode-changed', (event) => {
          if (isMetadataMode(event.payload)) {
            useSettingsStore.getState().setMetadataMode(event.payload);
          }
        }),
      );
      unlisteners.push(
        await listen<string>('settings-writeBackTiming-changed', (event) => {
          if (isWriteBackTiming(event.payload)) {
            useSettingsStore.getState().setWriteBackTiming(event.payload);
          }
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-preserveFileModifyTime-changed', (event) => {
          useSettingsStore.getState().setPreserveFileModifyTime(event.payload);
        }),
      );
      unlisteners.push(
        await listen<RatingMode>('settings-ratingMode-changed', (event) => {
          useSettingsStore.getState().setRatingMode(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-embedFavorites-changed', (event) => {
          useSettingsStore.getState().setEmbedFavorites(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-showTimelineGroupCount-changed', (event) => {
          useSettingsStore.getState().setShowTimelineGroupCount(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-showTimelineGroupLocation-changed', (event) => {
          useSettingsStore.getState().setShowTimelineGroupLocation(event.payload);
        }),
      );
      unlisteners.push(
        await listen<TimelineGroupBy>('settings-timelineGroupBy-changed', (event) => {
          if (['day', 'month', 'year'].includes(event.payload)) {
            useSettingsStore.getState().setTimelineGroupBy(event.payload);
          }
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-countUnverifiedFaces-changed', (event) => {
          useSettingsStore.getState().setCountUnverifiedFaces(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-showHiddenItemsAtStartup-changed', (event) => {
          useSettingsStore.getState().setShowHiddenItemsAtStartup(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-autoPlayVideo-changed', (event) => {
          useSettingsStore.getState().setAutoPlayVideo(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-loopVideo-changed', (event) => {
          useSettingsStore.getState().setLoopVideo(event.payload);
        }),
      );
      unlisteners.push(
        await listen<ViewerMouseWheel>('settings-viewerMouseWheel-changed', (event) => {
          if (event.payload === 'navigate' || event.payload === 'zoom') {
            useSettingsStore.getState().setViewerMouseWheel(event.payload);
          }
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-showPhotoDescription-changed', (event) => {
          useSettingsStore.getState().setShowPhotoDescription(event.payload);
        }),
      );
      unlisteners.push(
        await listen<boolean>('settings-autoCheckForUpdates-changed', (event) => {
          useSettingsStore.getState().setAutoCheckForUpdates(event.payload);
        }),
      );
      unlisteners.push(
        await listen<{ kind: ExternalAppKind; path: string }>('settings-externalApp-changed', (event) => {
          const { kind, path } = event.payload;
          if (typeof path !== 'string') return;
          if (kind === 'image') useSettingsStore.getState().setExternalImageAppPath(path);
          else if (kind === 'video') useSettingsStore.getState().setExternalVideoAppPath(path);
        }),
      );
    })();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}

export function initSettings(): void {
  const state = useSettingsStore.getState();
  applyAllSettings({
    appearance: state.appearance,
    lightTheme: state.lightTheme,
    darkTheme: state.darkTheme,
    scale: state.scale,
    font: state.font,
  });
}
