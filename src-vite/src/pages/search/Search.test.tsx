import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { Search } from './Search';

const mocks = vi.hoisted(() => ({
  query: 'beach',
  error: null as string | null,
  mode: 'ordered',
  searching: false,
  global: false,
  count: 0,
  countError: null as Error | null,
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams({ q: mocks.query }), vi.fn()],
}));
vi.mock('./useSearchResults', () => ({
  useSearchResults: () => ({
    mode: mocks.mode,
    searchQuery: [],
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
  });
});

describe('search result feedback', () => {
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
    expect(markup).toContain('Library filters also apply');
    expect(markup).not.toContain('Timeline');
  });

  it('shows exact presence meaning and malformed-text notices separately', () => {
    mocks.query = 'has:person rating:abc';
    const markup = renderToStaticMarkup(<Search />);
    expect(markup).toContain('Has detected faces');
    expect(markup).toContain('Applied filters');
    expect(markup).toContain('rating:abc is being searched as text');
    expect(markup).toContain('include unnamed faces');
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
});
