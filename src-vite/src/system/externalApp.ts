import { isSupportedVideoPath } from '@/common/supportedFormats';
import { useSettingsStore } from '@/stores/settingsStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { platform } from '@tauri-apps/plugin-os';

export type ExternalAppKind = 'image' | 'video';

/** A readable program name from its path: `C:\Apps\GIMP 2\gimp.exe` → `gimp`. */
export function externalAppName(appPath: string): string {
  const base = appPath.split(/[/\\]/).filter(Boolean).pop() ?? '';
  return base.replace(/\.(exe|app|lnk|bat|cmd)$/i, '');
}

/** The program configured for this file, or `''` when the system default applies. */
export function externalAppPathFor(filename: string): string {
  const { externalImageAppPath, externalVideoAppPath } = useSettingsStore.getState();
  return isSupportedVideoPath(filename) ? externalVideoAppPath : externalImageAppPath;
}

/** Opens a file in the configured program for its type, or the system default. */
export async function openInExternalApp(asset: { filename: string; fullPath: string }): Promise<void> {
  const appPath = externalAppPathFor(asset.filename);
  if (appPath) {
    await invoke('open_file_with_app', { filePath: asset.fullPath, appPath });
  } else {
    await openPath(asset.fullPath);
  }
}

/** Lets the user pick a program. Resolves to `null` if they cancel. */
export async function chooseExternalApp(): Promise<string | null> {
  const os = platform();
  const selected = await open({
    title: 'Choose an app',
    directory: os === 'macos', // macOS apps are folders (.app bundles)
    filters: os === 'windows' ? [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd'] }] : undefined,
  });
  return typeof selected === 'string' ? selected : null;
}
