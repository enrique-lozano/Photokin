import { exiftoolPath } from 'exiftool-vendored';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { writeKeywordsForAssets } from './assets/tagFileWrites';
import { TagsService } from './tags.service';

type TestQuery = { compile(): { sql: string; parameters: readonly SQLInputValue[] } };

const state = vi.hoisted(() => ({
  select: vi.fn<(query: TestQuery) => Promise<unknown[]>>(),
  execute: vi.fn<(query: TestQuery) => Promise<void>>(),
  files: new Map<string, string>(),
  directory: '',
  executable: '',
}));

vi.mock('@/db/connection/db.service', () => ({
  selectFromDB: state.select,
  selectFirstFromDB: async (query: TestQuery) => (await state.select(query))[0],
  executeInDB: state.execute,
  safelyExecuteBatchInsert: vi.fn(),
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: { getState: () => ({ markAssetChanged: vi.fn() }) },
}));
vi.mock('@/system/diskManager', () => ({
  joinPathSync: (...parts: string[]) => path.join(...parts),
}));
vi.mock('./regions.service', () => ({ RegionsService: {} }));
vi.mock('./assets/assetQueries', () => ({
  getByUUID: async (id: string) => {
    const fullPath = state.files.get(id);
    if (!fullPath) throw new Error(`No test file for asset "${id}"`);
    return { fullPath };
  },
}));
vi.mock('./assets/assetRows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assets/assetRows')>()),
  refreshFileTracking: vi.fn(),
}));
vi.mock('@/media/metadata/exiftool/write/metadataWritePolicy', () => ({
  isMetadataWriteEnabled: () => true,
  shouldWriteBackOnSync: () => false,
  shouldPreserveFileModifyTime: () => false,
}));

// Replace native process transport, not the keyword builders, batching, or file writes.
vi.mock('@/media/metadata/exiftool/write/exiftool-run', () => ({
  executeExiftoolWithArgs: async (args: string[], onStderr?: (line: string) => void) => {
    const result = await _runExiftool(args);
    for (const line of result.stderr.split(/\r?\n/).filter(Boolean)) onStderr?.(line);
    return { ...result, code: 0, signal: null };
  },
}));
vi.mock('@/media/metadata/exiftool/exiftoolSession', () => ({
  runExiftoolSession: async (args: string[]) => (await _runExiftool(args)).stdout,
}));

const execute = promisify(execFile);
const sqlite: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite');
const fixture = fileURLToPath(new URL('../../../../demo/exif-samples/jpg/Canon_40D.jpg', import.meta.url));
const keywordTags = [
  'XMP-dc:Subject',
  'IPTC:Keywords',
  'EXIF:XPKeywords',
  'XMP-lr:HierarchicalSubject',
  'XMP-microsoft:LastKeywordXMP',
  'XMP-mediapro:CatalogSets',
  'XMP-digiKam:TagsList',
  'XMP-acdsee:Categories',
];
let db: DatabaseSync;

async function _runExiftool(args: string[]) {
  const argfile = path.join(state.directory, `args-${crypto.randomUUID()}.txt`);
  writeFileSync(argfile, `${args.join('\n')}\n`, 'utf8');
  try {
    return await execute(state.executable, ['-charset', 'filename=UTF8', '-@', argfile], {
      maxBuffer: 4 * 1024 * 1024,
    });
  } finally {
    rmSync(argfile);
  }
}

async function _readKeywords(fullPath: string): Promise<Record<string, unknown>> {
  const { stdout } = await _runExiftool(['-json', '-G1', ...keywordTags.map((tag) => `-${tag}`), fullPath]);
  const [tags] = JSON.parse(stdout) as Record<string, unknown>[];
  delete tags.SourceFile;
  return tags;
}

const fingerprint = (fullPath: string) => createHash('sha256').update(readFileSync(fullPath)).digest('hex');

beforeAll(async () => {
  state.executable = await exiftoolPath();
});

