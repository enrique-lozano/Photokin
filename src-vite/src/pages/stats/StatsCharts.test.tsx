import type { PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Area, Bar, BarChart, XAxis, YAxis } from 'recharts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityChart, DistributionBarChart } from './StatsCharts';
import { completeIsoDistribution } from './statsFormatters';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
  BarChart: vi.fn(({ children }: PropsWithChildren) => <div>{children}</div>),
  AreaChart: ({ children }: PropsWithChildren) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  XAxis: vi.fn(() => null),
  YAxis: vi.fn(() => null),
  Tooltip: () => null,
  Bar: vi.fn(() => null),
  Area: vi.fn(() => null),
}));

describe('stats chart layout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fits rotated range labels without horizontal scrolling and keeps all buckets', () => {
    const data = completeIsoDistribution([]);
    const markup = renderToStaticMarkup(<DistributionBarChart data={data} />);
    const axis = vi.mocked(XAxis).mock.calls[0][0];

    expect(axis).toMatchObject({ interval: 'preserveStartEnd', angle: -40, textAnchor: 'end' });
    expect(axis.height).toBeGreaterThan(44);
    expect(markup).not.toContain('min-width');
    expect(vi.mocked(BarChart).mock.calls[0][0].data).toEqual(data);
    expect(vi.mocked(YAxis).mock.calls[0][0].width).toBe('auto');
    expect(vi.mocked(Bar).mock.calls[0][0].isAnimationActive).toBe(false);
  });

  it('spaces year labels without dropping years or their click targets', () => {
    const data = Array.from({ length: 227 }, (_, i) => ({ label: String(1800 + i), count: i }));
    const onSelect = vi.fn();
    const markup = renderToStaticMarkup(<DistributionBarChart data={data} timeline onSelect={onSelect} />);

    expect(vi.mocked(XAxis).mock.calls[0][0]).toMatchObject({
      interval: 'preserveStartEnd',
      minTickGap: 24,
      angle: 0,
      height: 32,
    });
    expect(markup).not.toContain('min-width');
    expect(vi.mocked(BarChart).mock.calls[0][0].data).toEqual(data);
    expect(vi.mocked(Bar).mock.calls[0][0].onClick).toBeTypeOf('function');
  });

  it('does not animate long activity timelines', () => {
    renderToStaticMarkup(<ActivityChart data={[{ month: '2024-01', count: 2 }]} />);
    expect(vi.mocked(Area).mock.calls[0][0].isAnimationActive).toBe(false);
  });
});
