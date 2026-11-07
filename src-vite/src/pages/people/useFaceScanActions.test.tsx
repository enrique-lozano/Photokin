import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FACE_RECOGNITION_OPTIONS,
  detectFaces,
  recognizeFaces,
} from '@/media/faces/faceRecognition';
import { useProcessStore } from '@/stores/processStore';
import { stopProcess } from '@/system/processCancellation';
import { toast } from '@/components/ui/toast';
import { useFaceScanActions } from './useFaceScanActions';

const rates = vi.hoisted(() => ({ recordFindRun: vi.fn(), recordMatchRun: vi.fn() }));

vi.mock('@/db/api/services/albums.service', () => ({ AlbumsService: { getAll: vi.fn() } }));
vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getFiles: vi.fn(async () => []) },
}));
vi.mock('@/stores/faceRunRateStore', () => ({
  useFaceRunRateStore: { getState: () => rates },
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('@/media/faces/faceRecognition', () => ({
  FACE_DETECTION_SIZES: { small: { relativeCost: 1 } },
  DEFAULT_FACE_RECOGNITION_OPTIONS: {
    faceDetectionSize: 'small',
    minFaceConfidence: 0.9,
    knownEmbeddingsPerTag: 10,
    matchMaxDistance: 0.64,
  },
  describeRecognizeChanges: vi.fn(() => 'No changes'),
  describeRecognizeResult: vi.fn(() => 'No changes'),
  detectFaces: vi.fn(),
  recognizeFaces: vi.fn(),
}));

function actions() {
  const result: ReturnType<typeof useFaceScanActions>[] = [];
  function Harness() {
    result.push(useFaceScanActions());
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result[0];
}

describe('face scan cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectFaces).mockReset();
    vi.mocked(recognizeFaces).mockReset();
    useProcessStore.setState({ processes: [] });
    vi.mocked(detectFaces).mockResolvedValue({
      scannedPhotos: 600, detectedFaces: 0, warnings: [],
    });
    vi.mocked(recognizeFaces).mockResolvedValue({
      checkedFaces: 100,
      referencePeople: 0,
      newSuggestions: 0,
      reassignedSuggestions: 0,
      removedSuggestions: 0,
      facesWithoutEmbedding: 0,
      warnings: [],
    });
  });

  it.each([20, 600])('handles stopping detection after %i photos without rejecting', async (photos) => {
    vi.mocked(detectFaces).mockImplementation(async (_assets, _options, reporter, onProgress) => {
      onProgress?.(photos);
      stopProcess(useProcessStore.getState().processes[0].id);
      reporter?.throwIfStopped();
      throw new Error('Expected cancellation');
    });

    await expect(actions().findFaces(DEFAULT_FACE_RECOGNITION_OPTIONS)).resolves.toBeUndefined();

    expect(useProcessStore.getState().processes[0].status).toBe('stopped');
    expect(recognizeFaces).not.toHaveBeenCalled();
    expect(rates.recordFindRun).toHaveBeenCalledTimes(photos > 500 ? 1 : 0);
    expect(rates.recordMatchRun).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenLastCalledWith('Finding faces stopped', expect.any(Object));
  });

  it.each(['findFaces', 'recognizeFaces'] as const)(
    'handles stopping recognition through %s without rejecting',
    async (action) => {
      vi.mocked(recognizeFaces).mockImplementation(async (_assets, _options, reporter) => {
        stopProcess(useProcessStore.getState().processes[0].id);
        reporter?.throwIfStopped();
        throw new Error('Expected cancellation');
      });

      await expect(actions()[action](DEFAULT_FACE_RECOGNITION_OPTIONS)).resolves.toBeUndefined();

      expect(useProcessStore.getState().processes[0].status).toBe('stopped');
      expect(rates.recordMatchRun).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it.each(['findFaces', 'recognizeFaces'] as const)('still propagates real failures in %s', async (action) => {
    const error = new Error('Sidecar failed');
    vi.mocked(recognizeFaces).mockRejectedValue(error);

    await expect(actions()[action](DEFAULT_FACE_RECOGNITION_OPTIONS)).rejects.toBe(error);

    expect(useProcessStore.getState().processes[0].status).toBe('error');
    expect(toast.error).toHaveBeenCalled();
    expect(rates.recordMatchRun).not.toHaveBeenCalled();
  });

  it.each(['findFaces', 'recognizeFaces'] as const)('keeps successful %s measurements', async (action) => {
    await expect(actions()[action](DEFAULT_FACE_RECOGNITION_OPTIONS)).resolves.toBeUndefined();

    expect(useProcessStore.getState().processes[0].status).toBe('success');
    expect(rates.recordMatchRun).toHaveBeenCalledWith(100, expect.any(Number));
    expect(toast.success).toHaveBeenCalled();
  });
});
