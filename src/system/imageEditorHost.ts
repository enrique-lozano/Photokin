import {
  discardImageEditor,
  loadImageEditor,
  prepareImageEditor,
  previewImageEditor,
  saveImageEditor,
} from '@/db/api/services/assets/assetImageEdit';
import {
  EDITOR_REPLY,
  EDITOR_REQUEST,
  type EditorReply,
  type EditorRequest,
} from '@/media/edit/editorProtocol';
import { ProcessKind } from '@/stores/processStore';
import { emitTo, listen } from '@tauri-apps/api/event';
import { trackProcess } from './processTracker';

export function initImageEditorHost(): void {
  let queue = Promise.resolve();
  let latestPreview = '';
  let latestSample = '';
  void listen<EditorRequest>(EDITOR_REQUEST, ({ payload }) => {
    if (payload.action === 'prepare') latestPreview = payload.requestId;
    if (payload.action === 'preview') latestSample = payload.requestId;
    if (payload.action === 'discard' || payload.action === 'load') {
      latestPreview = '';
      latestSample = '';
    }
    queue = queue
      .then(async () => {
        const reply: EditorReply = { requestId: payload.requestId };
        try {
          switch (payload.action) {
            case 'load':
              reply.data = await loadImageEditor(payload.assetId);
              break;
            case 'prepare':
              if (payload.requestId !== latestPreview) throw new Error('Preview superseded');
              if (!payload.edit) throw new Error('Missing edit settings');
              reply.data = await prepareImageEditor(payload.assetId, payload.edit);
              break;
            case 'preview':
              if (payload.requestId !== latestSample) throw new Error('Preview superseded');
              if (!payload.edit) throw new Error('Missing edit settings');
              reply.data = await previewImageEditor(payload.assetId, payload.edit);
              break;
            case 'save':
              reply.data = await trackProcess(
                {
                  kind: ProcessKind.Generic,
                  title: 'Saving photo',
                  successMessage: payload.overwrite ? 'Photo updated' : 'Edited copy saved',
                },
                () =>
                  saveImageEditor(
                    payload.assetId,
                    payload.token ?? '',
                    payload.overwrite === true,
                    payload.filename ?? '',
                  ),
              );
              break;
            case 'discard':
              reply.data = await discardImageEditor(payload.assetId);
              break;
          }
        } catch (error) {
          reply.error = String(error);
        }
        await emitTo('editor', EDITOR_REPLY, reply);
      })
      .catch(() => {});
  });
}
