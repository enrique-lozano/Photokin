import { describe, expect, it, vi } from 'vitest';
import { updateSelectedState } from '../../components/tree/TreeEntry.utils';
import { TreeEntryEl } from '../../components/tree/TreeEntryEl.model';
import { AlbumInClient } from '../../db/models/AlbumDTO';
import { albumForFolderEntry, mapAlbumsToTreeItems } from './mapAlbums';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, join: async (...parts: string[]) => parts.join('/'), sep: () => '/' };
});

vi.mock('./albumActions', () => ({ AlbumContextMenu: () => null }));

function album(id: string, relativePath: string): AlbumInClient {
  return AlbumInClient.fromDB(
    { id, relativePath, rootAlbumId: 'root-1', lastModified: '2024-01-01T00:00:00.000Z' },
    '/photos',
  );
}

function findByName(entries: TreeEntryEl[], name: string): TreeEntryEl | undefined {
  for (const entry of entries) {
    if (entry.name === name) return entry;

    const match = findByName(entry.children, name);
    if (match) return match;
  }
}

const root = album('album-root', '/');

describe('mapAlbumsToTreeItems', () => {
  it('gives each album its own node, whatever the order of the input', () => {
    const tree = mapAlbumsToTreeItems([
      root,
      album('album-mx', 'Travel/Mexico'),
      album('album-travel', 'Travel'),
    ]);

    expect(findByName(tree, 'Travel')?.id).toBe('album-travel');
    expect(findByName(tree, 'Mexico')?.id).toBe('album-mx');
  });

  it('selects the clicked album rather than an ancestor', () => {
    const tree = mapAlbumsToTreeItems([
      root,
      album('album-travel', 'Travel'),
      album('album-mx', 'Travel/Mexico'),
    ]);

    const selected = updateSelectedState(tree, 'album-mx', { isRecursive: false });

    expect(findByName(selected, 'Mexico')?.selected).toBe(true);
    expect(findByName(selected, 'Travel')?.selected).toBe(false);
  });

  it('never reuses an album id for a folder that has no album row', () => {
    // `Travel` holds only sub-folders, so the import never recorded it.
    const tree = mapAlbumsToTreeItems([root, album('album-2024', 'Travel/Mexico/2024')]);

    expect(findByName(tree, 'Travel')?.id).not.toBe('album-2024');
    expect(findByName(tree, 'Mexico')?.id).not.toBe('album-2024');
    expect(findByName(tree, '2024')?.id).toBe('album-2024');
  });

  it('rebuilds an album for a folder that has no album row, so it can be opened', () => {
    const albums = [root, album('album-2024', 'Travel/Mexico/2024')];
    const tree = mapAlbumsToTreeItems(albums);

    const rebuilt = albumForFolderEntry(findByName(tree, 'Mexico')!.id, albums);

    expect(rebuilt?.name).toBe('Mexico');
    expect(rebuilt?.relativePath).toBe('Travel/Mexico');
    expect(rebuilt?.rootAlbumId).toBe('root-1');
    // No asset can point at it, which is what keeps its gallery empty until
    // sub-albums are included.
    expect(albums.some((x) => x.id === rebuilt?.id)).toBe(false);
  });

  it('leaves real album ids alone', () => {
    expect(albumForFolderEntry('album-2024', [root])).toBeNull();
  });
});
