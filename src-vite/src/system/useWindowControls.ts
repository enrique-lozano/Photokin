import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

/**
 * Shared behaviour for the custom (decoration-less) window chrome: minimize,
 * maximize/restore and close, plus the drag-region handlers. Reused by the main
 * toolbar and the lightbox top bar so every custom title bar behaves the same.
 */
export function useWindowControls() {
  const appWindow = getCurrentWindow();

  async function minimize() {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window', error);
    }
  }

  async function toggleMaximize() {
    try {
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
        return;
      }

      await appWindow.maximize();
    } catch (error) {
      console.error('Failed to toggle window maximize', error);
    }
  }

  async function close() {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window', error);
    }
  }

  async function startDragging(event: MouseEvent<HTMLElement>) {
    // Only the primary button starts a drag; ignore the second click of a
    // double-click so the maximize toggle can run instead.
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error('Failed to start window drag', error);
    }
  }

  async function handleDragRegionDoubleClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    await toggleMaximize();
  }

  return { minimize, toggleMaximize, close, startDragging, handleDragRegionDoubleClick };
}

/**
 * Tracks whether the current window is maximized so title bars can show the
 * matching maximize / restore glyph. Kept apart from `useWindowControls` so the
 * drag-region consumers don't re-render on every resize.
 */
export function useIsWindowMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let isActive = true;

    async function syncMaximizedState() {
      try {
        const maximized = await appWindow.isMaximized();
        if (isActive) {
          setIsMaximized(maximized);
        }
      } catch (error) {
        console.error('Failed to read window maximized state', error);
      }
    }

    void syncMaximizedState();
    const unlisten = appWindow.onResized(() => void syncMaximizedState());

    return () => {
      isActive = false;
      void unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, []);

  return isMaximized;
}
