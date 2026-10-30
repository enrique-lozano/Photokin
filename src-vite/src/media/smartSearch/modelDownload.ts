import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { getModelDir, MODEL_FILES } from './models';

const HF_BASE = 'https://huggingface.co/immich-app';
const PROGRESS_EVENT = 'smart-search://model-download';

// Keep progress beyond a page's lifetime, including while navigating in Settings.
export const useModelDownloads = create<{ progress: Record<string, number>; revision: number }>(() => ({
  progress: {},
  revision: 0,
}));

function _updateProgress(modelId: string, fraction: number | null) {
  useModelDownloads.setState((state) => {
    const progress = { ...state.progress };
    if (fraction === null) delete progress[modelId];
    else progress[modelId] = fraction;
    return { progress, revision: state.revision + (fraction === 1 ? 1 : 0) };
  });
}

let progressListener: Promise<UnlistenFn> | undefined;

export function observeModelDownloads(): Promise<UnlistenFn> {
  progressListener ??= onModelDownloadProgress(({ modelId, fraction }) => {
    _updateProgress(modelId, fraction);
  }).catch((error) => {
    progressListener = undefined;
    throw error;
  });
  return progressListener;
}

export type ModelDownloadProgress = {
  modelId: string;
  /** 0-1 across the whole model (all files). */
  fraction: number;
};

/**
 * Subscribe to progress for *every* model download. Because the transfer runs
 * in the Rust backend and progress is a global event, any mounted component can
 * reflect a download that another one (or a now-closed window) started. Returns
 * an unlisten function.
 */
export function onModelDownloadProgress(
  callback: (progress: ModelDownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<ModelDownloadProgress>(PROGRESS_EVENT, (event) => callback(event.payload));
}

export type ModelDownloadResult = {
  status: 'alreadyRunning' | 'completed' | 'cancelled';
};

/**
 * Download every required file for `modelId` from HuggingFace. The actual
 * transfer happens entirely in Rust (streamed straight to disk, `.part`-then-
 * rename), so it is not tied to the calling component's lifetime and keeps
 * going if the user leaves the screen. Progress arrives via
 * {@link onModelDownloadProgress}.
 *
 * A concurrent request for the same model returns `{ status: 'alreadyRunning' }`
 * instead of pretending the download already finished.
 */
export async function downloadModel(modelId: string): Promise<ModelDownloadResult> {
  await observeModelDownloads();
  const current = useModelDownloads.getState().progress[modelId];
  if (current === undefined || current >= 1) _updateProgress(modelId, 0);
  try {
    const result = await invoke<ModelDownloadResult>('download_model', {
      modelId,
      baseUrl: HF_BASE,
      files: MODEL_FILES,
      destDir: await getModelDir(modelId),
    });
    if (result.status === 'completed') _updateProgress(modelId, 1);
    if (result.status === 'cancelled') _updateProgress(modelId, null);
    return result;
  } catch (error) {
    _updateProgress(modelId, null);
    throw error;
  }
}

/**
 * Stop a running download. The original {@link downloadModel} call then
 * resolves with `{ status: 'cancelled' }` once Rust has deleted every file it
 * wrote for the model.
 */
export async function cancelModelDownload(modelId: string): Promise<void> {
  await invoke<boolean>('cancel_model_download', { modelId });
}
