import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';
import { Toolbar } from './toolbar';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/search', key: 'test' },
  params: new URLSearchParams(),
  submit: (query: string) => {
    void query;
  },
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/router', () => ({ AppRoutes: { search: '/search' } }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
  useSearchParams: () => [mocks.params],
}));
vi.mock('@/system/useWindowControls', () => ({
  useWindowControls: () => ({ startDragging: vi.fn(), handleDragRegionDoubleClick: vi.fn() }),
}));
vi.mock('../app-shell/GlobalFilterButton', () => ({ GlobalFilterButton: () => null }));
vi.mock('../app-shell/WindowControls', () => ({ WindowControls: () => null }));
vi.mock('./search-bar/SearchBar', () => ({
  SearchBar: ({ onSubmit }: { onSubmit: (query: string) => void }) => {
    mocks.submit = onSubmit;
    return null;
  },
}));

beforeEach(() => {
  vi.stubGlobal('window', { history: { state: { idx: 0 }, length: 1 } });
  useRecentSearchesStore.setState({ queries: [] });
  mocks.navigate.mockClear();
  mocks.params = new URLSearchParams();
  renderToStaticMarkup(<Toolbar />);
});

describe('search submission history', () => {
  it('records only explicit submissions before navigating', () => {
    expect(useRecentSearchesStore.getState().queries).toEqual([]);
    mocks.submit('beach');
    expect(useRecentSearchesStore.getState().queries).toEqual(['beach']);
    expect(mocks.navigate).toHaveBeenCalledWith({ pathname: '/search', search: 'q=beach' });
  });

  it('moves an unchanged submitted query to the top without adding a navigation entry', () => {
    useRecentSearchesStore.getState().record('beach');
    useRecentSearchesStore.getState().record('mountains');
    mocks.params = new URLSearchParams({ q: 'beach' });
    renderToStaticMarkup(<Toolbar />);
    mocks.submit('beach');
    expect(useRecentSearchesStore.getState().queries).toEqual(['beach', 'mountains']);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('still permits submitting an empty query to clear results without storing it', () => {
    mocks.params = new URLSearchParams({ q: 'beach' });
    renderToStaticMarkup(<Toolbar />);
    mocks.submit('');
    expect(useRecentSearchesStore.getState().queries).toEqual([]);
    expect(mocks.navigate).toHaveBeenCalledWith({ pathname: '/search', search: 'q=' });
  });
});
