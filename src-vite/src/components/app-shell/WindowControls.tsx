import { platform } from '@tauri-apps/plugin-os';
import { cn } from '@/lib/utils';
import { useIsWindowMaximized, useWindowControls } from '@/system/useWindowControls';
import { IconMinus, IconSquare, IconX } from '@tabler/icons-react';

/**
 * The Windows "restore down" glyph (two overlapping squares). Tabler has no
 * equivalent, so it is drawn here with the same stroke style as its icons.
 */
function IconRestoreWindow() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 10h10v10H7z" />
      <path d="M10 7V4h10v10h-3" />
    </svg>
  );
}

/**
 * The minimize / maximize / close cluster for the app's custom window chrome.
 * Relies on the `.window-controls` / `.window-control-button` styles (defined
 * in `toolbar.css`, loaded globally by the always-mounted main toolbar); host
 * surfaces can recolor them via a scoped selector.
 */
export function WindowControls({ className }: { className?: string }) {
  // macOS keeps its native traffic lights (see `tauri.macos.conf.json`).
  return platform() === 'macos' ? null : <_CustomWindowControls className={className} />;
}

function _CustomWindowControls({ className }: { className?: string }) {
  const { minimize, toggleMaximize, close } = useWindowControls();
  const isMaximized = useIsWindowMaximized();

  return (
    <div className={cn('window-controls', className)} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="window-control-button" aria-label="Minimize window" onClick={minimize}>
        <IconMinus size={16} />
      </button>

      <button
        type="button"
        className="window-control-button"
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        onClick={toggleMaximize}
      >
        {isMaximized ? <IconRestoreWindow /> : <IconSquare size={14} />}
      </button>

      <button
        type="button"
        className="window-control-button window-control-button-close"
        aria-label="Close window"
        onClick={close}
      >
        <IconX size={16} />
      </button>
    </div>
  );
}
