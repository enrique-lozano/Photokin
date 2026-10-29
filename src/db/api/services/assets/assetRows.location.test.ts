import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LOCATION } from '@/media/metadata/location/locationDraft';
import { markLocationSavedToFile } from './assetRows';

type Query = { compile(): { sql: string; parameters: readonly SQLInputValue[] } };
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock('@/db/connection/db.service', () => ({
  executeInDB: async (query: Query) => {
    const { sql, parameters } = query.compile();
    state.db!.prepare(sql).run(...parameters);
  },
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: { getState: () => ({ markAssetChanged: vi.fn() }) },
}));
vi.mock('@/system/diskManager', () => ({ tauriFileStat: vi.fn() }));
vi.mock('@/system/trashPaths', () => ({ getTrashDir: vi.fn() }));
vi.mock('../tags.service', () => ({ TagsService: {} }));
const sqlite: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite');

beforeEach(() => {
  state.db = new sqlite.DatabaseSync(':memory:');
  state.db.exec(`
    CREATE TABLE assets (
      id TEXT, locationCity TEXT, locationState TEXT, locationCountry TEXT,
      locationSublocation TEXT, locationCountryCode TEXT, locationSource TEXT
    );
    INSERT INTO assets (id, locationCity, locationSource) VALUES ('photo', 'Madrid', 'auto');
  `);
});
afterEach(() => state.db!.close());

describe('completed location write snapshots', () => {
  it('persists file source for the matching database place', async () => {
    await markLocationSavedToFile('photo', { ...EMPTY_LOCATION, city: 'Madrid' });
    expect(state.db!.prepare('SELECT locationSource FROM assets').get()).toEqual({ locationSource: 'file' });
  });

  it('does not mark a newer edit as saved by an older write', async () => {
    state.db!.exec("UPDATE assets SET locationCity = 'Barcelona', locationSource = 'manual'");
    await markLocationSavedToFile('photo', { ...EMPTY_LOCATION, city: 'Madrid' });
    expect(state.db!.prepare('SELECT locationSource FROM assets').get()).toEqual({
      locationSource: 'manual',
    });
  });

  it('leaves empty place text without a source after clearing it in the file', async () => {
    state.db!.exec('UPDATE assets SET locationCity = NULL');
    await markLocationSavedToFile('photo', EMPTY_LOCATION);
    expect(state.db!.prepare('SELECT locationSource FROM assets').get()).toEqual({ locationSource: null });
  });
});
