import { MetadataMode, WriteBackTiming } from '@/common/metadataOptions';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconClock, IconFileCheck, IconLock } from '@tabler/icons-react';
import type { ComponentProps } from 'react';
import type { Badge } from '@/components/ui/badge';

export interface MetadataModeInfo {
  mode: 'library-only' | 'saving' | 'on-sync';
  variant: ComponentProps<typeof Badge>['variant'];
  Icon: typeof IconLock;
  label: string;
  hint: string;
}

/** How the current file-metadata settings read to the user: label, tint and one-line explanation. */
export function useMetadataModeInfo(): MetadataModeInfo {
  const mode = useSettingsStore((state) => state.metadataMode);
  const timing = useSettingsStore((state) => state.writeBackTiming);

  if (mode !== MetadataMode.Full) {
    return {
      mode: 'library-only',
      variant: 'secondary',
      Icon: IconLock,
      label: 'Library only',
      hint: 'Your edits stay in Photokin’s library. Your photo files are not modified. Change this in Settings › Data.',
    };
  }

  if (timing === WriteBackTiming.DeferredOnSync) {
    return {
      mode: 'on-sync',
      variant: 'warning',
      Icon: IconClock,
      label: 'Files on sync',
      hint: 'Your edits are saved in the library now and written into your photo files (EXIF, IPTC, XMP) the next time you sync.',
    };
  }

  return {
    mode: 'saving',
    variant: 'info',
    Icon: IconFileCheck,
    label: 'Saving to files',
    hint: 'Each edit is written into your photo files (EXIF, IPTC, XMP) as soon as you make it, so other apps can read it.',
  };
}
