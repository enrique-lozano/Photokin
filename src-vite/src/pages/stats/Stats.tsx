import { FilterCriteria, NumberRangeFilterCriteria } from '@/common/query/filters/FilterCriteria';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { toggleCondition } from '@/common/searchQueryUtils';
import {
  APERTURE_RANGE_BOUNDS,
  FOCAL_LENGTH_RANGE_BOUNDS,
  ISO_RANGE_BOUNDS,
  SHUTTER_SPEED_RANGE_BOUNDS,
} from '@/common/statsRanges';
import {
  ClearLibraryFiltersButton,
  useHasActiveLibraryFilters,
} from '@/components/app-shell/ClearLibraryFilters';
import { Segmented } from '@/components/segmented/Segmented';
import { EmptyState } from '@/components/ui/empty-state';
import type { StatsOverview } from '@/db/api/services/assets.service';
import { countryNameFromCode } from '@/media/metadata/location/countryCode';
import { SecondaryTitleAndScrollableContent } from '@/pages/search/SecondaryTitleAndScrollableContent';
import { useAppStore } from '@/stores/appState';
import { IconChartBar } from '@tabler/icons-react';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { CaptureSettingsList } from './CaptureSettingsList';
import './stats.css';
import { ActivityChart, ChartPanel, DistributionBarChart, RankingBarChart } from './StatsCharts';
import {
  completeApertureDistribution,
  completeFocalLengthDistribution,
  completeIsoDistribution,
  completeMonthsOfYear,
  completeShutterSpeedDistribution,
  completeWeekdays,
  fillMonthlyStats,
  formatApertureBucket,
  formatFocalLengthBucket,
  formatIso,
  formatShutterBucket,
  summarizeMonthlyStats,
} from './statsFormatters';
import { StatsSummary } from './StatsSummary';
import { useStatsQueries } from './useStatsQueries';

interface BarDatum {
  label: string;
  count: number;
  countryCode?: string;
  filters?: SearchFilter[];
}

const TOP_VALUES_LIMIT = 6;

const DATE_PART_SUBTITLES = {
  years: 'Items captured each year',
  months: 'Items per month, across all years',
  weekdays: 'Items per day of the week',
};

function OrderedBarPanel({
  title,
  subtitle,
  loading,
  error,
  verticalData,
  horizontalData = verticalData,
  verticalLabel = 'Ordered values',
  className,
  onSelect,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  error: Error | null;
  verticalData: BarDatum[];
  horizontalData?: BarDatum[];
  verticalLabel?: string;
  className?: string;
  onSelect: (datum: BarDatum) => void;
}) {
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const topValues = useMemo(() => horizontalData.slice(0, TOP_VALUES_LIMIT), [horizontalData]);

  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      loading={loading}
      error={error}
      empty={!horizontalData.some(({ count }) => count)}
      className={className}
      actions={
        <Segmented
          ariaLabel={`${title} bar direction`}
          className="stats-chart-direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'vertical', label: verticalLabel },
            { value: 'horizontal', label: 'Top values' },
          ]}
        />
      }
    >
      {direction === 'vertical' ? (
        <DistributionBarChart data={verticalData} onSelect={onSelect} />
      ) : (
        <RankingBarChart data={topValues} onSelect={onSelect} />
      )}
    </ChartPanel>
  );
}

