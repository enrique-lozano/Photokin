import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { MetadataStage } from '../models/AssetDTO';
import { LocationSource } from '../models/AssetLocation';
import { PersonSex } from '../models/TagDTO';
import { FaceStatus } from '../models/TagRegionInfoDTO';
import { AssetMeteringMode } from '../../media/metadata/fields/meteringMode';
import { AssetOrientation } from '../../media/metadata/fields/orientation';

const { DatabaseSync }: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite');
type TestDb = InstanceType<typeof DatabaseSync>;
const initial = readFileSync(new URL('./0001_initial.sql', import.meta.url), 'utf8');

const enumColumns = [
  {
    table: 'assets',
    column: 'locationSource',
    values: Object.values(LocationSource),
    invalid: ['', 'library', 'unknown'],
    nullable: true,
  },
  {
    table: 'tags',
    column: 'sex',
    values: Object.values(PersonSex),
    invalid: ['', 'unknown', 'Female'],
    nullable: true,
  },
  {
    table: 'assets',
    column: 'orientation',
    values: Object.values(AssetOrientation).filter((value) => typeof value === 'number'),
    invalid: [0, 9, 1.5],
    nullable: false,
  },
  {
    table: 'assets',
    column: 'meteringMode',
    values: Object.values(AssetMeteringMode).filter((value) => typeof value === 'number'),
    invalid: [-1, 7, 256, 2.5],
    nullable: true,
  },
  {
    table: 'assets',
    column: 'metadataStage',
    values: Object.values(MetadataStage).filter((value) => typeof value === 'number'),
    invalid: [-1, 3, 1.5],
    nullable: false,
  },
  {
    table: 'tagRegionInfo',
    column: 'faceStatus',
    values: Object.values(FaceStatus),
    invalid: ['', 'approved', 'Pending'],
    nullable: false,
  },
];

function _seed(db: TestDb) {
  db.exec(`
    INSERT INTO appData VALUES ('dbVersion', '2'), ('preference', 'unchanged');
    INSERT INTO rootAlbums (id, path, importPending) VALUES ('root', 'library', 1);
    INSERT INTO albums (id, relativePath, lastModified, rootAlbumId, isHidden)
      VALUES ('album', '', '2026-01-01', 'root', 1);
    INSERT INTO assets (
      id, albumId, filename, height, width, orientation, filesize, date,
      dateAdded, fileMtime, inode, meteringMode, metadataStage, trashedAt, pendingFileWrite
    ) VALUES ('photo', 'album', 'test.jpg', 100, 200, 6, 1000, '2026-01-01',
      '2026-01-02', '2026-01-01', '', 255, 1, '2026-01-03', 1);
    INSERT INTO tags (id, parentId, name, sex, dateBirth, isFavorite, isHidden)
      VALUES ('child', 'parent', 'Child', 'other', '1990', 1, 1),
             ('parent', NULL, 'Parent', NULL, NULL, 0, 0);
    INSERT INTO fileTags VALUES ('child', 'photo');
    INSERT INTO tagRegionInfo (
      id, tagId, assetId, x, y, h, w, clusterId, confirmed, faceStatus, detectionScore
    ) VALUES ('face', 'child', 'photo', 0.1, 0.1, 0.2, 0.2, 'cluster', 1, 'confirmed', 0.9);
    INSERT INTO faceEmbeddings VALUES ('face', 'face-vector');
    INSERT INTO smartSearch VALUES ('photo', 'image-vector');
    INSERT INTO assetFingerprints VALUES ('photo', 1000, '2026-01-01', 'perceptual', 'content');
  `);
  db.prepare('UPDATE tags SET description = ?').run('long biography '.repeat(100));
  db.prepare('UPDATE rootAlbums SET path = ?').run('long-directory\\'.repeat(100));
}

describe('stored enum constraints', () => {
  it.each(enumColumns)('matches the enum for $table.$column on inserts and updates', (field) => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`PRAGMA foreign_keys = ON; ${initial}`);
      _seed(db);

      const update = db.prepare(`UPDATE ${field.table} SET ${field.column} = ?`);
      for (const value of field.values) {
        expect(() => update.run(value)).not.toThrow();
      }
      const insert = db.prepare(
        `INSERT INTO ${field.table} SELECT ${db
          .prepare(`PRAGMA table_info(${field.table})`)
          .all()
          .map(({ name }) => {
            if (name === 'id') return "'invalid-row'";
            if (name === field.column) return '?';
            return `"${name}"`;
          })
          .join(', ')} FROM ${field.table} LIMIT 1`,
      );
      for (const value of field.invalid) {
        expect(() => update.run(value)).toThrow(/CHECK constraint failed/);
        expect(() => insert.run(value)).toThrow(/CHECK constraint failed/);
      }
      if (field.nullable) {
        expect(() => update.run(null)).not.toThrow();
      } else {
        expect(() => update.run(null)).toThrow(/NOT NULL constraint failed/);
      }
    } finally {
      db.close();
    }
  });
});

describe('SQLite schema', () => {
  it('uses TEXT without limiting string length, and preserves foreign-key cascades', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`PRAGMA foreign_keys = ON; ${initial}`);
      _seed(db);

      expect(initial).not.toMatch(/VARCHAR/i);
      expect(db.prepare('SELECT path FROM rootAlbums').get()).toEqual({
        path: 'long-directory\\'.repeat(100),
      });
      expect(db.prepare("SELECT description FROM tags WHERE id = 'child'").get()).toEqual({
        description: 'long biography '.repeat(100),
      });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });

      db.exec("DELETE FROM rootAlbums WHERE id = 'root'");
      for (const table of [
        'albums',
        'assets',
        'fileTags',
        'tagRegionInfo',
        'faceEmbeddings',
        'smartSearch',
        'assetFingerprints',
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
      db.exec("DELETE FROM tags WHERE id = 'parent'");
      expect(db.prepare('SELECT count(*) AS count FROM tags').get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
