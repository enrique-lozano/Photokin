import { useEffect } from 'react';
import { observeModelDownloads, useModelDownloads } from './modelDownload';

/** Download progress (0-1) of `modelId`, or `null` until the first progress event arrives. */
export function useModelDownloadFraction(modelId: string): number | null {
  const fraction = useModelDownloads((state) => state.progress[modelId] ?? null);

  useEffect(() => {
    void observeModelDownloads().catch((error) => {
      console.error('Could not observe model downloads:', error);
    });
  }, []);

  return fraction;
}
