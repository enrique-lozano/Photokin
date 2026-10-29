import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoResultsIndicator } from '../NoResultsIndicator';
import { ImportStatus, ImportStatusProvider } from './ImportStatus';

const state = vi.hoisted(() => ({
  data: { metadata: 0, locations: 0, scanning: false },
  running: true,
}));

vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/db/api/services/rootAlbums.service', () => ({ RootAlbumsService: {} }));
vi.mock('@/db/connection/useLiveQuery', () => ({ useLiveQuery: vi.fn(() => ({ data: state.data })) }));
vi.mock('@/stores/processStore', () => ({
  ProcessKind: { Import: 'import', Sync: 'sync' },
  useProcessStore: (selector: (store: unknown) => boolean) =>
    selector({ processes: [{ kind: 'import', status: state.running ? 'running' : 'stopped' }] }),
}));

function renderStatus() {
  return renderToStaticMarkup(
    <ImportStatusProvider>
      <ImportStatus />
    </ImportStatusProvider>,
  );
}

describe('ImportStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = { metadata: 0, locations: 0, scanning: false };
    state.running = true;
  });

  it('disappears when photo details and places are complete', () => {
    expect(renderStatus()).toBe('');
  });

  it('marks discovery results as incomplete', () => {
    state.data.scanning = true;
    expect(renderStatus()).toContain('Finding photos. Results and counts are incomplete.');
  });

  it('shows remaining metadata without treating current counts as final', () => {
    state.data.metadata = 12;
    const markup = renderStatus();
    expect(markup).toContain('Reading photo details (12 remaining)');
    expect(markup).toContain('Results and counts are incomplete.');
  });

  it('distinguishes place enrichment from unread metadata', () => {
    state.data.locations = 3;
    const markup = renderStatus();
    expect(markup).toContain('Finding places (3 remaining). Places are incomplete.');
    expect(markup).not.toContain('Results and counts are incomplete.');
  });

  it('keeps unfinished results visible without a running process', () => {
    state.running = false;
    state.data.metadata = 1;
    const markup = renderStatus();
    expect(markup).toContain('Import unfinished. Results and counts are incomplete.');
    expect(markup).not.toContain('animate-spin');
  });

  it('makes opted-in empty results provisional during metadata reading', () => {
    state.data.metadata = 1;
    const markup = renderToStaticMarkup(
      <ImportStatusProvider>
        <NoResultsIndicator title="No tags yet" pendingImport="metadata" />
      </ImportStatusProvider>,
    );
    expect(markup).toContain('No matches yet');
    expect(markup).toContain('Results may appear');
  });

  it('does not imply that a stopped import is still processing', () => {
    state.data.scanning = true;
    state.running = false;
    const markup = renderToStaticMarkup(
      <ImportStatusProvider>
        <NoResultsIndicator title="No tags yet" pendingImport="metadata" />
      </ImportStatusProvider>,
    );
    expect(markup).toContain('Import is unfinished');
    expect(markup).not.toContain('Results may appear');
  });

  it('does not make tag results provisional for place-only work', () => {
    state.data.locations = 1;
    const markup = renderToStaticMarkup(
      <ImportStatusProvider>
        <NoResultsIndicator title="No tags yet" pendingImport="metadata" />
      </ImportStatusProvider>,
    );
    expect(markup).toContain('No tags yet');
    expect(markup).not.toContain('No matches yet');
  });

  it('makes place results provisional for place-only work', () => {
    state.data.locations = 1;
    const markup = renderToStaticMarkup(
      <ImportStatusProvider>
        <NoResultsIndicator title="No photos/videos here" pendingImport="places" />
      </ImportStatusProvider>,
    );
    expect(markup).toContain('No matches yet');
  });

  it('keeps completed and unrelated empty states unchanged', () => {
    const renderEmpty = () =>
      renderToStaticMarkup(
        <ImportStatusProvider>
          <NoResultsIndicator title="Tag not found" />
        </ImportStatusProvider>,
      );
    expect(renderEmpty()).toContain('Tag not found');
    state.data.metadata = 1;
    expect(renderEmpty()).toContain('Tag not found');
  });

  it('shares one pending-work query with nested page frames', () => {
    renderToStaticMarkup(
      <ImportStatusProvider>
        <ImportStatusProvider>
          <ImportStatus />
        </ImportStatusProvider>
      </ImportStatusProvider>,
    );
    expect(useLiveQuery).toHaveBeenCalledTimes(1);
  });
});
