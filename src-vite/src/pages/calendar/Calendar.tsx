import { IconCalendarMonth, IconCalendarSearch } from '@tabler/icons-react';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { useEffect, useMemo, useState } from 'react';
import {
  ClearLibraryFiltersButton,
  useHasActiveLibraryFilters,
} from '@/components/app-shell/ClearLibraryFilters';
import { Segmented } from '@/components/segmented/Segmented';
import { Button } from '@/components/ui/button.tsx';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AssetsService } from '@/db/api/services/assets.service.ts';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar';
import { TimelineGallery } from '../../components/timeline-gallery/TimelineGallery';
import { useAppStore } from '../../stores/appState.ts';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { formatDate } from '../../utils/dateFormatter';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent.tsx';
import { CalendarDaily } from './CalendarDaily';
import { CalendarMonthly } from './CalendarMonthly';
import './calendar.css';
import {
  CalendarSelection,
  WHOLE,
  buildSelectionSearchQuery,
  getSelectionCount,
  getSortedMonths,
  getSortedYears,
  groupDaySections,
  isCurrentMonth,
} from './calendar.utils';

type CalendarView = 'monthly' | 'daily';

function selectionTitle(selection: CalendarSelection): string {
  const { year, month, date } = selection;

  if (month === WHOLE) {
    return String(year);
  }
  if (date === WHOLE) {
    return formatDate(new Date(Date.UTC(year, month - 1, 1)), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return formatDate(new Date(Date.UTC(year, month - 1, date)), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function CalendarPage() {
  const { searchQuery } = useAppStore();
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const [view, setView] = useState<CalendarView>('monthly');
  const [selection, setSelection] = useState<CalendarSelection | null>(null);

  const { data: daySections } = useLiveQuery(
    () => AssetsService.getFileCountByDay({ searchQuery }),
    ['assets'],
    { extDependencies: [searchQuery] },
  );

  const calendarData = useMemo(() => groupDaySections(daySections ?? []), [daySections]);
  const sortedYears = useMemo(() => getSortedYears(calendarData), [calendarData]);
  const hasData = sortedYears.length > 0;

  // Keep the selection valid against the live data, and pre-select the most
  // recent populated month so the gallery isn't empty on first visit.
  useEffect(() => {
    if (!hasData) {
      if (selection !== null) setSelection(null);
      return;
    }

    const stillValid =
      selection &&
      calendarData[selection.year] &&
      (selection.month === WHOLE || calendarData[selection.year][selection.month]);

    if (stillValid) return;

    const latestYear = sortedYears[0];
    const latestMonth = getSortedMonths(calendarData[latestYear])[0];
    setSelection({ year: latestYear, month: latestMonth, date: WHOLE });
  }, [hasData, sortedYears, calendarData, selection]);

  const jumpToToday = () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const date = now.getUTCDate();

    if (calendarData[year]?.[month]?.some((day) => day.date === date)) {
      setSelection({ year, month, date: view === 'daily' ? date : WHOLE });
    } else if (calendarData[year]?.[month]) {
      setSelection({ year, month, date: WHOLE });
    }
  };

  const selectionCount = selection ? getSelectionCount(calendarData, selection) : 0;
  const galleryQuery = selection ? buildSelectionSearchQuery(searchQuery, selection) : searchQuery;
  const canJumpToToday = sortedYears.some((year) =>
    Object.keys(calendarData[year]).some((month) => isCurrentMonth(year, Number(month))),
  );

  usePageChrome('photos');

  return (
    <div className="calendar-page">
      <div>
        <SecondaryNavbar title="Calendar">
          {/* View tabs carry the only list-level control (jump to today) on the
              right — no sidebar title/action bar (mocks keep the left menu bare). */}
          <div className="calendar-toolbar">
            <Segmented
              ariaLabel="Calendar view"
              fill
              className="calendar-view-tabs"
              value={view}
              onChange={setView}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'daily', label: 'Daily' },
              ]}
            />
            {/* Disabled buttons swallow hover, so the tooltip hangs off a wrapper. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="calendar-toolbar__today" tabIndex={canJumpToToday ? undefined : 0}>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={jumpToToday}
                    disabled={!canJumpToToday}
                    aria-label="Jump to today"
                  >
                    <IconCalendarSearch size={16} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {canJumpToToday ? 'Jump to today' : 'No photos or videos from this month yet'}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="calendar-scroll">
            {daySections === null &&
              Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} className="h-44 w-full shrink-0 rounded-[10px]" />
              ))}
            {daySections !== null && !hasData && (
              <EmptyState
                size="sidebar"
                icon={IconCalendarMonth}
                title="No dates yet"
                description="Photos and videos show up here by the day they were taken."
              />
            )}
            {sortedYears.map((year) =>
              view === 'monthly' ? (
                <CalendarMonthly
                  key={year}
                  year={year}
                  months={calendarData[year]}
                  selection={selection}
                  onSelect={setSelection}
                />
              ) : (
                getSortedMonths(calendarData[year]).map((month) => (
                  <CalendarDaily
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    days={calendarData[year][month]}
                    selection={selection}
                    onSelect={setSelection}
                  />
                ))
              ),
            )}
          </div>
        </SecondaryNavbar>

        {!selection ? (
          <div className="page-content">
            {daySections === null ? null : !hasData ? (
              <EmptyState
                icon={IconCalendarMonth}
                title={
                  hasLibraryFilters ? 'No dated photos match your filters' : 'Nothing on the calendar yet'
                }
                description={
                  hasLibraryFilters ? (
                    'Remove a library filter, or clear them all, to see more dates.'
                  ) : (
                    <>
                      Photos and videos appear here by the day they were taken. To add a missing date, select
                      them and choose Edit date &amp; time (
                      <KbdGroup>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>D</Kbd>
                      </KbdGroup>
                      ).
                    </>
                  )
                }
                action={hasLibraryFilters ? <ClearLibraryFiltersButton /> : undefined}
                pendingImport="metadata"
              />
            ) : (
              <EmptyState
                icon={IconCalendarMonth}
                title="Select a date"
                description="Pick a year, month or day on the left to see the photos and videos taken then."
              />
            )}
          </div>
        ) : (
          <div className="page-content">
            <SecondaryTitleAndScrollableContent
              icon={<IconCalendarMonth />}
              title={selectionTitle(selection)}
              subtitle={`${selectionCount.toLocaleString()} item${selectionCount === 1 ? '' : 's'}`}
              galleryLayout
              content={<TimelineGallery key={JSON.stringify(selection)} searchQuery={galleryQuery} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
