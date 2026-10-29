CREATE TABLE IF NOT EXISTS appData
( id TEXT NOT NULL PRIMARY KEY
, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rootAlbums
( id TEXT NOT NULL PRIMARY KEY
, path TEXT NOT NULL
-- Set only while the initial native discovery pass still needs to finish.
, importPending BOOLEAN NOT NULL DEFAULT 0
, UNIQUE(path)
);


CREATE TABLE IF NOT EXISTS albums
( id TEXT NOT NULL PRIMARY KEY
, relativePath TEXT NOT NULL
, lastModified TEXT NOT NULL
, rootAlbumId TEXT REFERENCES rootAlbums(id) ON UPDATE CASCADE ON DELETE CASCADE
, isHidden BOOLEAN NOT NULL DEFAULT 0
, UNIQUE(relativePath,rootAlbumId)
);

CREATE TABLE IF NOT EXISTS assets
( id TEXT NOT NULL PRIMARY KEY
, albumId TEXT NOT NULL REFERENCES albums(id) ON UPDATE CASCADE ON DELETE CASCADE
, filename TEXT NOT NULL
, height INTEGER NOT NULL
, width INTEGER NOT NULL
, orientation INTEGER NOT NULL CHECK (orientation IN (1, 2, 3, 4, 5, 6, 7, 8))
, filesize INTEGER NOT NULL
, duration REAL NOT NULL DEFAULT 0
, date TEXT NOT NULL
, make TEXT
, model TEXT
, lens TEXT
, software TEXT
, title TEXT
, description TEXT
, iso INTEGER
, exposure TEXT
, exposureProgram TEXT
, whiteBalance TEXT
, flash TEXT
, focalLength TEXT
, aperture REAL
, shutterSpeed REAL
, meteringMode INTEGER CHECK (meteringMode IN (0, 1, 2, 3, 4, 5, 6, 255))
, rating INTEGER
, latitude REAL
, longitude REAL
, altitude REAL
, locationSublocation TEXT
, locationSource TEXT CHECK (locationSource IN ('manual', 'auto', 'file'))
, locationCity TEXT
, locationState TEXT
, locationCountry TEXT
-- Canonical ISO 3166-1 alpha-2 country code (normalized on read).
, locationCountryCode TEXT
, creator TEXT
, copyright TEXT
, credit TEXT
, source TEXT
, colorSpace TEXT
, bitDepth TEXT
, lastScanned TEXT
-- ISO-8601 timestamp of when this asset was first added to the app.
, dateAdded TEXT NOT NULL
-- ISO-8601 mtime of the file on disk at the last scan (change detection).
, fileMtime TEXT NOT NULL
-- Stable file identity (inode/file index) used for rename detection. Empty
-- string when the platform/filesystem does not expose one.
, inode TEXT NOT NULL
-- ISO-8601 timestamp of when the asset was moved to the app-managed Trash, or
-- NULL when it is a normal, live library asset. Trashed rows keep their id (and
-- cached thumbnail) so they can be listed, restored or purged.
, trashedAt TEXT
-- 0 = discovered, 1 = metadata read/location pending, 2 = complete.
, metadataStage INTEGER NOT NULL DEFAULT 2 CHECK (metadataStage IN (0, 1, 2))
-- Set when an in-app edit still has to be written into the original file, i.e.
-- when write-back is deferred to the next sync. Survives restarts on purpose.
, pendingFileWrite BOOLEAN NOT NULL DEFAULT 0
, UNIQUE(albumId,filename)
);

-- Most gallery queries filter out trashed assets and sort by date.
CREATE INDEX IF NOT EXISTS idx_assets_trashedAt_date
ON assets(trashedAt, date);


CREATE TABLE IF NOT EXISTS tags
( id TEXT NOT NULL PRIMARY KEY
, parentId TEXT REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE
, name TEXT NOT NULL
, color TEXT
, sex TEXT CHECK (sex IN ('female', 'male', 'other'))
, dateBirth TEXT
, dateDead TEXT
, description TEXT
, isFavorite BOOLEAN NOT NULL DEFAULT 0
, isHidden BOOLEAN NOT NULL DEFAULT 0
, profileRegionId TEXT REFERENCES tagRegionInfo(id) ON UPDATE CASCADE ON DELETE SET NULL
, UNIQUE(parentId,name)
);

CREATE INDEX IF NOT EXISTS idx_tags_profileRegion
ON tags(profileRegionId) WHERE profileRegionId IS NOT NULL;

CREATE TABLE IF NOT EXISTS fileTags
( tagId TEXT NOT NULL REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE
, assetId TEXT NOT NULL REFERENCES assets(id) ON UPDATE CASCADE ON DELETE CASCADE
, PRIMARY KEY (tagId, assetId)
);

-- The primary key leads with `tagId`, so per-asset lookups (tag counts,
-- "untagged") need their own index.
CREATE INDEX IF NOT EXISTS idx_fileTags_asset
ON fileTags(assetId);

CREATE TABLE IF NOT EXISTS tagRegionInfo
( id TEXT NOT NULL PRIMARY KEY
, tagId TEXT REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE
, assetId TEXT NOT NULL REFERENCES assets(id) ON UPDATE CASCADE ON DELETE CASCADE
, x REAL NOT NULL
, y REAL NOT NULL
, h REAL NOT NULL
, w REAL NOT NULL
, clusterId TEXT
, confirmed BOOLEAN NOT NULL
, faceStatus TEXT NOT NULL DEFAULT 'pending'
-- Detector confidence (0–1) for faces found by a scan. Null on faces imported
-- from a file or detected before the score was stored.
, detectionScore REAL
, CHECK (faceStatus IN ('pending', 'confirmed', 'unknown', 'rejected'))
, CHECK (confirmed = 0 OR (confirmed = 1 AND tagId IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tag_region
ON tagRegionInfo(assetId, IFNULL(tagId, ''), x, y, w, h);

CREATE INDEX IF NOT EXISTS idx_tagRegion_tag
ON tagRegionInfo(tagId, confirmed, assetId);

-- Reassigning or dismissing a face must not leave another person's portrait behind.
CREATE TRIGGER IF NOT EXISTS clear_invalid_profile_region
AFTER UPDATE OF tagId, confirmed, faceStatus ON tagRegionInfo
WHEN NEW.tagId IS NOT OLD.tagId OR NEW.confirmed <> 1 OR NEW.faceStatus <> 'confirmed'
BEGIN
  UPDATE tags SET profileRegionId = NULL WHERE profileRegionId = NEW.id;
END;

-- One CLIP image embedding per asset for semantic search. `embedding` holds the
-- unit-normalized vector as base64 of its float32 bytes (see `media/embeddings.ts`).
CREATE TABLE IF NOT EXISTS smartSearch
( assetId TEXT NOT NULL PRIMARY KEY REFERENCES assets(id) ON UPDATE CASCADE ON DELETE CASCADE
, embedding TEXT NOT NULL
);

-- One face-recognition embedding per detected region, stored the same way as
-- `smartSearch`. Cascades with its region so a deleted face drops its vector.
CREATE TABLE IF NOT EXISTS faceEmbeddings
( regionId TEXT NOT NULL PRIMARY KEY REFERENCES tagRegionInfo(id) ON UPDATE CASCADE ON DELETE CASCADE
, embedding TEXT NOT NULL
);

-- Regenerable duplicate-finder fingerprints. The source identity makes rows
-- self-invalidating when a library sync observes a changed file.
CREATE TABLE IF NOT EXISTS assetFingerprints
( assetId TEXT NOT NULL PRIMARY KEY REFERENCES assets(id) ON UPDATE CASCADE ON DELETE CASCADE
, sourceSize INTEGER NOT NULL
, sourceMtime TEXT NOT NULL
, perceptualHash TEXT
, contentHash TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_fingerprints_content
ON assetFingerprints(contentHash, sourceSize)
WHERE contentHash IS NOT NULL;
