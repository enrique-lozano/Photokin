import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAVIGATION_PAGES } from '@/common/navigationPages';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settingsStore';
import { HomeRedirect } from './HomeRedirect';

vi.mock('@/router', () => ({
  AppRoutes: { albums: '/albums', tags: '/tags', duplicates: '/duplicates' },
}));
vi.mock('react-router-dom', () => ({
  Navigate: ({ to, replace }: { to: string; replace: boolean }) => (
    <span data-destination={to} data-replace={replace} />
  ),
}));
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

describe('startup navigation', () => {
  it('opens Albums by default, replacing the home history entry', () => {
    const html = renderToStaticMarkup(<HomeRedirect />);
    expect(html).toContain('data-destination="/albums"');
    expect(html).toContain('data-replace="true"');
  });

  it('opens the first visible page in the configured order', () => {
    useSettingsStore.getState().setNavigationPages(
      [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({
        ...page,
        visible: page.id === 'tags' || page.id === 'albums',
      })),
    );
    expect(renderToStaticMarkup(<HomeRedirect />)).toContain('data-destination="/tags"');
  });
});
