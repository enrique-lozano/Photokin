import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { createRequire } from 'node:module';
import { win32 } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { RegionsService } from './regions.service';
import { TagsService } from './tags.service';

type TestQuery = { compile(): { sql: string; parameters: readonly SQLInputValue[] } };

const state = vi.hoisted(() => ({
  showHidden: false,
  select: vi.fn<(query: TestQuery) => Promise<unknown[]>>(),
  execute: vi.fn<(query: TestQuery) => Promise<{ rowsAffected: number }>>(),
}));

vi.mock('@/db/connection/db.service', () => ({
  selectFromDB: state.select,
  selectFirstFromDB: async (query: TestQuery) => (await state.select(query))[0],
  executeInDB: state.execute,
  safelyExecuteBatchInsert: vi.fn(),
}));
vi.mock('@/system/diskManager', () => ({ joinPathSync: (...parts: string[]) => win32.join(...parts) }));
vi.mock('@/stores/appState', () => ({ useAppStore: { getState: () => ({}) } }));
vi.mock('@/stores/hiddenItemsStore', () => ({
  useHiddenItemsStore: { getState: () => ({ showHiddenItems: state.showHidden }) },
}));
vi.mock('./assets/assetMetadataGuard', () => ({
  assertAssetsMetadataScanned: vi.fn(),
  assertRegionAssetsMetadataScanned: vi.fn(),
}));
vi.mock('./assets/regionFileWrites', () => ({ writeRegionsForAssets: vi.fn() }));
vi.mock('./assets/tagFileWrites', () => ({
  writeKeywordsForAssets: vi.fn(),
  describeFileWriteFailures: vi.fn(),
}));

let db: DatabaseSync;
const sqlite: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite');

function _asset(id: string, albumId = 'visible', filename = `${id}.jpg`, date = '2026-01-01') {
  db.prepare(
    'INSERT INTO assets (id, albumId, filename, width, height, duration, date) VALUES (?, ?, ?, 2000, 1000, 0, ?)',
  ).run(id, albumId, filename, date);
}

function _face(
  id: string,
  assetId: string,
  options: {
    tagId?: string | null;
    clusterId?: string;
    confirmed?: number;
    status?: FaceStatus;
    w?: number;
  } = {},
) {
  db.prepare('INSERT INTO tagRegionInfo VALUES (?, ?, ?, ?, 0.5, 0.5, ?, 0.2, ?, ?)').run(
    id,
    assetId,
    options.tagId === undefined ? 'person' : options.tagId,
    options.clusterId ?? null,
    options.w ?? 0.2,
    options.confirmed ?? 1,
    options.status ?? FaceStatus.Confirmed,
  );
}

function _plans() {
  return state.select.mock.calls.flatMap(([query]) => {
    const { sql, parameters } = query.compile();
    return db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...parameters)
      .map((row) => String(row.detail));
  });
}

