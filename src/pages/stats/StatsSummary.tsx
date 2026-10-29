import { StatsOverview } from '@/db/api/services/assets.service';
import { formatBytes } from '@/utils/numberFormatter';
import { percentage } from './statsFormatters';

function dateRange(overview: StatsOverview): string {
  if (!overview.minDate || !overview.maxDate) return 'No capture dates';
  const format = (value: string) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(value),
    );
  const start = format(overview.minDate);
  const end = format(overview.maxDate);
  return start === end ? start : `${start} – ${end}`;
}

export function StatsSummary({ overview }: { overview: StatsOverview }) {
  const metrics = [
    {
      label: 'Items',
      value: overview.totalAssets.toLocaleString(),
      detail: `${overview.photoCount} photos · ${overview.videoCount} videos`,
    },
    { label: 'Storage', value: formatBytes(overview.totalSizeBytes), detail: 'Current filtered selection' },
    { label: 'Captured', value: dateRange(overview), detail: 'Oldest to newest' },
    {
      label: 'Rated',
      value: `${percentage(overview.ratedCount, overview.totalAssets)}%`,
      detail: `${overview.ratedCount.toLocaleString()} with a rating`,
    },
  ];
  const coverage = [
    ['Camera', overview.cameraCount],
    ['Lens', overview.lensCount],
    ['ISO', overview.isoCount],
    ['Focal length', overview.focalLengthCount],
    ['Aperture', overview.apertureCount],
    ['Shutter speed', overview.shutterSpeedCount],
    ['Location', overview.locationCount],
  ] as const;

  return (
    <>
      <section className="stats-summary" aria-label="Library summary">
        {metrics.map((metric) => (
          <div
            className={`stats-metric${metric.label === 'Captured' ? ' stats-metric--captured' : ''}`}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </section>

      <section className="stats-panel stats-coverage">
        <header className="stats-panel__header">
          <h3>Metadata coverage</h3>
          <p>How much of this selection can contribute to each statistic.</p>
        </header>
        <div className="stats-coverage__grid">
          {coverage.map(([label, count]) => {
            const value = percentage(count, overview.totalAssets);
            return (
              <div className="stats-coverage__item" key={label}>
                <span>{label}</span>
                <strong>{value}%</strong>
                <div className="stats-coverage__track" aria-label={`${label}: ${value}%`}>
                  <span style={{ width: `${value}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
