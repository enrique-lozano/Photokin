import { emit } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { platform } from '@tauri-apps/plugin-os';
import { useSettingsStore } from '../stores/settingsStore';
import { normalizeScale } from './theme';

export const SETTINGS_BASE_WIDTH = 560;
export const SETTINGS_BASE_HEIGHT = 480;

export async function openSettingsWindow(tabIndex?: number): Promise<void> {
  try {
    if (typeof tabIndex === 'number') {
      useSettingsStore.getState().setTabIndex(tabIndex);
      await emit('settings-tabIndex-changed', tabIndex);
    }

    const settingsWindow = await WebviewWindow.getByLabel('settings');
    if (settingsWindow) {
      await settingsWindow.show();
      await settingsWindow.setFocus();

      return;
    }

    const scale = normalizeScale(useSettingsStore.getState().scale);
    const width = Math.round(SETTINGS_BASE_WIDTH * scale);
    const height = Math.round(SETTINGS_BASE_HEIGHT * scale);
    const isMac = platform() === 'macos';

    const newSettingsWindow = new WebviewWindow('settings', {
      url: '/settings',
      title: 'Settings',
      width,
      height,
      minWidth: width,
      minHeight: height,
      resizable: true,
      maximizable: false,
      visible: true,
      transparent: false,
      decorations: isMac,
      ...(isMac && {
        titleBarStyle: 'overlay',
        hiddenTitle: true,
        minimizable: false,
      }),
    });

    newSettingsWindow.once('tauri://created', () => {
      void newSettingsWindow.show();
      void newSettingsWindow.setFocus();
    });
    newSettingsWindow.once('tauri://error', (error) => {
      console.error('Failed to create settings webview window:', error);
      const message = typeof error === 'string' ? error : JSON.stringify(error);
      window.alert(`Could not open settings window: ${message}`);
    });
  } catch (error) {
    console.error('Failed to open settings window', error);
    const message = error instanceof Error ? error.message : String(error);
    window.alert(`Could not open settings window: ${message}`);
  }
}
