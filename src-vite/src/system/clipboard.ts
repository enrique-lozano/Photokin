import { invoke } from '@tauri-apps/api/core';

/**
 * Copies an image file to the system clipboard as a native bitmap.
 *
 * The decode + downscale + clipboard write all happen natively in Rust (see the
 * `copy_image_to_clipboard` command), so nothing but the path crosses the IPC
 * bridge and copying stays fast even for large photos. `path` must point to a
 * format the Rust `image` crate can decode — for HEIC/HEIF/TIFF/RAW pass the
 * generated WebP preview, mirroring how the lightbox displays them.
 */
export async function copyImageFileToClipboard(path: string): Promise<void> {
  await invoke('copy_image_to_clipboard', { path });
}