beforeEach(() => {
  state.files.clear();
  state.select.mockReset();
  state.execute.mockReset();
  state.directory = mkdtempSync(path.join(tmpdir(), 'photokin-tag-rename-'));
  db = new sqlite.DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE tags (
      id TEXT PRIMARY KEY, parentId TEXT, name TEXT, color TEXT, sex TEXT,
      dateBirth TEXT, dateDead TEXT, description TEXT,
      isFavorite INTEGER DEFAULT 0, isHidden INTEGER DEFAULT 0, profileRegionId TEXT
    );
    CREATE TABLE assets (id TEXT PRIMARY KEY, metadataStage INTEGER DEFAULT 2);
    CREATE TABLE fileTags (tagId TEXT, assetId TEXT, PRIMARY KEY (tagId, assetId));
    CREATE TABLE tagRegionInfo (assetId TEXT, tagId TEXT, confirmed INTEGER);
    INSERT INTO tags (id, parentId, name) VALUES
      ('places', NULL, 'Places'),
      ('holiday', 'places', 'Holiday'),
      ('spain', 'holiday', 'Spain'),
      ('personal', NULL, 'Personal'),
      ('family', NULL, 'Family'),
      ('other', NULL, 'Other'),
      ('other-holiday', 'other', 'Holiday');
  `);
  state.select.mockImplementation(async (query) => {
    const { sql, parameters } = query.compile();
    return db.prepare(sql).all(...parameters);
  });
  state.execute.mockImplementation(async (query) => {
    const { sql, parameters } = query.compile();
    db.prepare(sql).run(...parameters);
  });
});

afterEach(() => {
  db.close();
  rmSync(state.directory, { recursive: true, force: true });
});

it('renames a shared tag in every affected file without losing other tags or changing unrelated files', async () => {
  const photos = [
    { id: 'first', tagIds: ['holiday', 'personal'], leaves: ['Holiday', 'Personal'] },
    { id: 'second', tagIds: ['holiday', 'family'], leaves: ['Family', 'Holiday'] },
    { id: 'descendant', tagIds: ['spain', 'personal'], leaves: ['Personal', 'Spain'] },
    { id: 'unrelated', tagIds: ['other-holiday', 'family'], leaves: ['Family', 'Holiday'] },
  ];
  const before = new Map<string, Record<string, unknown>>();
  const beforeHashes = new Map<string, string>();
  for (const photo of photos) {
    const fullPath = path.join(state.directory, `${photo.id} photo.jpg`);
    copyFileSync(fixture, fullPath);
    state.files.set(photo.id, fullPath);
    db.prepare('INSERT INTO assets (id) VALUES (?)').run(photo.id);
    for (const tagId of photo.tagIds) {
      db.prepare('INSERT INTO fileTags VALUES (?, ?)').run(tagId, photo.id);
    }
  }

  expect(await writeKeywordsForAssets(photos.map((photo) => photo.id))).toEqual(new Map());
  for (const photo of photos) {
    const fullPath = state.files.get(photo.id)!;
    const keywords = await _readKeywords(fullPath);
    expect(Object.keys(keywords)).toHaveLength(keywordTags.length);
    for (const key of ['XMP-dc:Subject', 'IPTC:Keywords']) {
      expect(keywords[key]).toEqual(expect.arrayContaining(photo.leaves));
      expect(keywords[key]).toHaveLength(photo.leaves.length);
    }
    if (photo.id !== 'unrelated') {
      expect(keywords['XMP-lr:HierarchicalSubject']).toContain(
        photo.id === 'descendant' ? 'Places|Holiday|Spain' : 'Places|Holiday',
      );
    }
    before.set(photo.id, keywords);
    beforeHashes.set(photo.id, fingerprint(fullPath));
  }

  const progress = vi.fn();
  const result = await TagsService.update('holiday', { name: 'Vacation' }, progress);

  expect(result).toEqual({ fileCount: 3, warnings: [], fileFailures: [] });
  expect(progress).toHaveBeenLastCalledWith(3, 3);
  expect((await TagsService.getByUUID('holiday')).fullPath).toBe('Places/Vacation');
  expect((await TagsService.getByUUID('spain')).fullPath).toBe('Places/Vacation/Spain');
  for (const photo of photos) {
    const fullPath = state.files.get(photo.id)!;
    const after = await _readKeywords(fullPath);
    if (photo.id === 'unrelated') {
      expect(after).toEqual(before.get(photo.id));
      expect(fingerprint(fullPath)).toBe(beforeHashes.get(photo.id));
    } else {
      expect(after).toEqual(
        JSON.parse(JSON.stringify(before.get(photo.id)).replaceAll('Holiday', 'Vacation')),
      );
      expect(JSON.stringify(after)).not.toContain('Holiday');
    }
    expect(db.prepare('SELECT tagId FROM fileTags WHERE assetId = ? ORDER BY tagId').all(photo.id)).toEqual(
      photo.tagIds.toSorted().map((tagId) => ({ tagId })),
    );
  }
}, 60_000);
