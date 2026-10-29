import { RefObject, useLayoutEffect } from 'react';

/** Selectors for the various sidebar list rows that can be "active". */
const SIDEBAR_SELECTED_ITEM_SELECTOR = [
  '.tree-entry-item.is-selected',
  '.person-list-row.selected',
  '.place-list-row.selected',
  '.album-auto-link.selected',
  '.sidebar-nav-item.selected',
  '.selected-item',
  '.dup-set-row.selected',
].join(', ');

/** Top-level app section from a pathname (`/tags/view/x` → `/tags`). */
export function sidebarSectionKey(pathname: string): string {
  const [, section = ''] = pathname.match(/^\/([^/]+)/) ?? [];
  return section ? `/${section}` : pathname;
}

const MAX_SCROLL_ATTEMPTS = 60;

/** Scrolls the selected sidebar row into view within `root`. */
export function scrollSidebarSelection(root: HTMLElement, preferredItemId?: string): boolean {
  if (preferredItemId) {
    const byId = root.querySelector<HTMLElement>(`#tree-entry-item-${CSS.escape(preferredItemId)}`);
    if (byId) {
      byId.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
  }

  const selected = root.querySelector<HTMLElement>(SIDEBAR_SELECTED_ITEM_SELECTOR);
  if (!selected) return false;

  selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

/**
 * When the user re-enters a sidebar section (Tags, People, Albums, …), scroll
 * the active selection into view. Retries while the list/tree is still loading
 * (`scrollWatch` should change once async sidebar content is ready).
 */
export function useScrollSidebarSelection(
  rootRef: RefObject<HTMLElement | null>,
  sectionKey: string,
  scrollWatch?: string | number | null,
  preferredItemId?: string | null,
): void {
  const scrollKey = `${sectionKey}:${scrollWatch ?? ''}:${preferredItemId ?? ''}`;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let attempts = 0;

    const tryScroll = (): void => {
      if (cancelled) return;
      if (scrollSidebarSelection(root, preferredItemId ?? undefined)) return;
      if (attempts++ < MAX_SCROLL_ATTEMPTS) {
        requestAnimationFrame(tryScroll);
      }
    };

    tryScroll();

    return () => {
      cancelled = true;
    };
  }, [rootRef, scrollKey, preferredItemId]);
}
