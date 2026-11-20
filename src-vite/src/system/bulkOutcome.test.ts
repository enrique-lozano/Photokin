import { describe, expect, it } from 'vitest';
import { successfulFileCount, type BulkOutcome } from './bulkOutcome';

function _outcome(overrides: Partial<BulkOutcome> = {}): BulkOutcome {
  return { total: 5, fileCount: 5, fileFailures: [], ...overrides };
}

describe('bulk outcomes', () => {
  it('counts clean files after failures and intentional skips', () => {
    const result = _outcome({
      fileFailures: [{ id: 'failed', label: 'failed.jpg', reason: 'locked' }],
      skipped: [{ id: 'skipped', label: 'skipped.jpg', reason: 'already there' }],
    });

    expect(successfulFileCount(result)).toBe(3);
  });

  it('treats a result without failures or skips as clean', () => {
    expect(successfulFileCount(_outcome())).toBe(5);
  });
});
