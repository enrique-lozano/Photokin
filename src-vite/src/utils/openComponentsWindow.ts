import { toast } from '@/components/ui/toast';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { platform } from '@tauri-apps/plugin-os';

export async function openComponentsWindow(): Promise<void> {
  try {
    const existing = await WebviewWindow.getByLabel('components');
    if (existing) {
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      return;
    }

    const isMac = platform() === 'macos';
    const components = new WebviewWindow('components', {
      url: '/components',
      title: 'Components - Photokin',
      width: 1120,
      height: 800,
      minWidth: 760,
      minHeight: 560,
      resizable: true,
      maximizable: false,
      center: true,
      decorations: isMac,
      ...(isMac && { titleBarStyle: 'overlay', hiddenTitle: true }),
    });
    void components.once('tauri://error', () => toast.error('The component gallery could not be opened.'));
  } catch (error) {
    toast.error(`The component gallery could not be opened: ${String(error)}`);
  }
}
