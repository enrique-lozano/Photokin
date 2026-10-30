import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export type ExiftoolInstallProgress = {
  stage: 'downloading' | 'unpacking' | 'checking';
  version: string | null;
  /** Progress within the current stage; null when its size is unknown. */
  percent: number | null;
};

/** Windows only: downloads, unpacks, and verifies ExifTool before saving its location. */
export function installExiftool(onProgress: (progress: ExiftoolInstallProgress) => void): Promise<void> {
  const channel = new Channel<ExiftoolInstallProgress>();
  channel.onmessage = onProgress;
  return invoke('install_exiftool', { onProgress: channel });
}

/** Lets the user pick an existing ExifTool program. Resolves to `false` if they cancel. */
export async function locateExiftool(): Promise<boolean> {
  const selected = await open({
    title: 'Select ExifTool',
    filters: [{ name: 'ExifTool', extensions: ['exe'] }],
  });
  if (selected === null) return false;
  await invoke('set_exiftool_location', { exePath: selected });
  return true;
}
