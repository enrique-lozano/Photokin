import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getByLabel, createWindow, once, platform, showError } = vi.hoisted(() => ({
  getByLabel: vi.fn(),
  createWindow: vi.fn(),
  once: vi.fn<(event: string, handler: () => void) => Promise<() => void>>(),
  platform: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    static getByLabel = getByLabel;
    once = once;

    constructor(label: string, options: object) {
      createWindow(label, options);
    }
  },
}));

vi.mock('@tauri-apps/plugin-os', () => ({ platform }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: showError } }));

import { openComponentsWindow } from './openComponentsWindow';

describe('openComponentsWindow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getByLabel.mockResolvedValue(null);
    platform.mockReturnValue('windows');
    once.mockResolvedValue(() => {});
  });

  it('opens a standalone, resizable component gallery with custom window chrome', async () => {
    await openComponentsWindow();

    expect(getByLabel).toHaveBeenCalledWith('components');
    expect(createWindow).toHaveBeenCalledWith('components', {
      url: '/components',
      title: 'Components - Photokin',
      width: 1120,
      height: 800,
      minWidth: 760,
      minHeight: 560,
      resizable: true,
      maximizable: false,
      center: true,
      decorations: false,
    });
    expect(once).toHaveBeenCalledWith('tauri://error', expect.any(Function));
    expect(showError).not.toHaveBeenCalled();
  });

  it('keeps native macOS traffic lights', async () => {
    platform.mockReturnValue('macos');

    await openComponentsWindow();

    expect(createWindow).toHaveBeenCalledWith(
      'components',
      expect.objectContaining({ decorations: true, titleBarStyle: 'overlay', hiddenTitle: true }),
    );
  });

  it('restores and focuses the existing window instead of creating another one', async () => {
    const existing = {
      unminimize: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
    };
    getByLabel.mockResolvedValue(existing);

    await openComponentsWindow();

    expect(existing.unminimize).toHaveBeenCalledOnce();
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(existing.unminimize.mock.invocationCallOrder[0]).toBeLessThan(
      existing.show.mock.invocationCallOrder[0],
    );
    expect(existing.show.mock.invocationCallOrder[0]).toBeLessThan(
      existing.setFocus.mock.invocationCallOrder[0],
    );
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('reports asynchronous native window creation failures', async () => {
    await openComponentsWindow();
    once.mock.calls[0][1]();

    expect(showError).toHaveBeenCalledWith('The component gallery could not be opened.');
  });

  it('reports lookup failures', async () => {
    getByLabel.mockRejectedValue(new Error('lookup failed'));

    await openComponentsWindow();

    expect(createWindow).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('The component gallery could not be opened: Error: lookup failed');
  });

  it('reports synchronous window creation failures', async () => {
    createWindow.mockImplementation(() => {
      throw new Error('creation failed');
    });

    await openComponentsWindow();

    expect(showError).toHaveBeenCalledWith(
      'The component gallery could not be opened: Error: creation failed',
    );
  });
});
