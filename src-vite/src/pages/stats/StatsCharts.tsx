import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import { CountryFlag } from '@/components/location/CountryFlag';
import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMonth, MonthlyStat } from './statsFormatters';

/** Approximate width of one 12px axis-label character, for labels Recharts can't size itself. */
const CHAR_WIDTH = 7;
const LABEL_ANGLE = (Math.PI * 40) / 180;

const TOOLTIP_PROPS = {
  wrapperClassName: 'stats-tooltip',
  contentStyle: {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
    boxShadow: '0 8px 24px hsl(var(--foreground) / 0.16)',
  },
};

/**
 * Becomes (and stays) true once the element is within a screen of the visible
 * area, so off-screen charts don't all lay out and render on page entry.
 */
function useNearViewport(ref: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      // The page scrolls inside its own container, which clips before the viewport margin applies.
      { root: element.closest('.page-scroll'), rootMargin: '100% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, ref]);

  return near;
}

interface ChartPanelProps {
  title: string;
  subtitle: string;
  loading: boolean;
  error: Error | null;
  empty: boolean;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function ChartPanel({
  title,
  subtitle,
  loading,
  error,
  empty,
  children,
  className = '',
  actions,
}: ChartPanelProps) {
  const ref = useRef<HTMLElement>(null);
  const visible = useNearViewport(ref);

  return (
    <section ref={ref} className={`stats-panel ${className}`}>
      <header className="stats-panel__header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {actions}
      </header>
      {loading || !visible ? (
        <div className="stats-chart-skeleton" aria-label={`Loading ${title}`} />
      ) : error ? (
        <p className="stats-panel__empty">Could not load this statistic.</p>
      ) : empty ? (
        <p className="stats-panel__empty">No metadata in this selection.</p>
      ) : (
        children
      )}
    </section>
  );
}

export interface RankingDatum {
  label: string;
  count: number;
  countryCode?: string;
  filters?: SearchFilter[];
}

export const RankingBarChart = memo(function RankingBarChart({
  data,
  onSelect,
  showCountryFlags = false,
}: {
  data: RankingDatum[];
  onSelect?: (datum: RankingDatum) => void;
  showCountryFlags?: boolean;
}) {
  return (
    <div
      className={`stats-ranking-chart${onSelect ? ' stats-chart--interactive' : ''}`}
      style={{ height: Math.max(260, data.length * 32 + 24) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            // Recharts can't measure custom ticks, so size the flag + name column ourselves.
            width={
              showCountryFlags
                ? Math.max(0, ...data.map(({ label }) => label.length * CHAR_WIDTH)) + 36
                : 'auto'
            }
            tickLine={false}
            axisLine={false}
            tick={
              showCountryFlags
                ? ({ x, y, payload }) => {
                    const label = String(payload.value ?? '');
                    const countryCode = data.find((datum) => datum.label === label)?.countryCode;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        {countryCode && (
                          <CountryFlag
                            code={countryCode}
                            className="stats-ranking-chart__country-flag"
                            width={20}
                            height={14}
                            x={-25}
                            y={-7}
                          />
                        )}
                        <text x={-31} y={4} textAnchor="end">
                          {label}
                        </text>
                      </g>
                    );
                  }
                : undefined
            }
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            cursor={{ fill: 'hsl(var(--muted) / 0.55)' }}
            formatter={(value) => [Number(value).toLocaleString(), 'Items']}
          />
          <Bar
            dataKey="count"
            fill="hsl(var(--primary))"
            radius={[0, 4, 4, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            onClick={onSelect ? (entry) => onSelect(entry.payload as RankingDatum) : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export const DistributionBarChart = memo(function DistributionBarChart({
  data,
  onSelect,
  timeline = false,
}: {
  data: RankingDatum[];
  onSelect?: (datum: RankingDatum) => void;
  timeline?: boolean;
}) {
  // Rotated labels hang below and to the left of their bar: reserve room for the
  // longest one underneath and for the first one's overhang past the y-axis.
  const labelWidth = (label = '') => label.length * CHAR_WIDTH;
  const longestLabel = Math.max(0, ...data.map(({ label }) => labelWidth(label)));
  const axisHeight = timeline ? 32 : Math.ceil(longestLabel * Math.sin(LABEL_ANGLE)) + 16;
  const leftMargin = timeline
    ? 0
    : Math.max(0, Math.ceil(labelWidth(data[0]?.label) * Math.cos(LABEL_ANGLE)) - 36);

  return (
    <div
      className={`stats-distribution-chart${onSelect ? ' stats-chart--interactive' : ''}`}
      style={{ height: 220 + axisHeight }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: leftMargin }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={timeline ? 24 : 2}
            angle={timeline ? 0 : -40}
            textAnchor={timeline ? 'middle' : 'end'}
            height={axisHeight}
            tickLine={false}
            axisLine={false}
          />
          <YAxis width="auto" allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP_PROPS}
            cursor={{ fill: 'hsl(var(--muted) / 0.55)' }}
            formatter={(value) => [Number(value).toLocaleString(), 'Items']}
          />
          <Bar
            dataKey="count"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={onSelect ? (entry) => onSelect(entry.payload as RankingDatum) : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export const ActivityChart = memo(function ActivityChart({
  data,
  onSelect,
}: {
  data: MonthlyStat[];
  onSelect?: (month: string) => void;
}) {
  return (
    <div className={`stats-activity-chart${onSelect ? ' stats-chart--interactive' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
          onClick={(state) => state?.activeLabel && onSelect?.(String(state.activeLabel))}
        >
          <defs>
            <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            minTickGap={44}
            tickLine={false}
            axisLine={false}
          />
          <YAxis width="auto" allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP_PROPS}
            labelFormatter={(label) => formatMonth(String(label))}
            formatter={(value) => [Number(value).toLocaleString(), 'Items']}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#activity-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
