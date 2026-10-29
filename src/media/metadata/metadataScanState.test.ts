import { describe, expect, it } from 'vitest';
import {
  hasScannedMetadata,
  metadataEditErrorMessage,
  METADATA_SCAN_PENDING_MESSAGE,
} from './metadataScanState';

describe('metadata scan state', () => {
  it('only allows edits after the initial metadata read has a scan time', () => {
    expect(hasScannedMetadata({ metadata: { lastScanned: null } })).toBe(false);
    expect(hasScannedMetadata({ metadata: { lastScanned: '2026-09-16T00:00:00.000Z' } })).toBe(true);
  });

  it('only exposes the expected scan-pending error to the UI', () => {
    expect(metadataEditErrorMessage(new Error(METADATA_SCAN_PENDING_MESSAGE), 'Fallback')).toBe(
      METADATA_SCAN_PENDING_MESSAGE,
    );
    expect(metadataEditErrorMessage(new Error('Internal detail'), 'Fallback')).toBe('Fallback');
  });
});