beforeEach(() => {
  state.showHidden = false;
  state.select.mockReset();
  state.execute.mockReset();
  db = new sqlite.DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE rootAlbums (id TEXT PRIMARY KEY, path TEXT);
    CREATE TABLE albums (id TEXT PRIMARY KEY, relativePath TEXT, rootAlbumId TEXT, isHidden INTEGER DEFAULT 0);
    CREATE TABLE assets (id TEXT PRIMARY KEY, albumId TEXT, filename TEXT, width INTEGER, height INTEGER, duration REAL, date TEXT, trashedAt TEXT);
    CREATE TABLE tags (id TEXT PRIMARY KEY, parentId TEXT, name TEXT, color TEXT, sex TEXT, dateBirth TEXT, dateDead TEXT, description TEXT, isFavorite INTEGER DEFAULT 0, isHidden INTEGER DEFAULT 0, profileRegionId TEXT);
    CREATE TABLE fileTags (tagId TEXT, assetId TEXT, PRIMARY KEY (tagId, assetId));
    CREATE TABLE tagRegionInfo (id TEXT PRIMARY KEY, assetId TEXT, tagId TEXT, clusterId TEXT, x REAL, y REAL, w REAL, h REAL, confirmed INTEGER, faceStatus TEXT);
    CREATE INDEX idx_tagRegion_tag ON tagRegionInfo(tagId, confirmed, assetId);
    INSERT INTO rootAlbums VALUES ('root', 'C:\\photos'), ('other', 'C:\\other'), ('dot-root', 'C:\\.private\\photos');
    INSERT INTO albums (id, relativePath, rootAlbumId) VALUES ('visible', '/visible', 'root');
    INSERT INTO tags (id, name) VALUES ('person', 'Person'), ('keyword', 'Keyword');
  `);
  state.select.mockImplementation(async (query) => {
    const { sql, parameters } = query.compile();
    return db.prepare(sql).all(...parameters);
  });
  state.execute.mockImplementation(async (query) => {
    const { sql, parameters } = query.compile();
    return { rowsAffected: Number(db.prepare(sql).run(...parameters).changes) };
  });
});

afterEach(() => db.close());

describe('People catalog queries', () => {
  it('persists a chosen portrait across People and Tags, and resets to automatic selection', async () => {
    _asset('large');
    _asset('chosen');
    _face('large-face', 'large', { w: 0.8 });
    _face('chosen-face', 'chosen');

    await TagsService.setProfileRegion('person', 'chosen-face');
    expect((await TagsService.getByUUID('person')).profileRegionId).toBe('chosen-face');
    expect((await RegionsService.getRegionTags())[0].representativeRegion?.id).toBe('chosen-face');
    expect((await RegionsService.getRepresentativeRegionsByTag(['person'])).get('person')?.id).toBe(
      'chosen-face',
    );
    expect((await TagsService.getTagCovers()).person.assetId).toBe('chosen');

    await TagsService.setProfileRegion('person', null);
    expect((await TagsService.getByUUID('person')).profileRegionId).toBeNull();
    expect((await RegionsService.getRegionTags())[0].representativeRegion?.id).toBe('large-face');
    expect((await TagsService.getTagCovers()).person.assetId).toBe('large');
  });

  it('rejects nonexistent, suggested, rejected, trashed and other-person portraits without changing the preference', async () => {
    _asset('photo');
    _asset('trashed');
    _asset('video', 'visible', 'clip.MP4');
    db.exec("UPDATE assets SET trashedAt = '2026-01-01' WHERE id = 'trashed'");
    _face('confirmed', 'photo');
    _face('suggested', 'photo', { confirmed: 0, status: FaceStatus.Pending, w: 0.3 });
    _face('rejected', 'photo', { status: FaceStatus.Rejected, w: 0.4 });
    _face('other-person', 'photo', { tagId: 'keyword', w: 0.5 });
    _face('trashed-face', 'trashed');
    _face('orphan-face', 'missing');
    _face('video-face', 'video');
    await TagsService.setProfileRegion('person', 'confirmed');

    for (const id of [
      'missing',
      'suggested',
      'rejected',
      'other-person',
      'trashed-face',
      'orphan-face',
      'video-face',
    ]) {
      await expect(TagsService.setProfileRegion('person', id)).rejects.toThrow('confirmed face');
      expect((await TagsService.getByUUID('person')).profileRegionId).toBe('confirmed');
    }
    await expect(TagsService.setProfileRegion('missing-person', null)).rejects.toThrow('No tag found');
  });

  it('falls back when a stored portrait is no longer eligible', async () => {
    _asset('fallback');
    _asset('chosen');
    _face('fallback-face', 'fallback');
    _face('chosen-face', 'chosen', { w: 0.8 });
    await TagsService.setProfileRegion('person', 'chosen-face');

    db.exec("UPDATE assets SET trashedAt = '2026-01-01' WHERE id = 'chosen'");
    expect((await RegionsService.getRegionTags())[0].representativeRegion?.id).toBe('fallback-face');
    expect((await TagsService.getTagCovers()).person.assetId).toBe('fallback');

    db.exec("UPDATE assets SET trashedAt = NULL WHERE id = 'chosen'");
    expect((await RegionsService.getRegionTags())[0].representativeRegion?.id).toBe('chosen-face');

    db.exec("UPDATE tagRegionInfo SET tagId = 'keyword' WHERE id = 'chosen-face'");
    expect((await RegionsService.getRepresentativeRegions()).get('person')?.id).toBe('fallback-face');
    db.exec("UPDATE tags SET profileRegionId = 'missing' WHERE id = 'person'");
    expect((await RegionsService.getRepresentativeRegions()).get('person')?.id).toBe('fallback-face');
  });

  it('keeps counts, unknown groups, photo filtering and representative ranking', async () => {
    for (const id of ['confirmed', 'suggested', 'unknown', 'unsorted', 'ignored', 'rejected', 'video'])
      _asset(id);
    db.prepare('UPDATE assets SET filename = ? WHERE id = ?').run('clip.MP4', 'video');
    _face('confirmed-face', 'confirmed');
    _face('suggested-face', 'suggested', { confirmed: 0, status: FaceStatus.Pending, w: 0.8 });
    _face('missing-face', 'missing', { w: 1 });
    _face('unknown-face', 'unknown', {
      tagId: null,
      clusterId: 'cluster',
      confirmed: 0,
      status: FaceStatus.Pending,
    });
    _face('unsorted-face', 'unsorted', { tagId: null, confirmed: 0, status: FaceStatus.Pending });
    _face('ignored-face', 'ignored', { tagId: null, confirmed: 0, status: FaceStatus.Unknown });
    _face('rejected-face', 'rejected', { tagId: null, confirmed: 0, status: FaceStatus.Rejected });
    _face('video-face', 'video');

    const people = await RegionsService.getRegionTags();

    expect(
      people.map(({ kind, totalResults, unconfirmedResults }) => ({
        kind,
        totalResults,
        unconfirmedResults,
      })),
    ).toEqual([
      { kind: 'known', totalResults: 3, unconfirmedResults: 1 },
      { kind: 'unknown', totalResults: 1, unconfirmedResults: 1 },
      { kind: 'unsorted', totalResults: 1, unconfirmedResults: 1 },
    ]);
    expect(people[0].representativeRegion?.id).toBe('confirmed-face');
    expect(people[0].representativeRegion?.path).toBe('C:\\photos\\visible\\confirmed.jpg');
  });

  it.each([false, true])('preserves album visibility when showHiddenItems is %s', async (showHidden) => {
    state.showHidden = showHidden;
    db.exec(`
      INSERT INTO albums (id, relativePath, rootAlbumId, isHidden) VALUES
        ('hidden', '/hidden', 'root', 1),
        ('child', '/hidden/child', 'root', 0),
        ('sibling', '/hidden-sibling', 'root', 0),
        ('other-root', '/hidden/child', 'other', 0),
        ('dot', '/.dot', 'root', 0),
        ('nested-dot', '/normal/.dot/child', 'root', 0),
        ('root-dot', '/normal', 'dot-root', 0),
        ('missing-root', '/normal', 'missing', 0);
    `);
    for (const id of [
      'visible',
      'hidden',
      'child',
      'sibling',
      'other-root',
      'dot',
      'nested-dot',
      'root-dot',
      'missing-root',
      'missing-album',
    ]) {
      _asset(id, id);
      _face(`${id}-face`, id);
    }
    _face('missing-asset-face', 'missing-asset');

    const [person] = await RegionsService.getRegionTags();

    expect(person.totalResults).toBe(showHidden ? 11 : 5);
    const regions = await RegionsService.getPersonRegions({ personId: 'person', kind: 'known' });
    expect(regions).toHaveLength(showHidden ? 11 : 5);
    if (!showHidden) {
      expect(regions.map((region) => region.assetId).sort()).toEqual([
        'missing-album',
        'missing-asset',
        'other-root',
        'sibling',
        'visible',
      ]);
    }
  });

  it('honors a hidden root album without hiding a different root', async () => {
    db.exec(`
      INSERT INTO albums (id, relativePath, rootAlbumId, isHidden) VALUES
        ('hidden-root', '/', 'root', 1),
        ('other-album', '/visible', 'other', 0);
    `);
    _asset('hidden-photo');
    _asset('other-photo', 'other-album');
    _face('hidden-face', 'hidden-photo');
    _face('other-face', 'other-photo');

    const [person] = await RegionsService.getRegionTags();

    expect(person.totalResults).toBe(1);
    expect(person.representativeRegion?.assetId).toBe('other-photo');
  });

  it('builds album visibility as an uncorrelated list instead of checking each face', async () => {
    _asset('photo');
    _face('face', 'photo');

    await RegionsService.getRegionTags();

    expect(_plans().filter((detail) => detail.startsWith('LIST SUBQUERY'))).toHaveLength(2);
  });
});

describe('Tag aggregate queries', () => {
  it('counts distinct photos across keywords and multiple confirmed faces without a second DISTINCT', async () => {
    _asset('first');
    _asset('second');
    _asset('suggested');
    db.exec("INSERT INTO fileTags VALUES ('person', 'first'), ('keyword', 'first')");
    _face('one', 'first');
    _face('two', 'first', { w: 0.3 });
    _face('three', 'second');
    _face('suggestion', 'suggested', { confirmed: 0, status: FaceStatus.Pending });

    expect(await TagsService.getDirectAssetCounts()).toEqual({ keyword: 1, person: 2 });
    expect(_plans().some((detail) => detail.includes('count(DISTINCT)'))).toBe(false);
  });

  it('selects the latest valid keyword cover and lets a confirmed face override it', async () => {
    db.exec("INSERT INTO albums VALUES ('orphan-album', '/orphan', 'missing-root', 0)");
    _asset('older', 'visible', 'older.jpg', '2025-01-01');
    _asset('newer', 'visible', 'newer.jpg', '2026-01-01');
    _asset('orphan', 'orphan-album', 'orphan.jpg', '2027-01-01');
    _asset('missing-album', 'missing', 'missing.jpg', '2028-01-01');
    db.exec(`
      INSERT INTO fileTags VALUES
        ('keyword', 'older'), ('keyword', 'newer'), ('keyword', 'orphan'), ('keyword', 'missing-album'),
        ('person', 'newer');
    `);
    _face('confirmed', 'older');
    _face('suggestion', 'newer', { confirmed: 0, status: FaceStatus.Pending, w: 0.8 });
    _face('missing', 'absent', { w: 1 });

    const covers = await TagsService.getTagCovers();

    expect(covers.keyword).toEqual({ assetId: 'newer', path: 'C:\\photos\\visible\\newer.jpg' });
    expect(covers.person).toEqual({
      assetId: 'older',
      path: 'C:\\photos\\visible\\older.jpg',
      region: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
    });
    expect(state.select.mock.calls[1][0].compile().parameters).toEqual(['person']);
  });

  it('loads keyword covers normally when there are no face covers', async () => {
    _asset('photo');
    db.exec("INSERT INTO fileTags VALUES ('keyword', 'photo')");

    expect(await TagsService.getTagCovers()).toEqual({
      keyword: { assetId: 'photo', path: 'C:\\photos\\visible\\photo.jpg' },
    });
    expect(state.select.mock.calls[1][0].compile().sql).not.toContain('not in');
  });

  it('keeps a keyword cover when its tag only has orphaned face regions', async () => {
    _asset('photo');
    db.exec("INSERT INTO fileTags VALUES ('person', 'photo')");
    _face('orphan-face', 'missing');

    expect(await TagsService.getTagCovers()).toEqual({
      person: { assetId: 'photo', path: 'C:\\photos\\visible\\photo.jpg' },
    });
  });
});
