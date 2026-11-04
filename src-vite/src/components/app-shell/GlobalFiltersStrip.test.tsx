import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { useAppStore } from '@/stores/appState';
import { GlobalFiltersStrip } from './GlobalFiltersStrip';

vi.mock('@/stores/appState', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/appState')>();
  return {
    ...original,
    useAppStore: Object.assign(
      (selector: (state: ReturnType<typeof original.useAppStore.getState>) => unknown) =>
        selector(original.useAppStore.getState()),
      original.useAppStore,
    ),
  };
});

beforeEach(() => {
  useAppStore.setState({ searchQuery: [], pageChrome: { kind: 'photos' } });
});

describe('library filter strip', () => {
  it('renders no banner without active filters', () => {
    expect(renderToStaticMarkup(<GlobalFiltersStrip />)).toBe('');
  });

  it('shows matching icons alongside filter labels and removal controls', () => {
    useAppStore.setState({
      searchQuery: [{ filters: parseSearchBarInput('type:video person:Ana no:tag').filters }],
    });
    const markup = renderToStaticMarkup(<GlobalFiltersStrip />);
    expect(markup).toContain('Library filters');
    expect(markup).toContain('tabler-icon-video');
    expect(markup).toContain('tabler-icon-users');
    expect(markup).toContain('tabler-icon-tag-off');
    expect(markup).toContain('aria-label="Remove filter: Videos only"');
    expect(markup).toContain('aria-label="Remove filter: Person: Ana"');
    expect(markup).toContain('Clear all');
  });

  it('keeps the inactive banner and icons when filters do not apply', () => {
    useAppStore.setState({
      searchQuery: [{ filters: parseSearchBarInput('year:2024').filters }],
      pageChrome: { kind: 'faces', globalFilters: 'paused' },
    });
    const markup = renderToStaticMarkup(<GlobalFiltersStrip />);
    expect(markup).toContain('global-filters-strip--inactive');
    expect(markup).toContain('Not applied to this view');
    expect(markup).toContain('tabler-icon-calendar');
  });
});
