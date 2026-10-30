import { joinPathSync } from '@/system/diskManager';
import { getTrashFilePathSync } from '@/system/trashPaths';
import { AlbumDTO } from './AlbumDTO';
import { AlbumWithRootPath, AssetDTO, AssetWithAlbumFromDB } from './AssetDTO';
import { AssetMetadata } from './AssetMetadata';
import { DbEntityWithID, ModelInit } from './dbEntityWithID.ts';

export class AssetInClient extends DbEntityWithID {
  filename: string;
  filesize: number;
  metadata: AssetMetadata;
  album: AlbumDTO;
  /**
   * Absolute path of the file as it currently lives on disk: the album folder
   * for a live asset, or the app Trash folder while the asset is trashed.
   */
  fullPath: string;
  /**
   * Absolute path the file belongs at inside its album, i.e. where a trashed
   * asset is restored to. Equal to {@link fullPath} for live assets.
   */
  originalPath: string;
  /** When this asset was first added to the library (drives "Recently added"). */
  dateAdded: Date;
  /** When the asset was moved to Trash, or `null` when it is a live asset. */
  trashedAt: Date | null;

  constructor(data: ModelInit<AssetInClient>) {
    super(data.id);

    this.filename = data.filename;
    this.filesize = data.filesize;
    this.metadata = data.metadata;
    this.album = data.album;
    this.fullPath = data.fullPath;
    this.originalPath = data.originalPath;
    this.dateAdded = data.dateAdded;
    this.trashedAt = data.trashedAt;
  }

  /** Whether the asset currently sits in the app-managed Trash. */
  get isTrashed(): boolean {
    return this.trashedAt !== null;
  }

  /**
   * Synchronous on purpose: a gallery refresh hydrates a whole month at once, so
   * an `await join()` per row would cost thousands of sequential IPC calls. Trashed
   * rows need the Trash directory cache warmed (see `_toClientAssets`).
   */
  static fromDB(data: AssetWithAlbumFromDB): AssetInClient {
    if (typeof data.filename !== 'string') {
      throw Error(`No filename found for ${JSON.stringify(data)}`);
    }
    if (!data.album) {
      throw Error(`No album found for ${JSON.stringify(data)}`);
    }

    const album = AssetInClient._parseAlbum(data.album, data.filename);
    const originalPath = joinPathSync(album.rootPath, album.relativePath, data.filename);
    const trashedAt = data.trashedAt ? new Date(data.trashedAt) : null;
    // A trashed file physically lives under the Trash folder, so `fullPath`
    // (used for thumbnails/previews/reveal) points there while it is trashed.
    const fullPath = trashedAt ? getTrashFilePathSync(data.id, data.filename) : originalPath;

    return new AssetInClient({
      id: data.id,
      filename: data.filename,
      filesize: data.filesize,
      metadata: AssetMetadata.fromDB(data),
      album,
      fullPath,
      originalPath,
      dateAdded: new Date(data.dateAdded),
      trashedAt,
    });
  }

  // The filesystem-tracking columns (`fileMtime`, `inode`) are owned by the
  // sync/indexer, not by this client model, so they are not part of its
  // serialized shape.
  toDB(): Omit<AssetDTO, 'fileMtime' | 'inode' | 'trashedAt' | 'metadataStage' | 'pendingFileWrite'> {
    return {
      id: this.id,
      albumId: this.album.id,
      filename: this.filename,
      filesize: this.filesize,
      dateAdded: this.dateAdded.toISOString(),
      ...this.metadata.toDB(),
    };
  }

  private static _parseAlbum(rawAlbum: AlbumWithRootPath | string, filename: string): AlbumWithRootPath {
    const album = typeof rawAlbum === 'string' ? JSON.parse(rawAlbum) : rawAlbum;

    if (
      typeof album !== 'object' ||
      album === null ||
      typeof (album as { rootPath?: unknown }).rootPath !== 'string' ||
      typeof (album as { relativePath?: unknown }).relativePath !== 'string'
    ) {
      throw Error(`Invalid album metadata for ${filename}`);
    }

    return album as AlbumWithRootPath;
  }
}
