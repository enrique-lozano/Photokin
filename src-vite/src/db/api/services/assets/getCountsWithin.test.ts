import { SearchCondition } from '@/common/fileSearchFilters';
import { RatingMode } from '@/common/ratingModeOptions';
import { buildChipCandidates } from '@/components/page-content/contentFilterChips';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getCount, getCountsWithin } from './assetQueries';

// Vite 5 can't resolve the newer `node:sqlite` built-in through `import`.
const { DatabaseSync: Database } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

const { db } = vi.hoisted(() => ({ db: { current: null as DatabaseSync | null } }));

type Compilable = { compile(): { sql: string; parameters: readonly unknown[] } };

/** Runs the compiled Kysely query on the in-memory library (SQLite has no booleans). */
function _run(query: Compilable): Record<string, unknown>[] {
  const { sql, parameters } = query.compile();
  const params = parameters.map((value) => (typeof value === 'boolean' ? Number(value) : value));
  return db.current!.prepare(sql).all(...(params as (string | number | null)[])) as Record<string, unknown>[];
}

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, sep: () => '/', join: async (...parts: string[]) => parts.join('/') };
});

vi.mock('@/db/connection/db.service', () => ({
  selectFromDB: async (query: Compilable) => _run(query),
  selectFirstFromDB: async (query: Compilable) => _run(query)[0],
}));

function _seed(database: DatabaseSync): void {
  const migrations = readdirSync('src/db/migrations').filter((file) => file.endsWith('.sql'));
  migrations.sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of migrations) {
    database.exec(readFileSync(`src/db/migrations/${file}`, 'utf8'));
  }
  database.exec(`
    INSERT INTO rootAlbums (id, path) VALUES ('root', '/photos');
    INSERT INTO albums (id, relativePath, lastModified, rootAlbumId) VALUES ('album', '/', '0', 'root');
    INSERT INTO tags (id, name) VALUES ('ana', 'Ana'), ('bo', 'Bo'), ('trip', 'Trip');
  `);
  const asset = database.prepare(`
    INSERT INTO assets (id, albumId, filename, height, width, orientation, filesize, duration, date,
      dateAdded, fileMtime, inode, rating, locationCity, trashedAt)
    VALUES (?, 'album', ?, 100, 100, 1, 1, ?, '2024-05-01', '2024-05-01', '0', ?, ?, ?, ?)
  `);
  asset.run('solo', 'a.jpg', 0, '1', 5, 'Paris', null);
  asset.run('group', 'b.jpg', 0, '2', null, null, null);
  asset.run('empty', 'c.jpg', 0, '3', 3, 'Paris', null);
  asset.run('clip', 'd.mp4', 12, '4', null, null, null);
  asset.run('trashed', 'e.jpg', 0, '5', 5, null, '2024-06-01');

  const face = database.prepare(`
    INSERT INTO tagRegionInfo (id, tagId, assetId, x, y, h, w, confirmed, faceStatus)
    VALUES (?, ?, ?, 0, 0, 0.2, 0.2, 1, 'confirmed')
  `);
  face.run('f1', 'ana', 'solo');
  face.run('f2', 'ana', 'group');
  face.run('f3', 'bo', 'group');
  database.exec(`INSERT INTO fileTags (tagId, assetId) VALUES ('trip', 'solo')`);
}

const staticChips = [
  ...buildChipCandidates({ years: [], people: [], places: [], ratingMode: RatingMode.Favorites }).toCount,
  ...buildChipCandidates({ years: [], people: [], places: [], ratingMode: RatingMode.Stars }).toCount,
];

describe('getCountsWithin', () => {
  beforeAll(() => {
    db.current = new Database(':memory:');
    _seed(db.current);
  });

  it('matches a separate getCount for every chip condition, alone and combined', async () => {
    const candidates: Record<string, SearchCondition[]> = { scope: [] };
    for (const chip of staticChips) candidates[chip.id] = chip.conditions;
    // With an active chip, candidates are counted on top of its conditions.
    const [first, second] = staticChips;
    candidates.combined = [...first.conditions, ...second.conditions];

    const batched = await getCountsWithin({}, candidates);

    for (const [key, conditions] of Object.entries(candidates)) {
      expect(batched[key], key).toBe(await getCount({ searchQuery: conditions }));
    }
    // Sanity: the fixture really exercises the conditions (4 assets, trash excluded).
    expect(batched.scope).toBe(4);
    expect(batched.videos).toBe(1);
    expect(batched['no-people']).toBe(2);
  });

  it('honours the asset id allow-list and an empty one', async () => {
    const candidates = { videos: staticChips.find((chip) => chip.id === 'videos')!.conditions, all: [] };

    expect(await getCountsWithin({ assetIds: ['clip', 'solo'] }, candidates)).toEqual({ videos: 1, all: 2 });
    expect(await getCountsWithin({ assetIds: [] }, candidates)).toEqual({ videos: 0, all: 0 });
    expect(await getCountsWithin({}, {})).toEqual({});
  });
});
