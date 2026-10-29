import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineScrubber, type ScrubberSection } from './TimelineScrubber';

const mocks = vi.hoisted(() => ({ stateIndex: 0, scrollable: true }));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++;
    return [index === 0 ? 600 : index === 2 ? mocks.scrollable : initial, vi.fn()];
  },
}));

const month: ScrubberSection = {
  sectionId: '2003-08',
  year: 2003,
  month: 8,
  estimatedHeight: 1000,
};

beforeEach(() => {
  mocks.stateIndex = 0;
  mocks.scrollable = true;
});

describe('timeline scrubber availability', () => {
  it('provides a scrollbar when a single month overflows the viewport', () => {
    const markup = renderToStaticMarkup(<TimelineScrubber sections={[month]} />);
    expect(markup).toContain('role="scrollbar"');
    expect(markup).toContain('timeline-scrubber__indicator');
  });

  it('also provides a scrollbar for multiple months', () => {
    const markup = renderToStaticMarkup(
      <TimelineScrubber sections={[month, { ...month, sectionId: '2003-07', month: 7 }]} />,
    );
    expect(markup).toContain('role="scrollbar"');
  });

  it('does not add a scrollbar when the gallery fits the viewport', () => {
    mocks.scrollable = false;
    expect(renderToStaticMarkup(<TimelineScrubber sections={[month]} />)).toBe('');
  });

  it('does not add a scrollbar to an empty gallery', () => {
    expect(renderToStaticMarkup(<TimelineScrubber sections={[]} />)).toBe('');
  });
});
