import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAVIGATION_PAGES } from '@/common/navigationPages';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settingsStore';
import { Navbar } from './navbar';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('../../router', () => ({
  AppRoutes: {
    albums: '/albums',
    tags: '/tags',
    people: '/people',
    places: '/places',
    calendar: '/calendar',
    stats: '/stats',
    duplicates: '/duplicates',
  },
}));
vi.mock('../../utils/openSettingsWindow', () => ({ openSettingsWindow: vi.fn() }));
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

describe('main navigation', () => {
  it('uses saved order and visibility while keeping settings available', () => {
    useSettingsStore.getState().setNavigationPages(
      [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({
        ...page,
        visible: page.id !== 'albums',
      })),
    );
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/tags/view/example']}>
        <TooltipProvider>
          <Navbar />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(html).not.toContain('href="/albums"');
    expect(html.indexOf('href="/duplicates"')).toBeLessThan(html.indexOf('href="/tags"'));
    expect(html.match(/<a[^>]*href="\/tags"[^>]*>/)?.[0]).toContain('aria-current="page"');
    expect(html).toContain('Open settings');
  });
});
