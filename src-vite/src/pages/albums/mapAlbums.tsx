import { IconFolderFilled, IconFolderOpen } from '@tabler/icons-react';
import { TreeEntryEl } from '../../components/tree/TreeEntryEl.model';
import { AlbumInClient } from '../../db/models/AlbumDTO';

import { normalizedPathSep } from '@/system/diskManager';
import { AlbumContextMenu } from './albumActions';

/** Prefix of the ids given to folders that have no album row of their own. */
const FOLDER_ENTRY_PREFIX = 'folder:';

/** True for a tree row that exists only to show a directory with no album row. */
export function isFolderEntryId(entryId: string): boolean {
  return entryId.startsWith(FOLDER_ENTRY_PREFIX);
}

/** Tree id of a folder the import never recorded, derived from its path. */
export function folderEntryId(rootAlbumId: string, relativePath: string): string {
  return `${FOLDER_ENTRY_PREFIX}${rootAlbumId}:${relativePath}`;
}

/**
 * Rebuilds the album a folder-only node would have had, or `null` when the id
 * belongs to a real album. The import records a folder only when it holds
 * files, yet the folder exists on disk all the same, so its name, full path and
 * subtree all follow from its path. The id it gets here matches no asset, which
 * is exactly right: the folder owns no photo of its own.
 */
export function albumForFolderEntry(entryId: string, albums: AlbumInClient[]): AlbumInClient | null {
  if (!isFolderEntryId(entryId)) return null;

  const [rootAlbumId, ...pathSegments] = entryId.slice(FOLDER_ENTRY_PREFIX.length).split(':');
  const relativePath = pathSegments.join(':');
  const rootAlbum = albums.find((x) => x.rootAlbumId === rootAlbumId && x.isAtTheRootLevel);
  if (!relativePath || !rootAlbum) return null;

  return _folderAlbum(rootAlbum, relativePath);
}

function _folderAlbum(rootAlbum: AlbumInClient, relativePath: string): AlbumInClient {
  return AlbumInClient.fromDB(
    {
      rootAlbumId: rootAlbum.rootAlbumId,
      relativePath,
      lastModified: rootAlbum.lastModified.toISOString(),
    },
    rootAlbum.rootPath,
  );
}

export function isAlbumHidden(album: AlbumInClient, albums: AlbumInClient[]): boolean {
  if (album.isEffectivelyHidden) return true;
  const path = album.relativePath.replace(/^[/\\]+|[/\\]+$/g, '').replaceAll('\\', '/');
  return albums.some((candidate) => {
    if (candidate.rootAlbumId !== album.rootAlbumId || !candidate.isHidden) return false;
    const ancestor = candidate.relativePath.replace(/^[/\\]+|[/\\]+$/g, '').replaceAll('\\', '/');
    return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`);
  });
}

export function mapAlbumsToTreeItems(
  albums: AlbumInClient[],
  opts?: {
    initiallySelectedIDs?: string[];
    initiallyOpenedIDs?: string[];
  },
): TreeEntryEl[] {
  return albums
    .filter((x) => x.isAtTheRootLevel)
    .map((rootAlbum) => {
      const rootTreeEl: TreeEntryEl = {
        name: rootAlbum.name,
        id: rootAlbum.id,
        children: [],
        open: opts?.initiallyOpenedIDs?.some((x) => x === rootAlbum.id) ?? false,
        selected: opts?.initiallySelectedIDs?.some((x) => x === rootAlbum.id) ?? false,
        startIcon: <IconFolderFilled />,
        openIcon: <IconFolderOpen />,
        hidden: isAlbumHidden(rootAlbum, albums),
        popover: () => <AlbumContextMenu album={rootAlbum} />,
      };

      albums
        .filter((p) => p.rootAlbumId === rootAlbum.rootAlbumId && !p.isAtTheRootLevel)
        .map((album) => ({ album, parts: album.relativePath.split(normalizedPathSep).filter(Boolean) }))
        // Shallowest first, so an album owns its own node before any deeper
        // album walks past it and creates that node under the wrong id.
        .sort((a, b) => a.parts.length - b.parts.length)
        .forEach(({ album, parts }) => {
          let current = rootTreeEl;
          let path = '';

          parts.forEach((part, index) => {
            path = path ? `${path}${normalizedPathSep}${part}` : part;
            const isAlbumItself = index === parts.length - 1;
            // Only the last segment is this album. Giving its id to the folders
            // above it makes selection (which matches on id) land on the
            // topmost one instead of the row the user clicked, so a folder with
            // no album row of its own gets an id derived from its path.
            const id = isAlbumItself ? album.id : folderEntryId(rootAlbum.rootAlbumId, path);
            // Such a folder is still a directory on disk, so it gets the same
            // verbs as any album — they all act on its subtree anyway.
            const nodeAlbum = isAlbumItself ? album : _folderAlbum(rootAlbum, path);

            let node = current.children.find((child) => child.name === part);
            if (!node) {
              node = {
                name: part,
                id,
                children: [],
                open: opts?.initiallyOpenedIDs?.some((x) => x === id) ?? false,
                selected: opts?.initiallySelectedIDs?.some((x) => x === id) ?? false,
                startIcon: <IconFolderFilled />,
                openIcon: <IconFolderOpen />,
                hidden: isAlbumHidden(nodeAlbum, albums),
                popover: () => <AlbumContextMenu album={nodeAlbum} />,
              };

              current.children.push(node);
            }

            current = node;
          });
        });

      return rootTreeEl;
    });
}
