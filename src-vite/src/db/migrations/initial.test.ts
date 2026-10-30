import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const { DatabaseSync }: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite');
const initial = readFileSync(new URL('./0001_initial.sql', import.meta.url), 'utf8');

it('does not create person relationships in a fresh library', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(initial);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'personRelationships'").all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  } finally {
    db.close();
  }
});

function _portraitLibrary() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    ${initial}
    INSERT INTO rootAlbums (id, path) VALUES ('root', 'C:\\photos');
    INSERT INTO albums (id, relativePath, lastModified, rootAlbumId)
      VALUES ('album', '/', '2026-01-01', 'root');
    INSERT INTO assets (id, albumId, filename, height, width, orientation, filesize, date, dateAdded, fileMtime, inode)
      VALUES ('photo', 'album', 'photo.jpg', 1000, 1000, 1, 100, '2026-01-01', '2026-01-01', '', '');
    INSERT INTO tags (id, name) VALUES ('person', 'Person'), ('target', 'Target');
    INSERT INTO tagRegionInfo (id, assetId, tagId, x, y, w, h, confirmed, faceStatus)
      VALUES ('face', 'photo', 'person', 0.5, 0.5, 0.2, 0.2, 1, 'confirmed'),
             ('target-face', 'photo', 'target', 0.7, 0.5, 0.2, 0.2, 1, 'confirmed');
    UPDATE tags SET profileRegionId = 'face' WHERE id = 'person';
    UPDATE tags SET profileRegionId = 'target-face' WHERE id = 'target';
  `);
  return db;
}

it.each([
  "DELETE FROM tagRegionInfo WHERE id = 'face'",
  "DELETE FROM assets WHERE id = 'photo'",
  "UPDATE tagRegionInfo SET tagId = 'target' WHERE id = 'face'",
  "UPDATE tagRegionInfo SET confirmed = 0 WHERE id = 'face'",
  "UPDATE tagRegionInfo SET confirmed = 0, faceStatus = 'unknown' WHERE id = 'face'",
  "UPDATE tagRegionInfo SET confirmed = 0, faceStatus = 'rejected' WHERE id = 'face'",
])('clears an invalid portrait: %s', (statement) => {
  const db = _portraitLibrary();
  try {
    db.exec(statement);
    expect(db.prepare("SELECT profileRegionId FROM tags WHERE id = 'person'").get()).toEqual({
      profileRegionId: null,
    });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});

it('keeps the destination portrait when merging people and safely cascades person deletion', () => {
  const db = _portraitLibrary();
  try {
    db.exec(`
      UPDATE tagRegionInfo SET tagId = 'target' WHERE tagId = 'person';
      DELETE FROM tags WHERE id = 'person';
    `);
    expect(db.prepare("SELECT profileRegionId FROM tags WHERE id = 'target'").get()).toEqual({
      profileRegionId: 'target-face',
    });
    expect(db.prepare("SELECT tagId FROM tagRegionInfo WHERE id = 'face'").get()).toEqual({
      tagId: 'target',
    });
    db.exec("DELETE FROM tags WHERE id = 'target'");
    expect(db.prepare('SELECT * FROM tagRegionInfo').all()).toEqual([]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});
