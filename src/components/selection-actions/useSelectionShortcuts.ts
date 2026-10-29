import { useEffect } from 'react';
import { useAppStore } from '../../stores/appState';
import { SelectionActionsApi } from './useSelectionActions';

/** True while focus is in a field that should receive the keystroke itself. */
function _isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable)
  );
}

/**
 * Global keyboard shortcuts for the current photo selection, matching the menu
 * hints. Only active while `enabled` (there is a selection) and never fires
 * while typing in a field. Every shortcut routes to the (mocked) bulk actions.
 */
export function useSelectionShortcuts(api: SelectionActionsApi, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (useAppStore.getState().comparisonPair) return;
      if (_isEditableTarget(event.target)) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'd':
            event.preventDefault();
            api.editDate();
            break;
          case 'g':
            event.preventDefault();
            api.editLocation();
            break;
          case 'm':
            event.preventDefault();
            api.moveToFolder();
            break;
          case 't':
            event.preventDefault();
            api.editTags();
            break;
          default:
            break;
        }
        return;
      }

      if (event.altKey || event.shiftKey) {
        return;
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          if (useAppStore.getState().galleryContext === 'trash') {
            api.deletePermanently();
          } else {
            api.trash();
          }
          break;
        case 'f':
        case 'F':
          api.toggleFavorite();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, enabled]);
}
