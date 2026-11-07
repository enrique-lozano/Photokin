import type { ComponentProps, PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { getConditions } from '@/common/searchQueryUtils';
import { FilterChipRow } from '@/components/page-content/FilterChipRow';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { CalendarPage } from './Calendar';
import { WHOLE } from './calendar.utils';

const mocks = vi.hoisted(() => ({
  selection: { year: 2025, month: 3, date: -1 },
  groupBy: 'month',
  sortBy: 'dateTaken',
  active: false,
  loading: false,
  refreshing: false,
  toggle: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => react.useState(initial === null ? mocks.selection : initial),
  };
});
vi.mock('@/stores/appState', () => ({
  useAppStore: () => ({ searchQuery: [] }),
}));
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { timelineGroupBy: string; timelineSortBy: string }) => unknown) =>
    selector({ timelineGroupBy: mocks.groupBy, timelineSortBy: mocks.sortBy }),
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: () => ({ data: [{ sectionId: '2025-03-02', totalImages: 4 }] }),
}));
vi.mock('@/components/page-content/useContentFilterChips', () => ({
  useContentFilterChips: vi.fn(() => ({
    chips: [],
    activeChipIds: mocks.active ? ['rating'] : [],
    toggleChip: mocks.toggle,
    clear: mocks.clear,
    conditions: mocks.active
      ? [{ filters: [{ filterCriteria: 'rating', operator: 'equals', value: 5 }] }]
      : [],
    isLoading: mocks.loading,
    isRefreshing: mocks.refreshing,
  })),
}));
vi.mock('@/components/page-content/usePageChrome', () => ({ usePageChrome: vi.fn() }));
vi.mock('@/components/app-shell/ClearLibraryFilters', () => ({
  useHasActiveLibraryFilters: () => false,
  ClearLibraryFiltersButton: () => null,
}));
vi.mock('@/components/secondary-navbar/SecondaryNavbar', () => ({
  SecondaryNavbar: ({ children }: PropsWithChildren) => <aside>{children}</aside>,
}));
vi.mock('../search/SecondaryTitleAndScrollableContent', () => ({
  SecondaryTitleAndScrollableContent: vi.fn(
    ({ filters, content }: ComponentProps<typeof SecondaryTitleAndScrollableContent>) => (
      <main>
        {filters}
        {content}
      </main>
    ),
  ),
}));
vi.mock('@/components/page-content/FilterChipRow', () => ({
  FilterChipRow: vi.fn(() => <div id="quick-filters" />),
  FilterChipPlaceholders: () => <div id="loading-filters" />,
}));
vi.mock('@/components/timeline-gallery/TimelineGallery', () => ({
  TimelineGallery: vi.fn(() => <div id="gallery" />),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selection = { year: 2025, month: 3, date: WHOLE };
  mocks.groupBy = 'month';
  mocks.sortBy = 'dateTaken';
  mocks.active = false;
  mocks.loading = false;
  mocks.refreshing = false;
});

describe('Calendar gallery filters', () => {
  function renderCalendar() {
    return renderToStaticMarkup(
      <TooltipProvider>
        <CalendarPage />
      </TooltipProvider>,
    );
  }

  it('provides quick filters scoped to the selected period and resets on date navigation', () => {
    expect(renderCalendar()).toContain('id="quick-filters"');
    expect(useContentFilterChips).toHaveBeenCalledWith({
      searchQuery: [
        {
          filters: [
            { filterCriteria: FilterCriteria.date, operator: 'greaterThan', value: new Date('2025-03-01Z') },
            { filterCriteria: FilterCriteria.date, operator: 'smallerThan', value: new Date('2025-04-01Z') },
          ],
        },
      ],
      resetKey: JSON.stringify(mocks.selection),
    });
    expect(SecondaryTitleAndScrollableContent).toHaveBeenCalledWith(
      expect.objectContaining({ galleryLayout: true, filters: expect.anything() }),
      undefined,
    );
    expect(FilterChipRow).toHaveBeenCalledWith(
      expect.objectContaining({ onToggle: mocks.toggle, disabled: false }),
      undefined,
    );
    mocks.selection = { year: 2025, month: 3, date: 2 };
    renderCalendar();
    expect(useContentFilterChips).toHaveBeenLastCalledWith(
      expect.objectContaining({ resetKey: JSON.stringify(mocks.selection) }),
    );
  });

  it('merges active chips into the gallery query and offers to clear empty results', () => {
    mocks.active = true;
    mocks.refreshing = true;
    renderCalendar();
    const props = vi.mocked(TimelineGallery).mock.calls[0][0];
    expect(getConditions(props.searchQuery).flatMap((condition) => condition.filters)).toContainEqual({
      filterCriteria: FilterCriteria.rating,
      operator: 'equals',
      value: 5,
    });
    expect(props.onNoResults?.props.onClear).toBe(mocks.clear);
    expect(FilterChipRow).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }), undefined);
  });

  it('provides placeholders while quick filters load', () => {
    mocks.loading = true;
    expect(renderCalendar()).toContain('id="loading-filters"');
    expect(FilterChipRow).not.toHaveBeenCalled();
  });

  it('wires header suppression without hiding finer or date-added groups', () => {
    renderCalendar();
    expect(vi.mocked(TimelineGallery).mock.lastCall?.[0].hideDateGroupHeaders).toBe(true);
    mocks.groupBy = 'day';
    renderCalendar();
    expect(vi.mocked(TimelineGallery).mock.lastCall?.[0].hideDateGroupHeaders).toBe(false);
    mocks.groupBy = 'month';
    mocks.sortBy = 'dateAdded';
    renderCalendar();
    expect(vi.mocked(TimelineGallery).mock.lastCall?.[0].hideDateGroupHeaders).toBe(false);
  });
});
