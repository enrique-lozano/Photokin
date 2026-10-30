import { toast } from '@/components/ui/toast';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { generateID } from '@/db/models/dbEntityWithID';
import { getOrCreateFullPreview, needsGeneratedPreview } from '@/media/thumbnails/preview';
import { copyImageFileToClipboard } from '@/system/clipboard';

/** Minimal asset shape needed to resolve a copyable image source. */
export type CopyableAsset = Pick<AssetInClient, 'id' | 'filename' | 'fullPath'>;

/**
 * Copies an asset's image to the clipboard and reports progress through a single
 * updating toast (loading → success/error). Backs the lightbox copy button.
 *
 * Formats the webview can't render natively (HEIC/HEIF/TIFF/RAW…) are copied
 * from their generated full-size preview; everything else copies straight from
 * the original file. Any failure is surfaced as an error toast rather than
 * thrown, so callers can fire-and-forget.
 */
export async function copyImageToClipboardWithFeedback(asset: CopyableAsset): Promise<void> {
  const toastId = generateID();
  toast.loading('Copying image...', { id: toastId });

  try {
    const source = needsGeneratedPreview(asset.filename)
      ? await getOrCreateFullPreview(asset)
      : asset.fullPath;
    if (!source) throw new Error('No image source available');

    await copyImageFileToClipboard(source);
    toast.success('Image copied to clipboard', { id: toastId });
  } catch (error) {
    toast.error(`Could not copy image: ${String(error)}`, { id: toastId });
  }
}
