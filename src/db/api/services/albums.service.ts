import { exists } from '@tauri-apps/plugin-fs';
import { sql } from 'kysely';
import { executeInDB, selectFromDB } from '../../connection/db.service.ts';
import { kyselyDB } from '../../connection/kysely.ts';
import { AlbumDTO, AlbumInClient } from '../../models/AlbumDTO.ts';
import { deleteThumbnailsOfFiles } from '@/media/thumbnails/thumbnail';
import { joinPathSync, normalizedPathSep } from '@/system/diskManager';
import { moveDirectory } from '@/system/fileMove';

type AlbumHierarchyNode = Pick<
  AlbumInClient,
  'id' | 'name' | 'relativePath' | 'rootAlbumId' | 'rootPath' | 'fullPath' | 'isAtTheRootLevel'
>;

export interface AlbumMovePlan {
  sourcePath: string;
  destinationPath: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
  updatedRelativePaths: Map<string, string>;
}

const cleanRelativePath = (value: string) => value.replace(/^[/\\]+|[/\\]+$/g, '').replaceAll('\\', '/');

function _destinationRelativePath(source: AlbumHierarchyNode, target: AlbumHierarchyNode | null): string {
  const targetPath = target && !target.isAtTheRootLevel ? cleanRelativePath(target.relativePath) : '';
  return targetPath ? `${targetPath}${normalizedPathSep}${source.name}` : source.name;
}

/** Returns a user-facing reason when an album folder cannot be moved. */
export function getAlbumMoveError(
  albums: AlbumHierarchyNode[],
  source: AlbumHierarchyNode,
  target: AlbumHierarchyNode | null,
): string | null {
  if (source.isAtTheRootLevel) return 'Library root folders cannot be moved.';
  if (target?.rootAlbumId && target.rootAlbumId !== source.rootAlbumId) {
    return 'Albums can only be moved within the same library folder.';
  }

  const sourceRelative = cleanRelativePath(source.relativePath);
  const targetRelative = target && !target.isAtTheRootLevel ? cleanRelativePath(target.relativePath) : '';
  if (targetRelative === sourceRelative || targetRelative.startsWith(`${sourceRelative}/`)) {
    return 'An album cannot be moved into itself or one of its nested albums.';
  }

  const destinationRelative = _destinationRelativePath(source, target);
  if (destinationRelative === sourceRelative) return 'The album is already in that location.';

  const destinationExists = albums.some(
    (album) =>
      album.rootAlbumId === source.rootAlbumId &&
      (cleanRelativePath(album.relativePath) === destinationRelative ||
        cleanRelativePath(album.relativePath).startsWith(`${destinationRelative}/`)),
  );
  return destinationExists ? `A folder named "${source.name}" already exists in that location.` : null;
}

export function buildAlbumMovePlan(
  albums: AlbumHierarchyNode[],
  source: AlbumHierarchyNode,
  target: AlbumHierarchyNode | null,
): AlbumMovePlan {
  const moveError = getAlbumMoveError(albums, source, target);
  if (moveError) throw new Error(moveError);

  const sourceRelativePath = cleanRelativePath(source.relativePath);
  const nextRelativePath = _destinationRelativePath(source, target);
  const updatedRelativePaths = new Map<string, string>();

  for (const album of albums) {
    const relativePath = cleanRelativePath(album.relativePath);
    if (
      album.rootAlbumId === source.rootAlbumId &&
      (relativePath === sourceRelativePath || relativePath.startsWith(`${sourceRelativePath}/`))
    ) {
      updatedRelativePaths.set(
        album.id,
        `${nextRelativePath}${relativePath.slice(sourceRelativePath.length)}`,
      );
    }
  }

  return {
    sourcePath: source.fullPath,
    destinationPath: joinPathSync(source.rootPath, nextRelativePath),
    sourceRelativePath,
    destinationRelativePath: nextRelativePath,
    updatedRelativePaths,
  };
}

class _AlbumsService {
  constructor() {}

  private readonly getQuery = kyselyDB
    .selectFrom('albums')
    .innerJoin('rootAlbums', 'albums.rootAlbumId', 'rootAlbums.id')
    .select([
      'albums.id',
      'relativePath',
      'lastModified',
      'rootAlbums.path as rootPath',
      'albums.rootAlbumId',
      'albums.isHidden',
    ]);

  async getAll(): Promise<AlbumInClient[]> {
    const result = await selectFromDB(this.getQuery);

    return await Promise.all(result.map((x) => AlbumInClient.fromDB(x, x.rootPath)));
  }

  /** Delete an album and for instance, all the assets in it */
  async delete(id: string) {
    const assetIDsInAlbum = await selectFromDB(
      kyselyDB.selectFrom('assets').select('id').where('albumId', '=', id),
    );

    const result = await executeInDB(kyselyDB.deleteFrom('albums').where('id', '=', id), [
      'albums',
      'assets',
      'fileTags',
    ]);

    await deleteThumbnailsOfFiles(assetIDsInAlbum.map((asset) => asset.id));

    return result;
  }

  insertInDB(album: AlbumDTO) {
    return executeInDB(kyselyDB.insertInto('albums').values(album), 'albums');
  }

  setHidden(album: AlbumInClient, hidden: boolean) {
    return executeInDB(
      kyselyDB
        .insertInto('albums')
        .values({ ...album.toDB(), isHidden: hidden ? 1 : 0 })
        .onConflict((conflict) =>
          conflict.columns(['relativePath', 'rootAlbumId']).doUpdateSet({ isHidden: hidden ? 1 : 0 }),
        ),
      ['albums', 'assets'],
    );
  }

  /** Move a real album directory and update every recorded descendant path. */
  async move(source: AlbumInClient, target: AlbumInClient | null): Promise<void> {
    const albums = await this.getAll();
    const plan = buildAlbumMovePlan(albums, source, target);
    const albumIds = [...plan.updatedRelativePaths.keys()];
    if (albumIds.length === 0) {
      throw new Error('The album no longer exists in the Photokin catalog.');
    }

    if (await exists(plan.destinationPath)) {
      throw new Error(`A folder named "${source.name}" already exists in that location.`);
    }

    await moveDirectory(plan.sourcePath, plan.destinationPath);

    try {
      await executeInDB(
        kyselyDB
          .updateTable('albums')
          .set({
            relativePath: sql<string>`${plan.destinationRelativePath} || substr("relativePath", ${
              plan.sourceRelativePath.length + 1
            })`,
          })
          .where('id', 'in', albumIds),
        ['albums', 'assets'],
      );
    } catch (dbError) {
      try {
        await moveDirectory(plan.destinationPath, plan.sourcePath);
      } catch (rollbackError) {
        throw new Error(
          `The folder moved on disk, but Photokin could not update its catalog or move it back. Sync the library to repair its paths. ${String(
            dbError,
          )} ${String(rollbackError)}`,
        );
      }
      throw dbError;
    }
  }
}

export const AlbumsService = new _AlbumsService();
