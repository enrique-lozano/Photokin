import { IconChevronRight, IconX } from '@tabler/icons-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MouseEvent } from 'react';
import './settingsTitleBar.css';

interface SettingsTitleBarProps {
  title: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
}

export function SettingsTitleBar({ title, breadcrumbs }: SettingsTitleBarProps) {
  // Resolved on use, not on render, so the UI kit also renders in a plain browser.
  async function handleCloseWindow() {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error('Failed to close window', error);
    }
  }

  async function handleStartDragging(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error('Failed to start window drag', error);
    }
  }

  return (
    <header className="settings-title-bar" data-tauri-drag-region onMouseDown={handleStartDragging}>
      {breadcrumbs?.length ? (
        <nav className="settings-title-breadcrumb" aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((item, index) => (
              <li key={item.label}>
                {index > 0 && <IconChevronRight size={12} aria-hidden="true" />}
                {item.onClick && index < breadcrumbs.length - 1 ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={item.onClick}
                  >
                    {item.label}
                  </button>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <div className="text-sm font-semibold text-muted-foreground" data-tauri-drag-region>
          {title}
        </div>
      )}
      <div className="settings-title-bar-spacer" data-tauri-drag-region />
      <div className="settings-window-controls" onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="settings-window-control-button settings-window-control-button-close"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={handleCloseWindow}
        >
          <IconX size={16} />
        </button>
      </div>
    </header>
  );
}
