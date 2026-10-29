import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '@/utils/dateFormatter';
import { SettingsLibrary } from './SettingsLibrary';

const mocks = vi.hoisted(() => ({
  query: { data: null as string | null, error: null as Error | null, loading: false },
}));

vi.mock('@/components/footer/useLibrarySync', () => ({
  SYNC_LIBRARY_EVENT: 'sync',
  SYNC_LIBRARY_STATUS_EVENT: 'status',
  SYNC_LIBRARY_STATUS_REQUEST_EVENT: 'status-request',
}));
vi.mock('@/db/api/services/appData.service', () => ({
  AppDataKey: { LastSyncedAt: 'lastSyncedAt' },
  AppDataService: { get: vi.fn() },
}));
vi.mock('@/db/connection/useLiveQuery', () => ({ useLiveQuery: () => mocks.query }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), emitTo: vi.fn(), listen: vi.fn() }));

beforeEach(() => {
  mocks.query = { data: null, error: null, loading: false };
});

describe('library settings sync row', () => {
  it('has one action label and an honest never-synced state', () => {
    const html = renderToStaticMarkup(<SettingsLibrary />);
    expect(html).toContain('Sync library');
    expect(html.match(/Sync now/g)).toHaveLength(1);
    expect(html).toContain('Not synced yet.');
    expect(html).not.toContain('Checks your folders once');
  });

  it('shows the saved timestamp with the local time', () => {
    const date = new Date();
    date.setHours(14, 32, 0, 0);
    mocks.query.data = String(date.getTime());
    const html = renderToStaticMarkup(<SettingsLibrary />);
    expect(html).toContain(`Last synced today at ${formatDate(date, { timeStyle: 'short' })}`);
  });

  it('includes the date for earlier syncs', () => {
    const date = new Date(2025, 0, 3, 14, 32);
    mocks.query.data = String(date.getTime());
    const html = renderToStaticMarkup(<SettingsLibrary />);
    expect(html).toContain(
      `Last synced ${formatDate(date, { dateStyle: 'medium' })} at ${formatDate(date, { timeStyle: 'short' })}`,
    );
  });

  it('distinguishes loading and failed reads from never synced', () => {
    mocks.query.loading = true;
    expect(renderToStaticMarkup(<SettingsLibrary />)).toContain('Loading last sync time');
    mocks.query.error = new Error('Database unavailable');
    const html = renderToStaticMarkup(<SettingsLibrary />);
    expect(html).toContain('Could not load the last sync time.');
    expect(html).not.toContain('Not synced yet.');
  });
});
