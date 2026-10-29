import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import type { ReactNode } from 'react';
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

const TOOLTIP_PROPS = {
  wrapperClassName: 'stats-tooltip',
  contentStyle: {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
    boxShadow: '0 8px 24px hsl(var(--foreground) / 0.16)',
  },
};

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
  return (
    <section className={`stats-panel ${className}`}>
      <header className="stats-panel__header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {actions}
      </header>
      {loading ? (
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
  filters?: SearchFilter[];
}

export function RankingBarChart({
  data,
  onSelect,
}: {
  data: RankingDatum[];
  onSelect?: (datum: RankingDatum) => void;
}) {
  return (
    <div
      className={`stats-ranking-chart${onSelect ? ' stats-chart--interactive' : ''}`}
      style={{ height: Math.max(190, data.length * 32 + 24) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={116} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP_PROPS}
            cursor={{ fill: 'hsl(var(--muted) / 0.55)' }}
            formatter={(value) => [Number(value).toLocaleString(), 'Items']}
          />
          <Bar
            dataKey="count"
            fill="hsl(var(--primary))"
            radius={[0, 4, 4, 0]}
            animationDuration={650}
            onClick={onSelect ? (entry) => onSelect(entry.payload as RankingDatum) : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionBarChart({
  data,
  onSelect,
}: {
  data: RankingDatum[];
  onSelect?: (datum: RankingDatum) => void;
}) {
  return (
    <div className={`stats-distribution-chart${onSelect ? ' stats-chart--interactive' : ''}`}>
      <div className="stats-distribution-chart__canvas">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 64, left: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              interval={0}
              angle={-40}
              textAnchor="end"
              tickLine={false}
              axisLine={false}
            />
            <YAxis width={42} allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip
              {...TOOLTIP_PROPS}
              cursor={{ fill: 'hsl(var(--muted) / 0.55)' }}
              formatter={(value) => [Number(value).toLocaleString(), 'Items']}
            />
            <Bar
              dataKey="count"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
              animationDuration={650}
              onClick={onSelect ? (entry) => onSelect(entry.payload as RankingDatum) : undefined}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ActivityChart({
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
          <YAxis width={42} allowDecimals={false} tickLine={false} axisLine={false} />
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
            animationDuration={650}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
