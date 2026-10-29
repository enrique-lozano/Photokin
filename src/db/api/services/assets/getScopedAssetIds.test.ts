import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import type { SearchQuery } from '@/common/fileSearchFilters';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedAssetIds } from './assetQueries';

const { DatabaseSync: Database } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
const db = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('@/db/connection/db.service', () => ({
  selectFromDB: async (query: { compile(): { sql: string; parameters: readonly unknown[] } }) => {
    const { sql, parameters } = query.compile();
    return db.current!.prepare(sql).all(...(parameters as (string | number | null)[]));
  },
  selectFirstFromDB: vi.fn(),
}));
vi.mock('./assetRows', () => ({
  assetWithAlbumQuery: {},
  toClientAssets: vi.fn(),
}));

describe('filmstrip membership after importing an edited copy', () => {
  beforeEach(() => {
    db.current = new Database(':memory:');
    const directory = 'src\\db\\migrations';
    const migrations = readdirSync(directory)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => parseInt(a) - parseInt(b));
    for (const file of migrations) {
      db.current.exec(readFileSync(`${directory}\\${file}`, 'utf8'));
    }
    db.current.exec(`
      INSERT INTO rootAlbums (id, path) VALUES ('root', 'C:\\photos');
      INSERT INTO albums (id, relativePath, lastModified, rootAlbumId)
        VALUES ('album', '/', '0', 'root');
      INSERT INTO tags (id, name) VALUES ('trip', 'Trip');
      INSERT INTO assets (id, albumId, filename, width, height, orientation, filesize, duration,
        date, dateAdded, fileMtime, inode)
      VALUES ('original', 'album', 'photo.jpg', 100, 80, 1, 1000, 0,
        '2026-01-01', '2026-01-01', '0', 'original');
      INSERT INTO fileTags (tagId, assetId) VALUES ('trip', 'original');
      INSERT INTO tagRegionInfo (id, tagId, assetId, x, y, w, h, confirmed, faceStatus)
        VALUES ('face-original', 'trip', 'original', 0.5, 0.5, 0.2, 0.2, 1, 'confirmed');
    `);
  });

  afterEach(() => {
    db.current?.close();
    db.current = null;
  });

  function importCopy() {
    db.current!.exec(`
      INSERT INTO assets (id, albumId, filename, width, height, orientation, filesize, duration,
        date, dateAdded, fileMtime, inode)
      VALUES ('copy', 'album', 'photo_edited.jpg', 100, 80, 1, 1000, 0,
        '2026-01-01', '2026-02-01', '0', 'copy');
    `);
  }

  it('adds the copy to the library and respects recently-added ordering', async () => {
    expect(await getScopedAssetIds({})).toEqual(['original']);
    importCopy();
    expect(await getScopedAssetIds({ dateField: 'dateAdded' })).toEqual(['copy', 'original']);
  });

  it.each([FilterCriteria.tag, FilterCriteria.person] as const)(
    'only includes a copy in a %s view after its matching association is saved',
    async (filterCriteria) => {
      const searchQuery: SearchQuery = {
        filters: [
          {
            filterCriteria,
            operator: 'contains',
            value: [{ id: 'trip', name: 'Trip', parentId: null, color: null }],
          },
        ],
      };
      importCopy();
      expect(await getScopedAssetIds({ searchQuery })).toEqual(['original']);
      db.current!.exec(
        filterCriteria === FilterCriteria.tag
          ? `INSERT INTO fileTags (tagId, assetId) VALUES ('trip', 'copy')`
          : `INSERT INTO tagRegionInfo (id, tagId, assetId, x, y, w, h, confirmed, faceStatus)
              VALUES ('face-copy', 'trip', 'copy', 0.5, 0.5, 0.2, 0.2, 1, 'confirmed')`,
      );
      expect(await getScopedAssetIds({ searchQuery })).toEqual(['original', 'copy']);
    },
  );

  it('does not add a copy to an explicit fixed list', async () => {
    importCopy();
    expect(await getScopedAssetIds({ assetIds: ['original'], preserveOrder: true })).toEqual(['original']);
  });
});
