import { toast } from '@/components/ui/toast';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { platform } from '@tauri-apps/plugin-os';

export async function openEditorWindow(assetId: string): Promise<void> {
  try {
    const existing = await WebviewWindow.getByLabel('editor');
    if (existing) {
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      toast.info('Finish or close the current edit before opening another photo.');
      return;
    }
    const isMac = platform() === 'macos';
    const editor = new WebviewWindow('editor', {
      url: `/editor?assetId=${encodeURIComponent(assetId)}`,
      title: 'Edit photo - Photokin',
      width: 1160,
      height: 800,
      minWidth: 760,
      minHeight: 560,
      resizable: true,
      center: true,
      decorations: isMac,
      ...(isMac && { titleBarStyle: 'overlay', hiddenTitle: true }),
    });
    void editor.once('tauri://error', () => toast.error('The photo editor could not be opened.'));
  } catch (error) {
    toast.error(`The photo editor could not be opened: ${String(error)}`);
  }
}
