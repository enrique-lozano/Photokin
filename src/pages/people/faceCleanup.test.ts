import { describe, expect, it } from 'vitest';
import { matchCleanup, type CleanupCriteria, type FaceQuality } from './faceCleanup';

const faces: FaceQuality[] = [
  { id: 'tiny-sure', detectionScore: 0.95, pixelArea: 30 * 30 },
  { id: 'tiny-unsure', detectionScore: 0.4, pixelArea: 20 * 20 },
  { id: 'big-unsure', detectionScore: 0.5, pixelArea: 200 * 200 },
  { id: 'big-sure', detectionScore: 0.9, pixelArea: 120 * 120 },
  { id: 'edge', detectionScore: 0.6, pixelArea: 48 * 48 },
  { id: 'unknown', detectionScore: null, pixelArea: null },
];

const criteria: CleanupCriteria = { tooSmall: true, minSidePx: 48, unsure: true, minConfidence: 0.6 };

describe('matchCleanup', () => {
  it('counts each criterion on its own', () => {
    const match = matchCleanup(faces, criteria);
    expect(match.tooSmallCount).toBe(2);
    expect(match.unsureCount).toBe(2);
  });

  it('ignores the union of enabled criteria without counting a face twice', () => {
    expect(matchCleanup(faces, criteria).ids).toEqual(['tiny-sure', 'tiny-unsure', 'big-unsure']);
  });

  it('keeps counting disabled criteria but leaves them out of the ids', () => {
    const match = matchCleanup(faces, { ...criteria, unsure: false });
    expect(match.unsureCount).toBe(2);
    expect(match.ids).toEqual(['tiny-sure', 'tiny-unsure']);
  });

  it('treats thresholds as strict and skips faces with missing data', () => {
    const match = matchCleanup(faces, criteria);
    expect(match.ids).not.toContain('edge');
    expect(match.ids).not.toContain('unknown');
  });

  it('ignores nothing when no criterion is enabled', () => {
    expect(matchCleanup(faces, { ...criteria, tooSmall: false, unsure: false }).ids).toEqual([]);
  });
});
