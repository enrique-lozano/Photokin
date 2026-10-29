import { AlbumInClient } from '@/db/models/AlbumDTO';

const trimPathSlashes = (value: string): string => value.replace(/^[/\\]+|[/\\]+$/g, '');

/**
 * Expands user-selected album ids to also cover nested sub-albums (descendants
 * sharing the same root with a `relativePath` under the selection). Used by
 * face and duplicate scanners so both agree on what "this album" means.
 */
export function expandAlbumScope(allAlbums: AlbumInClient[], selectedIds: string[]): string[] {
  const albumsById = new Map(allAlbums.map((album) => [album.id, album]));
  const expanded = new Set<string>();

  for (const id of selectedIds) {
    expanded.add(id);
    const album = albumsById.get(id);
    if (!album) continue;

    if (album.isAtTheRootLevel) {
      allAlbums
        .filter((candidate) => candidate.rootAlbumId === album.rootAlbumId)
        .forEach((candidate) => expanded.add(candidate.id));
      continue;
    }

    const base = trimPathSlashes(album.relativePath);
    allAlbums
      .filter(
        (candidate) =>
          candidate.rootAlbumId === album.rootAlbumId &&
          (trimPathSlashes(candidate.relativePath) === base ||
            trimPathSlashes(candidate.relativePath).startsWith(`${base}/`)),
      )
      .forEach((candidate) => expanded.add(candidate.id));
  }

  return [...expanded];
}
