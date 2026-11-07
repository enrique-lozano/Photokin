import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_NAVIGATION_PAGES } from '@/common/navigationPages';
import { SettingsNavigation } from './SettingsNavigation';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));
vi.mock('@/stores/settingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/settingsStore')>();
  return {
    ...actual,
    useSettingsStore: Object.assign(
      <T,>(selector: (state: ReturnType<typeof actual.useSettingsStore.getState>) => T) =>
        selector(actual.useSettingsStore.getState()),
      actual.useSettingsStore,
    ),
  };
});

beforeEach(() => {
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

function renderSettings() {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SettingsNavigation />
    </TooltipProvider>,
  );
}

describe('navigation settings page', () => {
  it('renders every page with labelled ordering and visibility controls', () => {
    const html = renderSettings();
    for (const { id } of DEFAULT_NAVIGATION_PAGES) {
      const label = id[0].toUpperCase() + id.slice(1);
      expect(html).toContain(`aria-label="Move ${label} up"`);
      expect(html).toContain(`aria-label="Move ${label} down"`);
      expect(html).toContain(`aria-label="Show ${label} in sidebar"`);
    }
    expect(html).toContain('Restore defaults');
    expect(html).toContain('Hidden pages remain accessible through links.');
    expect(html).toContain('first visible page on start');
  });

  it('renders the saved order and disables the last visible page switch', () => {
    useSettingsStore.getState().setNavigationPages(
      [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({
        ...page,
        visible: page.id === 'tags',
      })),
    );
    const html = renderSettings();
    expect(html.indexOf('Move Duplicates up')).toBeLessThan(html.indexOf('Move Albums up'));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Show Tags in sidebar"/);
    expect(html).toContain('At least one page must stay visible.');
  });
});
