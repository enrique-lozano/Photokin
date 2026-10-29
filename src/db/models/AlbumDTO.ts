import { openPath } from '@tauri-apps/plugin-opener';
import { currentOsPathSep, normalizeAllPathSep, normalizedPathSep } from '@/system/diskManager';
import { DbEntityWithID, ModelInit, WithOptionalID } from './dbEntityWithID.ts';

export interface AlbumDTO {
  id: string;

  /** The relative path of this album parting of its root */
  relativePath: string;

  /** Last modified date in ISO format */
  lastModified: string;

  rootAlbumId: string;
  /** Explicit visibility override; dot-prefixed path segments are also hidden. */
  isHidden?: 0 | 1;
}

type AlbumInClientInit = Omit<ModelInit<AlbumInClient>, 'id'> & { id?: string };

export class AlbumInClient extends DbEntityWithID {
  relativePath: string;
  lastModified: Date;
  rootAlbumId: string;
  isHidden: boolean;

  rootPath: string;

  /** The full path of this album, created by the join of its root path and its
   * relative path */
  fullPath: string;

  /** The name of this album, equal to the last segment of its path */
  name: string;

  constructor(data: AlbumInClientInit) {
    super(data.id);

    this.relativePath = data.relativePath;
    this.rootPath = data.rootPath;
    this.lastModified = data.lastModified;
    this.rootAlbumId = data.rootAlbumId;
    this.isHidden = data.isHidden;

    this.fullPath = data.fullPath;
    this.name = data.name;
  }

  static fromDB(dbObj: WithOptionalID<AlbumDTO>, rootPath: string): AlbumInClient {
    // Build `fullPath` with the OS-native separator so it stays interchangeable
    // with paths produced by Tauri's `join()` (used by `open()`, `readDir`, the
    // shell, etc.).
    const cleanRootPath = rootPath.replace(/[/\\]+$/g, '');
    const cleanRelativePath = dbObj.relativePath
      .replace(/^[/\\]+/g, '')
      .replaceAll(/[/\\]/g, currentOsPathSep);
    const fullPath = cleanRelativePath
      ? `${cleanRootPath}${currentOsPathSep}${cleanRelativePath}`
      : cleanRootPath;
    const name = fullPath.split(/[/\\]/).filter(Boolean).at(-1) ?? '';

    return new AlbumInClient({
      id: dbObj.id ?? undefined,
      rootAlbumId: dbObj.rootAlbumId,
      isHidden: dbObj.isHidden === 1,
      relativePath: dbObj.relativePath,
      lastModified: new Date(dbObj.lastModified),
      rootPath: cleanRootPath,
      name,
      fullPath,
    });
  }

  toDB(): AlbumDTO {
    return {
      id: this.id,
      lastModified: this.lastModified.toISOString(),
      relativePath: normalizeAllPathSep(this.relativePath),
      rootAlbumId: this.rootAlbumId,
      isHidden: this.isHidden ? 1 : 0,
    };
  }

  /** Opens this album's folder in the default OS file explorer */
  open() {
    void openPath(this.fullPath);
  }

  get isAtTheRootLevel() {
    return this.relativePath === normalizedPathSep;
  }

  get isEffectivelyHidden() {
    return this.isHidden || this.fullPath.split(/[/\\]/).some((segment) => segment.startsWith('.'));
  }
}
