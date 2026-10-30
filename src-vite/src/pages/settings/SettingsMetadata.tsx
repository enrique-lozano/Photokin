import { MetadataMode, WriteBackTiming, isMetadataMode, isWriteBackTiming } from '@/common/metadataOptions';
import { RatingMode } from '@/common/ratingModeOptions';
import {
  SettingsGroup,
  SettingsPageHeader,
  SettingsRadioGroup,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsRow';
import { Banner } from '@/components/ui/banner';
import { ConfirmationDialog, MetadataImpactNotice } from '@/components/ui/confirmation-dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconCalendarTime, IconClock, IconFileExport, IconHeart, IconInfoCircle } from '@tabler/icons-react';
import { emit } from '@tauri-apps/api/event';
import { useState } from 'react';

const WRITE_TIMING_SELECT_OPTIONS = [
  { value: WriteBackTiming.ImmediateOnEdit, label: 'Immediately' },
  { value: WriteBackTiming.DeferredOnSync, label: 'On manual sync' },
] as const;

export function SettingsMetadata() {
  const [confirmFullModeOpen, setConfirmFullModeOpen] = useState(false);
  const metadataMode = useSettingsStore((state) => state.metadataMode);
  const writeBackTiming = useSettingsStore((state) => state.writeBackTiming);
  const preserveFileModifyTime = useSettingsStore((state) => state.preserveFileModifyTime);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const embedFavorites = useSettingsStore((state) => state.embedFavorites);
  const isReadOnly = metadataMode === MetadataMode.ReadOnly;

  const handleMetadataModeChange = (value: string) => {
    if (!isMetadataMode(value)) return;

    if (value === MetadataMode.Full && metadataMode !== MetadataMode.Full) {
      setConfirmFullModeOpen(true);
      return;
    }

    useSettingsStore.getState().setMetadataMode(value);
    void emit('settings-metadataMode-changed', value);
  };

  const enableFullMetadataMode = () => {
    useSettingsStore.getState().setMetadataMode(MetadataMode.Full);
    void emit('settings-metadataMode-changed', MetadataMode.Full);
    setConfirmFullModeOpen(false);
  };

  const handleWriteBackTimingChange = (value: string) => {
    if (!isWriteBackTiming(value)) return;

    useSettingsStore.getState().setWriteBackTiming(value);
    void emit('settings-writeBackTiming-changed', value);
  };

  const handlePreserveFileModifyTimeChange = (value: boolean) => {
    useSettingsStore.getState().setPreserveFileModifyTime(value);
    void emit('settings-preserveFileModifyTime-changed', value);
  };

  const handleEmbedFavoritesChange = (value: boolean) => {
    useSettingsStore.getState().setEmbedFavorites(value);
    void emit('settings-embedFavorites-changed', value);
  };

  return (
    <>
      <SettingsPageHeader
        title="Metadata"
        description="Photokin reads EXIF, IPTC and XMP from your photos. Choose whether your changes are also written back to the files."
      />

      <SettingsGroup
        title="Write mode"
        footer={
          isReadOnly ? (
            <Banner icon={<IconInfoCircle size={16} />} className="text-xs text-muted-foreground">
              A manual sync can still refresh Photokin&apos;s copy of file details. Choose “New &amp; removed
              only” in Library to keep app-only edits unchanged. Rotating or renaming a photo always changes
              the original file.
            </Banner>
          ) : (
            <MetadataImpactNotice impact="automatic" />
          )
        }
      >
        <SettingsRadioGroup
          label="Write mode"
          value={metadataMode}
          options={[
            {
              value: MetadataMode.ReadOnly,
              label: 'Read only',
              badge: 'Recommended',
              description:
                'Never touches your files. Edits stay in the Photokin library. Best for trying the app or if you have no backup.',
            },
            {
              value: MetadataMode.Full,
              label: 'Sync to files',
              description:
                'Saves tags, ratings, titles, descriptions and places into each photo’s EXIF, IPTC and XMP, so other apps can read them.',
            },
          ]}
          onValueChange={handleMetadataModeChange}
        />
      </SettingsGroup>

      <SettingsGroup title="Writing to files">
        <SettingsSelectRow
          icon={<IconClock size={18} />}
          label="When to write"
          description="When your edits are saved into the original files."
          value={writeBackTiming}
          options={WRITE_TIMING_SELECT_OPTIONS}
          onValueChange={handleWriteBackTimingChange}
          disabled={isReadOnly}
        />

        <SettingsToggleRow
          icon={<IconCalendarTime size={18} />}
          label="Keep “Date modified” when writing"
          description="Backup and sync tools won't re-upload photos that were only re-tagged."
          checked={preserveFileModifyTime}
          onCheckedChange={handlePreserveFileModifyTimeChange}
          disabled={isReadOnly}
        />

        {ratingMode === RatingMode.Favorites && (
          <SettingsToggleRow
            icon={<IconHeart size={18} />}
            label="Save favorites as 5 stars"
            description="Favoriting a photo also writes a 5-star rating into the file. When off, favorites stay in Photokin."
            checked={embedFavorites}
            onCheckedChange={handleEmbedFavoritesChange}
            disabled={isReadOnly}
          />
        )}
      </SettingsGroup>

      <ConfirmationDialog
        open={confirmFullModeOpen}
        onOpenChange={setConfirmFullModeOpen}
        icon={<IconFileExport size={24} />}
        title="Enable file write-back?"
        description={
          writeBackTiming === WriteBackTiming.DeferredOnSync
            ? 'Future edits can change embedded metadata in your original files. Changes will queue in Photokin and be written during the next library sync.'
            : 'Future edits can change embedded metadata in your original files immediately after you apply them.'
        }
        confirmLabel="Enable write-back"
        onConfirm={enableFullMetadataMode}
        tone="warning"
      />
    </>
  );
}