export function StatsPage() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const [placeGroup, setPlaceGroup] = useState<'city' | 'country'>('city');
  const [datePart, setDatePart] = useState<'years' | 'months' | 'weekdays'>('years');
  const queries = useStatsQueries(searchQuery, placeGroup);
  const overview = queries.overview.data;

  useEffect(() => {
    setBreadcrumb([{ label: 'Stats' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  const footerStatus = useMemo(
    () =>
      overview
        ? {
            summary: `${overview.totalAssets.toLocaleString()} matching item${overview.totalAssets === 1 ? '' : 's'}`,
            totalBytes: overview.totalSizeBytes,
          }
        : undefined,
    [overview],
  );
  usePageChrome('stats', footerStatus);

  const subtitle = overview ? _timespanLabel(overview) : 'Analyzing the current library filters';
  const activity = useMemo(() => fillMonthlyStats(queries.activity.data ?? []), [queries.activity.data]);
  const captureMonths = useMemo(
    () => summarizeMonthlyStats(queries.activity.data ?? []),
    [queries.activity.data],
  );
  const years = useMemo<BarDatum[]>(
    () =>
      captureMonths.years.map(({ year, totalImages }) => ({
        label: String(year),
        count: totalImages,
        filters: [{ filterCriteria: FilterCriteria.year, operator: 'equals', value: year }],
      })),
    [captureMonths.years],
  );
  const months = useMemo<BarDatum[]>(
    () =>
      completeMonthsOfYear(captureMonths.months).map(({ value, label, count }) => ({
        label,
        count,
        filters: [{ filterCriteria: FilterCriteria.month, operator: 'equals', value }],
      })),
    [captureMonths.months],
  );
  const weekdays = useMemo<BarDatum[]>(
    () =>
      completeWeekdays(queries.weekdays.data ?? []).map(({ value, label, count }) => ({
        label,
        count,
        filters: [{ filterCriteria: FilterCriteria.weekday, operator: 'equals', value }],
      })),
    [queries.weekdays.data],
  );
  const datePartQuery = datePart === 'weekdays' ? queries.weekdays : queries.activity;
  const datePartData = { years, months, weekdays }[datePart];
  const placeRows = queries.places.data;
  const places = useMemo<BarDatum[]>(
    () =>
      (placeRows ?? []).map(({ city, country, countryCode, totalImages }) => ({
        label:
          placeGroup === 'city'
            ? (city ?? 'Unknown city')
            : (countryNameFromCode(countryCode) ?? country ?? 'Unknown country'),
        count: totalImages,
        ...(placeGroup === 'country' ? { countryCode: countryCode ?? undefined } : {}),
      })),
    [placeGroup, placeRows],
  );
  const gear = queries.gear.data;
  const exposure = queries.exposure.data;
  const gearData = useMemo(() => {
    const withFilter =
      (filterCriteria: typeof FilterCriteria.camera | typeof FilterCriteria.lens) =>
      (datum: BarDatum): BarDatum => ({
        ...datum,
        filters: [{ filterCriteria, operator: 'equals', value: datum.label }],
      });
    return {
      cameras: (gear?.cameras ?? []).map(withFilter(FilterCriteria.camera)),
      lenses: (gear?.lenses ?? []).map(withFilter(FilterCriteria.lens)),
    };
  }, [gear]);
  const addChartFilter = useCallback(
    ({ filters }: BarDatum) => {
      if (!filters?.length) return;
      const currentQuery = useAppStore.getState().searchQuery;
      startTransition(() => setSearchQuery(toggleCondition(currentQuery, filters)));
    },
    [setSearchQuery],
  );
  const filterActivityMonth = useCallback(
    (month: string) => addChartFilter({ label: month, count: 0, filters: _monthFilters(month) }),
    [addChartFilter],
  );
  const rangeData = useMemo(
    () => ({
      iso: _rangeData(
        exposure?.isoDistribution,
        completeIsoDistribution,
        FilterCriteria.iso,
        ISO_RANGE_BOUNDS,
      ),
      focalLength: _rangeData(
        exposure?.focalLengthDistribution,
        completeFocalLengthDistribution,
        FilterCriteria.focalLength,
        FOCAL_LENGTH_RANGE_BOUNDS,
      ),
      aperture: _rangeData(
        exposure?.apertureDistribution,
        completeApertureDistribution,
        FilterCriteria.aperture,
        APERTURE_RANGE_BOUNDS,
      ),
      shutterSpeed: _rangeData(
        exposure?.shutterSpeedDistribution,
        completeShutterSpeedDistribution,
        FilterCriteria.shutterSpeed,
        SHUTTER_SPEED_RANGE_BOUNDS,
      ),
    }),
    [
      exposure?.apertureDistribution,
      exposure?.focalLengthDistribution,
      exposure?.isoDistribution,
      exposure?.shutterSpeedDistribution,
    ],
  );
  const topValues = useMemo(
    () => ({
      iso: _numericData(exposure?.iso, formatIso, FilterCriteria.iso),
      focalLength: _numericData(exposure?.focalLengths, formatFocalLengthBucket, FilterCriteria.focalLength),
      aperture: _numericData(exposure?.apertures, formatApertureBucket, FilterCriteria.aperture),
      shutterSpeed: _numericData(exposure?.shutterSpeeds, formatShutterBucket, FilterCriteria.shutterSpeed),
    }),
    [exposure?.apertures, exposure?.focalLengths, exposure?.iso, exposure?.shutterSpeeds],
  );
  const ratings = useMemo<BarDatum[]>(
    () =>
      (queries.ratings.data ?? []).map(({ rating, count }) => ({
        label: rating === null ? 'Unrated' : rating === 1 ? '1 star' : `${rating} stars`,
        count,
        filters: [
          rating === null
            ? { filterCriteria: FilterCriteria.rated, operator: 'equals' as const, value: false }
            : { filterCriteria: FilterCriteria.rating, operator: 'equals' as const, value: rating },
        ],
      })),
    [queries.ratings.data],
  );
  const ratingsByCount = useMemo(() => [...ratings].sort((a, b) => b.count - a.count), [ratings]);

  const content =
    overview?.totalAssets === 0 ? (
      <EmptyState
        icon={IconChartBar}
        title={hasLibraryFilters ? 'No photos match your filters' : 'Nothing to analyze yet'}
        description={
          hasLibraryFilters
            ? 'Remove a library filter, or clear them all, to see statistics.'
            : 'Charts about your photos, like when you take them and which cameras you use, appear here once you add photos in Albums.'
        }
        action={hasLibraryFilters ? <ClearLibraryFiltersButton /> : undefined}
      />
    ) : (
      <div className="stats-content">
        {overview ? <StatsSummary overview={overview} /> : <div className="stats-summary-skeleton" />}

        <ChartPanel
          title="Shooting activity"
          subtitle="Items captured each month"
          loading={queries.activity.loading && !queries.activity.data}
          error={queries.activity.error}
          empty={activity.length === 0}
          className="stats-panel--wide"
        >
          <ActivityChart data={activity} onSelect={filterActivityMonth} />
        </ChartPanel>

        <ChartPanel
          title="When you shoot"
          subtitle={DATE_PART_SUBTITLES[datePart]}
          loading={datePartQuery.loading && !datePartQuery.data}
          error={datePartQuery.error}
          empty={!datePartData.some(({ count }) => count)}
          actions={
            <Segmented
              ariaLabel="Shooting period"
              className="stats-chart-direction"
              value={datePart}
              onChange={setDatePart}
              options={[
                { value: 'years', label: 'Years' },
                { value: 'months', label: 'Months' },
                { value: 'weekdays', label: 'Weekdays' },
              ]}
            />
          }
        >
          <DistributionBarChart
            data={datePartData}
            onSelect={addChartFilter}
            timeline={datePart === 'years'}
          />
        </ChartPanel>
        <ChartPanel
          title="Top places"
          subtitle={`Most located items by ${placeGroup}`}
          loading={queries.places.loading && !queries.places.data}
          error={queries.places.error}
          empty={!places.length}
          actions={
            <Segmented
              ariaLabel="Top places grouping"
              className="stats-chart-direction"
              value={placeGroup}
              onChange={setPlaceGroup}
              options={[
                { value: 'city', label: 'Cities' },
                { value: 'country', label: 'Countries' },
              ]}
            />
          }
        >
          <RankingBarChart data={places} showCountryFlags={placeGroup === 'country'} />
        </ChartPanel>

        <ChartPanel
          title="Camera bodies"
          subtitle="Most-used camera models"
          loading={queries.gear.loading && !queries.gear.data}
          error={queries.gear.error}
          empty={!gear?.cameras.length}
        >
          <RankingBarChart data={gearData.cameras} onSelect={addChartFilter} />
        </ChartPanel>
        <ChartPanel
          title="Lenses"
          subtitle="Most-used lens models"
          loading={queries.gear.loading && !queries.gear.data}
          error={queries.gear.error}
          empty={!gear?.lenses.length}
        >
          <RankingBarChart data={gearData.lenses} onSelect={addChartFilter} />
        </ChartPanel>

        <OrderedBarPanel
          title="ISO"
          subtitle={`${overview?.isoCount ?? 0} items with ISO data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.iso}
          horizontalData={topValues.iso}
          verticalLabel="ISO ranges"
          onSelect={addChartFilter}
        />
        <ChartPanel
          title="Capture settings"
          subtitle="Most common embedded metadata values"
          loading={queries.captureSettings.loading && !queries.captureSettings.data}
          error={queries.captureSettings.error}
          empty={
            !queries.captureSettings.data ||
            Object.values(queries.captureSettings.data).every((values) => !values.length)
          }
        >
          {queries.captureSettings.data && (
            <CaptureSettingsList
              data={queries.captureSettings.data}
              counts={{
                whiteBalance: overview?.whiteBalanceCount ?? 0,
                flash: overview?.flashCount ?? 0,
                exposureProgram: overview?.exposureProgramCount ?? 0,
                meteringMode: overview?.meteringModeCount ?? 0,
              }}
              onFilter={(filter) => addChartFilter({ label: '', count: 0, filters: [filter] })}
            />
          )}
        </ChartPanel>
        <OrderedBarPanel
          title="Focal length"
          subtitle={`${overview?.focalLengthCount ?? 0} items with focal-length data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.focalLength}
          horizontalData={topValues.focalLength}
          verticalLabel="Focal-length ranges"
          onSelect={addChartFilter}
        />
        <OrderedBarPanel
          title="Aperture"
          subtitle={`${overview?.apertureCount ?? 0} items with aperture data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.aperture}
          horizontalData={topValues.aperture}
          verticalLabel="Aperture ranges"
          onSelect={addChartFilter}
        />
        <OrderedBarPanel
          title="Shutter speed"
          subtitle={`${overview?.shutterSpeedCount ?? 0} items with shutter-speed data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.shutterSpeed}
          horizontalData={topValues.shutterSpeed}
          verticalLabel="Shutter-speed ranges"
          onSelect={addChartFilter}
        />

        <OrderedBarPanel
          title="Ratings"
          subtitle="Unrated and star-rating distribution"
          loading={queries.ratings.loading && !queries.ratings.data}
          error={queries.ratings.error}
          verticalData={ratings}
          horizontalData={ratingsByCount}
          onSelect={addChartFilter}
        />
      </div>
    );

  return (
    <div className="stats-page">
      <SecondaryTitleAndScrollableContent
        icon={<IconChartBar />}
        title="Statistics"
        subtitle={subtitle}
        compactSubtitle={overview ? `${overview.totalAssets.toLocaleString()} items` : undefined}
        content={content}
      />
    </div>
  );
}

function _timespanLabel({ minDate, maxDate }: StatsOverview): string {
  if (!minDate || !maxDate) return 'Your library at a glance';
  const start = new Date(minDate);
  const end = new Date(maxDate);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (months < 1) return 'All shot within a single month';
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'} of photography`;
  return `${Math.round(months / 12)} years of photography`;
}

function _rangeFilters(
  criteria: (typeof NumberRangeFilterCriteria)[number],
  index: number,
  bounds: number[],
): SearchFilter[] {
  if (index === 0) return [{ filterCriteria: criteria, operator: 'smallerThan', value: bounds[0] }];
  if (index === bounds.length)
    return [{ filterCriteria: criteria, operator: 'greaterThan', value: bounds.at(-1)! }];
  return [
    {
      filterCriteria: criteria,
      operator: index === 1 ? 'greaterThanOrEquals' : 'greaterThan',
      value: bounds[index - 1],
    },
    { filterCriteria: criteria, operator: 'smallerThanOrEquals', value: bounds[index] },
  ];
}

function _rangeData(
  rows: { value: number; count: number }[] | undefined,
  complete: (rows: { value: number; count: number }[]) => BarDatum[],
  criteria: (typeof NumberRangeFilterCriteria)[number],
  bounds: number[],
): BarDatum[] {
  return complete(rows ?? []).map((datum, index) => ({
    ...datum,
    filters: _rangeFilters(criteria, index, bounds),
  }));
}

function _numericData(
  rows: { value: number; count: number }[] | undefined,
  formatter: (value: number) => string,
  criteria: (typeof NumberRangeFilterCriteria)[number],
): BarDatum[] {
  return (rows ?? []).map(({ value, count }) => ({
    label: formatter(value),
    count,
    filters: [{ filterCriteria: criteria, operator: 'equals' as const, value }],
  }));
}

function _monthFilters(month: string): SearchFilter[] {
  const [year, monthIndex] = month.split('-').map(Number);
  return [
    {
      filterCriteria: FilterCriteria.date,
      operator: 'greaterThanOrEquals',
      value: new Date(Date.UTC(year, monthIndex - 1, 1)),
    },
    {
      filterCriteria: FilterCriteria.date,
      operator: 'smallerThan',
      value: new Date(Date.UTC(year, monthIndex, 1)),
    },
  ];
}
