import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { platform } from '@tauri-apps/plugin-os';
import { shutdownExiftoolSession } from '@/media/metadata/exiftool/exiftoolSession';

export type ExiftoolInstallProgress = {
  stage: 'downloading' | 'unpacking' | 'checking';
  version: string | null;
  /** Progress within the current stage; null when its size is unknown. */
  percent: number | null;
};

/** Installs the release-tested private copy without modifying a system installation. */
export async function installExiftool(
  onProgress: (progress: ExiftoolInstallProgress) => void,
): Promise<void> {
  const channel = new Channel<ExiftoolInstallProgress>();
  channel.onmessage = onProgress;
  await invoke('install_exiftool', { onProgress: channel });
  shutdownExiftoolSession();
}

/** Lets the user pick an existing ExifTool program. Resolves to `false` if they cancel. */
export async function locateExiftool(): Promise<boolean> {
  const selected = await open({
    title: 'Select ExifTool',
    ...(platform() === 'windows' ? { filters: [{ name: 'ExifTool', extensions: ['exe'] }] } : {}),
  });
  if (selected === null) return false;
  await invoke('set_exiftool_location', { exePath: selected });
  shutdownExiftoolSession();
  return true;
}
