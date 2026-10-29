import type { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { ImageEdit } from './editGeometry';

export const EDITOR_REQUEST = 'photo-editor-request';
export const EDITOR_REPLY = 'photo-editor-reply';

export interface EditorData {
  id: string;
  filename: string;
  fullPath: string;
  previewPath: string;
  width: number;
  height: number;
  bytes: number;
  format: ImageEdit['format'];
  canOverwrite: boolean;
  regions: AreaBox[];
}

export interface PreparedEditorEdit {
  tempPath: string;
  sourceHash: string;
  bytes: number;
  width: number;
  height: number;
  token: string;
  suggestedName: string;
}

export interface EditorPreview {
  previewPath: string;
  bytes: number;
  profileBytes: number;
  width: number;
  height: number;
}

export interface EditorRequest {
  requestId: string;
  assetId: string;
  action: 'load' | 'preview' | 'prepare' | 'save' | 'discard';
  edit?: ImageEdit;
  token?: string;
  overwrite?: boolean;
  filename?: string;
}

export interface EditorReply {
  requestId: string;
  data?: EditorData | EditorPreview | PreparedEditorEdit | { path: string };
  error?: string;
}

export async function requestEditor<T extends NonNullable<EditorReply['data']>>(
  request: Omit<EditorRequest, 'requestId'>,
): Promise<T> {
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unlisten?.();
      reject(new Error('The main window did not respond. Keep the gallery open and try again.'));
    }, 180_000);
    let unlisten: (() => void) | undefined;
    void listen<EditorReply>(EDITOR_REPLY, ({ payload }) => {
      if (payload.requestId !== requestId) return;
      window.clearTimeout(timeout);
      unlisten?.();
      if (payload.error) reject(new Error(payload.error));
      else if (payload.data) resolve(payload.data as T);
      else reject(new Error('Empty editor response'));
    })
      .then(async (stop) => {
        unlisten = stop;
        await emitTo('main', EDITOR_REQUEST, { ...request, requestId });
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        unlisten?.();
        reject(error);
      });
  });
}
