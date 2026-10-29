import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  breakUpSuggestedFaceGroup,
  faceClusterMembershipKey,
  filterDismissedFaceClusters,
  forgetBrokenUpFaceGroup,
  getDismissedFaceClusterKeys,
} from './dismissedFaceClusters';

const { getMock, setMock, clearRegionClustersMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
  clearRegionClustersMock: vi.fn(),
}));

vi.mock('@/db/api/services/appData.service', () => ({
  AppDataKey: { DismissedFaceClusters: 'dismissedFaceClusters' },
  AppDataService: { get: getMock, set: setMock },
}));

vi.mock('@/db/api/services/regions.service', () => ({
  RegionsService: { clearRegionClusters: clearRegionClustersMock },
}));

describe('dismissed face clusters', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
    clearRegionClustersMock.mockReset();
  });

  it('uses the same membership key regardless of order or duplicates', () => {
    expect(faceClusterMembershipKey(['face-b', 'face-a', 'face-a'])).toBe('face-a|face-b');
  });

  it('suppresses only the exact group that was broken up', () => {
    expect(
      filterDismissedFaceClusters(
        {
          dismissed: ['face-b', 'face-a'],
          changed: ['face-a', 'face-b', 'face-c'],
        },
        new Set(['face-a|face-b']),
      ),
    ).toEqual({ changed: ['face-a', 'face-b', 'face-c'] });
  });

  it('persists a broken-up group before removing its current cluster', async () => {
    getMock.mockResolvedValue(JSON.stringify(['older|group']));
    setMock.mockResolvedValue(undefined);
    clearRegionClustersMock.mockResolvedValue(undefined);

    await breakUpSuggestedFaceGroup(['face-b', 'face-a']);

    expect(setMock).toHaveBeenCalledWith(
      'dismissedFaceClusters',
      JSON.stringify(['older|group', 'face-a|face-b']),
    );
    expect(setMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearRegionClustersMock.mock.invocationCallOrder[0],
    );
    expect(clearRegionClustersMock).toHaveBeenCalledWith(['face-b', 'face-a']);
  });

  it('forgets a broken-up group so undo lets it be suggested again', async () => {
    getMock.mockResolvedValue(JSON.stringify(['older|group', 'face-a|face-b']));
    setMock.mockResolvedValue(undefined);

    await forgetBrokenUpFaceGroup(['face-b', 'face-a']);

    expect(setMock).toHaveBeenCalledWith('dismissedFaceClusters', JSON.stringify(['older|group']));
  });

  it('treats malformed persisted data as empty', async () => {
    getMock.mockResolvedValue('{broken');
    await expect(getDismissedFaceClusterKeys()).resolves.toEqual(new Set());
  });
});
