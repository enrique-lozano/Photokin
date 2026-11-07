export const MAIN_PAGES = [
  { id: 'albums', label: 'Albums' },
  { id: 'tags', label: 'Tags' },
  { id: 'people', label: 'People' },
  { id: 'places', label: 'Places' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'stats', label: 'Stats' },
  { id: 'duplicates', label: 'Duplicates' },
] as const;

export type MainPageId = (typeof MAIN_PAGES)[number]['id'];
export type NavigationPage = { id: MainPageId; visible: boolean };

export const DEFAULT_NAVIGATION_PAGES: NavigationPage[] = MAIN_PAGES.map(({ id }) => ({
  id,
  visible: true,
}));

export function normalizeNavigationPages(value: unknown): NavigationPage[] {
  const pages: NavigationPage[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) continue;
      const page = MAIN_PAGES.find(({ id }) => id === entry.id);
      if (!page || pages.some(({ id }) => id === page.id)) continue;
      pages.push({ id: page.id, visible: typeof entry.visible === 'boolean' ? entry.visible : true });
    }
  }
  for (const { id } of MAIN_PAGES) {
    if (!pages.some((page) => page.id === id)) pages.push({ id, visible: true });
  }
  if (!pages.some(({ visible }) => visible)) pages[0].visible = true;
  return pages;
}
