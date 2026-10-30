import { MetadataMode, WriteBackTiming } from '@/common/metadataOptions';
import { RatingMode } from '@/common/ratingModeOptions';
import { useSettingsStore } from '@/stores/settingsStore';

// ----------
// * WRITE-BACK POLICY (settings-driven gating, no exiftool involvement)
// ----------
//
// These predicates decide *whether* an edit is allowed to reach the original
// file. They only read the settings store — deliberately kept separate from the
// exiftool read/write mechanics so callers can gate a write without pulling in
// the writer, and so the writer stays a dumb "do it" primitive.

export function isMetadataWriteEnabled(): boolean {
  return useSettingsStore.getState().metadataMode === MetadataMode.Full;
}

export function shouldWriteBackOnSync(): boolean {
  return (
    isMetadataWriteEnabled() && useSettingsStore.getState().writeBackTiming === WriteBackTiming.DeferredOnSync
  );
}

/**
 * When one particular edit reaches the files, resolved from the user's
 * {@link MetadataMode} and {@link WriteBackTiming} settings at the time of the edit.
 */
export enum FileWriteTiming {
  /** Written into the files as part of the edit. */
  Immediate = 'immediate',
  /** Queued in Photokin and written during the next library sync. */
  OnSync = 'on-sync',
  /** Never written: metadata is read-only, so the edit stays in Photokin. */
  None = 'none',
}

/** When an edit gated by the write-back setting reaches the files. */
export function policyFileWriteTiming(): FileWriteTiming {
  if (!isMetadataWriteEnabled()) return FileWriteTiming.None;
  return shouldWriteBackOnSync() ? FileWriteTiming.OnSync : FileWriteTiming.Immediate;
}

/**
 * Whether a metadata write puts the file's modification time back afterwards
 * (exiftool's `-P`). Off by default: a fresh timestamp is how backup and sync
 * tools notice the file really did change.
 */
export function shouldPreserveFileModifyTime(): boolean {
  return useSettingsStore.getState().preserveFileModifyTime;
}

export function shouldWriteRatingToFile(): boolean {
  const { ratingMode, embedFavorites } = useSettingsStore.getState();
  return ratingMode === RatingMode.Favorites ? embedFavorites : true;
}
