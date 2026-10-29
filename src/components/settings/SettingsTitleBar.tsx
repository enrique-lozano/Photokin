import { IconChevronRight, IconX } from '@tabler/icons-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MouseEvent } from 'react';
import './settingsTitleBar.css';

interface SettingsTitleBarProps {
  title: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
}

export function SettingsTitleBar({ title, breadcrumbs }: SettingsTitleBarProps) {
  const appWindow = getCurrentWindow();

  async function handleCloseWindow() {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window', error);
    }
  }

  async function handleStartDragging(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    try {
      await appWindow.startDragging();
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
