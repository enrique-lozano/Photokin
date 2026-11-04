import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSearchBarInput } from '@/common/query/searchInput';
import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { useAppStore } from '@/stores/appState';
import { Search } from './Search';

const mocks = vi.hoisted(() => ({
  query: 'beach',
  error: null as string | null,
  mode: 'ordered',
  searching: false,
  global: false,
  count: 0,
  countError: null as Error | null,
  queryFilters: null as SearchFilter[] | null,
  action: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams({ q: mocks.query }), vi.fn()],
}));
vi.mock('./useSearchResults', () => ({
  useSearchResults: () => ({
    mode: mocks.mode,
    searchQuery: [],
    queryFilters: mocks.searching ? [] : (mocks.queryFilters ?? parseSearchBarInput(mocks.query).filters),
    assetIds: [],
    isSearching: mocks.searching,
    error: mocks.error,
    retry: vi.fn(),
    smartSearchFailed: false,
    canShowWeaker: false,
    showWeaker: vi.fn(),
    parsed: parseSearchBarInput(mocks.query),
  }),
}));
vi.mock('@/components/app-shell/ClearLibraryFilters', () => ({
  useHasActiveLibraryFilters: () => mocks.global,
}));
vi.mock('@/components/page-content/usePageChrome', () => ({ usePageChrome: vi.fn() }));
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
vi.mock('@/components/ui/button', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ui/button')>();
  return {
    ...original,
    Button: (props: React.ComponentProps<typeof original.Button>) => {
      if (props.title?.startsWith('Apply these filters')) mocks.action(props);
      return <original.Button {...props} />;
    },
  };
});
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: () => ({ data: mocks.count, error: mocks.countError, loading: false }),
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/components/smart-search/SmartSearchHint', () => ({ SmartSearchHint: () => null }));
vi.mock('@/components/ordered-gallery/OrderedAssetGallery', () => ({
  OrderedAssetGallery: ({ emptyAction }: { emptyAction: React.ReactNode }) => (
    <div>No results{emptyAction}</div>
  ),
}));
vi.mock('@/components/timeline-gallery/TimelineGallery', () => ({
  TimelineGallery: () => <div>Timeline</div>,
}));

beforeEach(() => {
  Object.assign(mocks, {
    query: 'beach',
    error: null,
    mode: 'ordered',
    searching: false,
    global: false,
    count: 0,
    countError: null,
    queryFilters: null,
  });
  mocks.action.mockClear();
  useAppStore.setState({ searchQuery: [] });
});

describe('search result feedback', () => {
  it.each([
    ['rating>3', '1 detected filter'],
    ['rating>3 type:photo no:tag', '3 detected filters'],
    ['rating:3..5', '1 detected filter'],
  ])('starts the filter card collapsed with the detected count for %s', (query, count) => {
    mocks.query = query;
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain(count);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('search-interpretation__toggle');
  });

  it('shows search failure and retry instead of success-shaped no results', () => {
    mocks.error = 'Database unavailable';
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Search couldn');
    expect(markup).toContain('Database unavailable');
    expect(markup).toContain('Retry search');
    expect(markup).not.toContain('No results');
  });

  it('offers edit and clearing only the query filters on zero structured results', () => {
    mocks.query = 'type:video';
    mocks.mode = 'timeline';
    mocks.global = true;
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('No results');
    expect(markup).toContain('Edit search');
    expect(markup).toContain('Clear query filters');
    expect(markup).toContain('About these filters');
    expect(markup).not.toContain('Library filters also apply');
    expect(markup).not.toContain('Timeline');
  });

  it('keeps presence details collapsed while showing malformed-text notices', () => {
    mocks.query = 'has:person rating:abc';
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Has detected faces');
    expect(markup).toContain('Applied filters');
    expect(markup).toContain('rating:abc is being searched as text');
    expect(markup).toContain('aria-label="About these filters"');
    expect(markup).not.toContain('include unnamed faces');
    expect(markup).not.toContain('Assigned tags count file tags');
    expect(markup).not.toContain('Interpreted as');
  });

  it('does not flash an unfiltered timeline while resolving structured filters', () => {
    mocks.searching = true;
    mocks.mode = 'timeline';
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Searching your library');
    expect(markup).not.toContain('Timeline');
  });

  it('surfaces timeline count errors instead of rendering an empty-success gallery', () => {
    mocks.mode = 'timeline';
    mocks.countError = new Error('Count failed');
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Count failed');
    expect(markup).not.toContain('Timeline');
  });

  it('adds only resolved query filters while preserving existing library filters and search text', () => {
    mocks.query = 'person:Ana beach type:video';
    const person = { id: 'ana', name: 'Ana', parentId: null, color: null };
    mocks.queryFilters = [
      { filterCriteria: FilterCriteria.person, operator: 'contains', value: [person] },
      ...parseSearchBarInput('type:video').filters,
    ];
    const existing = [{ filters: parseSearchBarInput('year:2024').filters }];
    useAppStore.setState({ searchQuery: existing });
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Add as library filters');
    expect(markup).toContain('tabler-icon-users');
    expect(markup).toContain('tabler-icon-video');
    const props = mocks.action.mock.calls[0][0];
    expect(props.disabled).toBe(false);
    props.onClick();
    expect(useAppStore.getState().searchQuery).toEqual([...existing, { filters: mocks.queryFilters }]);
    expect(mocks.query).toBe('person:Ana beach type:video');

    const updated = renderToStaticMarkup(<Search />);
    expect(updated).toContain('Added to library filters');
    expect(mocks.action.mock.lastCall?.[0].disabled).toBe(true);
  });

  it('does not offer library filters for ordinary words or invalid filter text', () => {
    mocks.query = 'beach rating:abc';
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).not.toContain('Add as library filters');
    expect(markup).not.toContain('About these filters');
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it.each(['loading', 'error'])('disables adding filters during %s', (state) => {
    mocks.query = 'type:video';
    mocks.searching = state === 'loading';
    mocks.error = state === 'error' ? 'Search failed' : null;
    renderToStaticMarkup(<Search />);
    expect(mocks.action.mock.lastCall?.[0].disabled).toBe(true);
  });
});
