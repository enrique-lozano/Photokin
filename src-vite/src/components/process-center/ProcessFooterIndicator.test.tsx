import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessKind, type AppProcess } from '../../stores/processStore';
import { ProcessFooterIndicator } from './ProcessFooterIndicator';

const state = vi.hoisted(() => ({ processes: [] as AppProcess[] }));

vi.mock('../../stores/processStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/processStore')>()),
  useProcessStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

function process(overrides: Partial<AppProcess> = {}): AppProcess {
  return {
    id: 'indexing',
    kind: ProcessKind.Generic,
    title: 'Indexing for search',
    status: 'success',
    progress: 1,
    progressCurrent: 8,
    progressTotal: 8,
    progressUnit: 'photos',
    paused: false,
    canPause: true,
    canStop: true,
    stopping: false,
    startedAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('background-task footer', () => {
  beforeEach(() => {
    state.processes = [];
  });

  it('uses a compact notification button when there are no tasks', () => {
    const html = renderToStaticMarkup(<ProcessFooterIndicator />);
    expect(html).toContain('aria-label="Background tasks"');
    expect(html).toContain('process-footer-indicator--idle');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('process-footer-indicator-dot');
  });

  it('does not display finished-task labels, counts or bars in the footer', () => {
    state.processes = [process()];
    const html = renderToStaticMarkup(<ProcessFooterIndicator />);
    expect(html).toContain('process-footer-indicator--idle');
    expect(html).not.toContain('Indexing for search');
    expect(html).not.toContain('8 of 8');
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('process-footer-indicator-dot');
    expect(html).toContain('aria-label="Background tasks: 1 recent notifications"');
  });

  it('keeps live progress and the additional-task counter for active work', () => {
    state.processes = [
      process({ status: 'running', progress: 0.5, progressCurrent: 4 }),
      process({ id: 'sync', status: 'running', startedAt: 2 }),
    ];
    const html = renderToStaticMarkup(<ProcessFooterIndicator />);
    expect(html).toContain('Indexing for search');
    expect(html).toContain('4 of 8 photos');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('+1');
    expect(html).toContain('aria-label="Current task: Indexing for search, 4 of 8 photos"');
    expect(html).toContain('process-footer-indicator--idle');
    expect(html).toContain('process-footer-indicator-dot');
  });

  it('indicates recent failures without displaying a long footer message', () => {
    state.processes = [process({ status: 'error' })];
    const html = renderToStaticMarkup(<ProcessFooterIndicator />);
    expect(html).toContain('aria-label="Background tasks: recent failures"');
    expect(html).toContain('process-footer-indicator--error');
    expect(html).not.toContain('Indexing for search');
  });

  it('places active work and the permanent bell in separate footer slots', () => {
    state.processes = [process({ status: 'running' })];
    const html = renderToStaticMarkup(
      <ProcessFooterIndicator
        renderIndicators={(task, notification) => (
          <>
            <div className="footer-left">{task}</div>
            <div className="footer-right">{notification}</div>
          </>
        )}
      />,
    );
    const [left, right] = html.split('class="footer-right"');
    expect(left).toContain('Current task: Indexing for search');
    expect(left).not.toContain('tabler-icon-bell');
    expect(right).toContain('tabler-icon-bell');
    expect(right).not.toContain('role="progressbar"');
    expect(right).not.toContain('Current task:');
  });
});
