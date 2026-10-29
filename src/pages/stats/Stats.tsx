import { FilterCriteria, NumberRangeFilterCriteria } from '@/common/query/filters/FilterCriteria';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { addConditionsToQuery } from '@/common/searchQueryUtils';
import {
  APERTURE_RANGE_BOUNDS,
  FOCAL_LENGTH_RANGE_BOUNDS,
  ISO_RANGE_BOUNDS,
  SHUTTER_SPEED_RANGE_BOUNDS,
} from '@/common/statsRanges';
import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { Segmented } from '@/components/segmented/Segmented';
import { SecondaryTitleAndScrollableContent } from '@/pages/search/SecondaryTitleAndScrollableContent';
import { useAppStore } from '@/stores/appState';
import { formatBytes } from '@/utils/numberFormatter';
import { IconChartBar, IconChartBarOff } from '@tabler/icons-react';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { CaptureSettingsList } from './CaptureSettingsList';
import './stats.css';
import { ActivityChart, ChartPanel, DistributionBarChart, RankingBarChart } from './StatsCharts';
import {
  completeApertureDistribution,
  completeFocalLengthDistribution,
  completeIsoDistribution,
  completeShutterSpeedDistribution,
  fillMonthlyStats,
  formatApertureBucket,
  formatFocalLengthBucket,
  formatIso,
  formatShutterBucket,
} from './statsFormatters';
import { StatsSummary } from './StatsSummary';
import { useStatsQueries } from './useStatsQueries';

interface BarDatum {
  label: string;
  count: number;
  filters?: SearchFilter[];
}

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
        <RankingBarChart data={horizontalData} onSelect={onSelect} />
      )}
    </ChartPanel>
  );
}

export function StatsPage() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const queries = useStatsQueries(searchQuery);
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

  const subtitle = overview
    ? `${overview.totalAssets.toLocaleString()} matching items · ${formatBytes(overview.totalSizeBytes)}`
    : 'Analyzing the current library filters';
  const activity = fillMonthlyStats(queries.activity.data ?? []);
  const gear = queries.gear.data;
  const exposure = queries.exposure.data;
  const addChartFilter = ({ filters }: BarDatum) => {
    if (filters?.length) startTransition(() => setSearchQuery(addConditionsToQuery(searchQuery, filters)));
  };
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
  const numericData = (
    rows: { value: number; count: number }[] | undefined,
    formatter: (value: number) => string,
    criteria: (typeof NumberRangeFilterCriteria)[number],
    ordered = false,
  ) =>
    (ordered ? [...(rows ?? [])].sort((a, b) => a.value - b.value) : (rows ?? [])).map(
      ({ value, count }) => ({
        label: formatter(value),
        count,
        filters: [{ filterCriteria: criteria, operator: 'equals' as const, value }],
      }),
    );
  const ratings: BarDatum[] = (queries.ratings.data ?? []).map(({ rating, count }) => ({
    label: rating === null ? 'Unrated' : rating === 1 ? '1 star' : `${rating} stars`,
    count,
    filters: [
      rating === null
        ? { filterCriteria: FilterCriteria.rated, operator: 'equals' as const, value: false }
        : { filterCriteria: FilterCriteria.rating, operator: 'equals' as const, value: rating },
    ],
  }));

  const content =
    overview?.totalAssets === 0 ? (
      <NoResultsIndicator
        title="No items to analyze"
        description="Adjust the library filters or import photos to see statistics."
        icon={<IconChartBarOff size={64} strokeWidth={1} />}
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
          <ActivityChart
            data={activity}
            onSelect={(month) => addChartFilter({ label: month, count: 0, filters: _monthFilters(month) })}
          />
        </ChartPanel>

        <ChartPanel
          title="Camera bodies"
          subtitle="Most-used camera models"
          loading={queries.gear.loading && !queries.gear.data}
          error={queries.gear.error}
          empty={!gear?.cameras.length}
        >
          <RankingBarChart
            data={(gear?.cameras ?? []).map((datum) => ({
              ...datum,
              filters: [{ filterCriteria: FilterCriteria.camera, operator: 'equals', value: datum.label }],
            }))}
            onSelect={addChartFilter}
          />
        </ChartPanel>
        <ChartPanel
          title="Lenses"
          subtitle="Most-used lens models"
          loading={queries.gear.loading && !queries.gear.data}
          error={queries.gear.error}
          empty={!gear?.lenses.length}
        >
          <RankingBarChart
            data={(gear?.lenses ?? []).map((datum) => ({
              ...datum,
              filters: [{ filterCriteria: FilterCriteria.lens, operator: 'equals', value: datum.label }],
            }))}
            onSelect={addChartFilter}
          />
        </ChartPanel>

        <OrderedBarPanel
          title="ISO"
          subtitle={`${overview?.isoCount ?? 0} items with ISO data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.iso}
          horizontalData={numericData(exposure?.iso, formatIso, FilterCriteria.iso)}
          verticalLabel="ISO ranges"
          onSelect={addChartFilter}
        />
        <ChartPanel
          title="Capture settings"
          subtitle="Most common embedded metadata values"
          loading={queries.captureSettings.loading && !queries.captureSettings.data}
          error={queries.captureSettings.error}
          empty={
            !queries.captureSettings.data?.whiteBalances.length &&
            !queries.captureSettings.data?.flashValues.length
          }
        >
          <CaptureSettingsList
            whiteBalances={queries.captureSettings.data?.whiteBalances ?? []}
            flashValues={queries.captureSettings.data?.flashValues ?? []}
            whiteBalanceCount={overview?.whiteBalanceCount ?? 0}
            flashCount={overview?.flashCount ?? 0}
          />
        </ChartPanel>
        <OrderedBarPanel
          title="Focal length"
          subtitle={`${overview?.focalLengthCount ?? 0} items with focal-length data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.focalLength}
          horizontalData={numericData(
            exposure?.focalLengths,
            formatFocalLengthBucket,
            FilterCriteria.focalLength,
          )}
          verticalLabel="Focal-length ranges"
          onSelect={addChartFilter}
        />
        <OrderedBarPanel
          title="Aperture"
          subtitle={`${overview?.apertureCount ?? 0} items with aperture data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.aperture}
          horizontalData={numericData(exposure?.apertures, formatApertureBucket, FilterCriteria.aperture)}
          verticalLabel="Aperture ranges"
          onSelect={addChartFilter}
        />
        <OrderedBarPanel
          title="Shutter speed"
          subtitle={`${overview?.shutterSpeedCount ?? 0} items with shutter-speed data`}
          loading={queries.exposure.loading && !queries.exposure.data}
          error={queries.exposure.error}
          verticalData={rangeData.shutterSpeed}
          horizontalData={numericData(
            exposure?.shutterSpeeds,
            formatShutterBucket,
            FilterCriteria.shutterSpeed,
          )}
          verticalLabel="Shutter-speed ranges"
          onSelect={addChartFilter}
        />

        <OrderedBarPanel
          title="Ratings"
          subtitle="Unrated and star-rating distribution"
          loading={queries.ratings.loading && !queries.ratings.data}
          error={queries.ratings.error}
          verticalData={ratings}
          horizontalData={[...ratings].sort((a, b) => b.count - a.count)}
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
