import type { ComponentProps, PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoMap } from '@/components/location/PhotoMap';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { PlacesPage } from './Places';
import type { MapBounds } from '@/components/location/mapBounds';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  mapMounted: true,
  area: null as MapBounds | null,
  setState: vi.fn(),
  groupBy: 'place',
  placeCount: 1,
  queryIndex: 0,
  points: [{ id: 'photo', latitude: 41.4, longitude: 2.2 }],
  mapError: null as Error | null,
  conditions: [{ filters: [{ filterCriteria: 'rating', operator: 'equals', value: 5 }] }],
}));

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++;
      const [value] = react.useState(
        index === 1
          ? mocks.area
            ? null
            : mocks.groupBy === 'country'
              ? 'ES'
              : 'ES\u0000Catalonia\u0000Barcelona'
          : index === 2
            ? mocks.area
            : index === 3
              ? mocks.mapMounted
              : initial,
      );
      return [value, mocks.setState];
    },
  };
});
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (state: { searchQuery: [] }) => unknown) => selector({ searchQuery: [] }),
}));
vi.mock('@/stores/sidebarStore', () => ({
  useSidebarStore: (selector: (state: { sort: { places: string }; placesGroupBy: string }) => unknown) =>
    selector({ sort: { places: 'name' }, placesGroupBy: mocks.groupBy }),
}));
vi.mock('@/stores/hiddenItemsStore', () => ({
  useHiddenItemsStore: (selector: (state: { showHiddenItems: boolean }) => unknown) =>
    selector({ showHiddenItems: false }),
}));
vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: {
    getFileCountByPlace: vi.fn().mockResolvedValue([]),
    getGeoPoints: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: (query: () => Promise<unknown>) => {
    void query();
    const index = mocks.queryIndex++;
    return index === 0
      ? {
          data: Array.from({ length: mocks.placeCount }, (_, index) => ({
            city: index === 0 ? 'Barcelona' : `City ${index}`,
            state: 'Catalonia',
            country: 'Spain',
            countryCode: 'ES',
            totalImages: 3,
            totalSizeInBytes: 300,
          })),
        }
      : index === 1
        ? { data: mocks.points, error: mocks.mapError }
        : { data: mocks.area ? null : mocks.points };
  },
}));
vi.mock('@/components/page-content/useContentFilterChips', () => ({
  useContentFilterChips: vi.fn(() => ({ chips: [], activeChipIds: [], conditions: mocks.conditions })),
}));
vi.mock('@/components/page-content/usePageChrome', () => ({ usePageChrome: vi.fn() }));
vi.mock('@/components/app-shell/ClearLibraryFilters', () => ({
  useHasActiveLibraryFilters: () => false,
  ClearLibraryFiltersButton: () => null,
}));
vi.mock('@/components/page-content/ImportStatus', () => ({
  ImportStatusProvider: ({ children }: PropsWithChildren) => children,
  ImportStatus: () => null,
  useImportStatus: () => null,
}));
vi.mock('@/components/secondary-navbar/SecondaryNavbar', () => ({
  SecondaryNavbar: ({ children }: PropsWithChildren) => <aside>{children}</aside>,
}));
vi.mock('../search/SecondaryTitleAndScrollableContent', () => ({
  SecondaryTitleAndScrollableContent: vi.fn(
    ({ heroBelow, content }: ComponentProps<typeof SecondaryTitleAndScrollableContent>) => (
      <main>
        {heroBelow}
        {content}
      </main>
    ),
  ),
}));
vi.mock('@/components/timeline-gallery/TimelineGallery', () => ({
  TimelineGallery: vi.fn(() => <div id="gallery" />),
}));
vi.mock('@/components/location/PhotoMap', () => ({
  PhotoMap: vi.fn(() => <div id="photo-map" />),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryIndex = 0;
  mocks.stateIndex = 0;
  mocks.mapMounted = true;
  mocks.area = null;
  mocks.groupBy = 'place';
  mocks.placeCount = 1;
  mocks.mapError = null;
});

describe('Places sidebar map', () => {
  it('windows a large grouped place list without mounting every city', () => {
    mocks.placeCount = 10000;
    const markup = renderToStaticMarkup(<PlacesPage />);
    const rows = markup.match(/class="place-list-row(?: selected)?"/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(30);
    expect(markup).toContain('aria-setsize="10000"');
    expect(markup).toContain('places-group-label');
    expect(markup).not.toContain('City 9999');
  });

  it('does not initialize the map before it is first opened', () => {
    mocks.mapMounted = false;
    renderToStaticMarkup(<PlacesPage />);
    expect(PhotoMap).not.toHaveBeenCalled();
    expect(TimelineGallery).toHaveBeenCalled();
  });
  it.each(['place', 'country'])('keeps the library map independent of the selected %s', async (groupBy) => {
    mocks.groupBy = groupBy;
    const markup = renderToStaticMarkup(<PlacesPage />);
    expect(markup.indexOf('id="photo-map"')).toBeLessThan(markup.indexOf('</aside>'));
    expect(markup).not.toContain('Places view');
    expect(markup).not.toContain('in this area');
    expect(vi.mocked(PhotoMap).mock.calls[0][0].points).toBe(mocks.points);
    expect(vi.mocked(PhotoMap).mock.calls[0][0].focus).toBe(mocks.points);
    expect(vi.mocked(SecondaryTitleAndScrollableContent).mock.calls[0][0].heroBelow).toBeUndefined();

    const { AssetsService } = await import('@/db/api/services/assets.service');
    const galleryQuery = vi.mocked(TimelineGallery).mock.calls[0][0].searchQuery;
    expect(AssetsService.getGeoPoints).toHaveBeenNthCalledWith(1, { searchQuery: [] });
    expect(AssetsService.getGeoPoints).toHaveBeenCalledTimes(2);
    expect(galleryQuery).toContainEqual(mocks.conditions[0]);
    expect(vi.mocked(TimelineGallery).mock.calls[0][0].assetIdsFilter).toBeUndefined();
  });

  it.each([
    [{ south: 40, north: 42, west: 1, east: 3 }, ['photo']],
    [{ south: -10, north: 10, west: 1, east: 3 }, []],
  ])('uses the applied area %j without selecting a list row', (area, ids) => {
    mocks.area = area;
    const markup = renderToStaticMarkup(<PlacesPage />);
    expect(markup).not.toContain('place-list-row selected');
    expect(vi.mocked(SecondaryTitleAndScrollableContent).mock.calls[0][0].title).toBe('Map area');
    expect(vi.mocked(TimelineGallery).mock.calls[0][0].assetIdsFilter).toEqual(ids);
    expect(useContentFilterChips).toHaveBeenCalledWith(expect.objectContaining({ assetIds: ids }));
    expect(vi.mocked(PhotoMap).mock.calls[0][0].focus).toBeNull();
    expect(markup).toContain('id="gallery"');
  });

  it('only applies the area when the map confirms it', () => {
    renderToStaticMarkup(<PlacesPage />);
    expect(mocks.setState).not.toHaveBeenCalled();
    const bounds = { south: 40, north: 42, west: 1, east: 3 };
    vi.mocked(PhotoMap).mock.calls[0][0].onSelectArea(bounds);
    expect(mocks.setState.mock.calls).toEqual([[bounds], [null]]);
  });

  it('shows location query errors without hiding the gallery', () => {
    mocks.mapError = new Error('Location query failed');
    const markup = renderToStaticMarkup(<PlacesPage />);
    expect(markup).toContain('Could not load photo locations');
    expect(markup).toContain('Location query failed');
    expect(markup).not.toContain('id="photo-map"');
    expect(markup).toContain('id="gallery"');
  });
});
