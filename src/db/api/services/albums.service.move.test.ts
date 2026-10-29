import { describe, expect, it, vi } from 'vitest';
import { AlbumInClient } from '../../models/AlbumDTO';
import { buildAlbumMovePlan, getAlbumMoveError } from './albums.service';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, sep: () => '/', join: async (...parts: string[]) => parts.join('/') };
});

function _album(
  id: string,
  relativePath: string,
  rootAlbumId = 'root-1',
  rootPath = '/photos',
): AlbumInClient {
  return AlbumInClient.fromDB(
    { id, relativePath, rootAlbumId, lastModified: '2024-01-01T00:00:00.000Z' },
    rootPath,
  );
}

const root = _album('root-album', '/');
const travel = _album('travel', 'Travel');
const mexico = _album('mexico', 'Travel/Mexico');
const beach = _album('beach', 'Travel/Mexico/Beach');
const archive = _album('archive', 'Archive');
const albums = [root, travel, mexico, beach, archive];

describe('album hierarchy moves', () => {
  it('rewrites a recorded album and all descendant paths', () => {
    const plan = buildAlbumMovePlan(albums, mexico, archive);

    expect(plan.destinationRelativePath).toBe('Archive/Mexico');
    expect(plan.destinationPath).toBe('/photos/Archive/Mexico');
    expect([...plan.updatedRelativePaths.entries()]).toEqual([
      ['mexico', 'Archive/Mexico'],
      ['beach', 'Archive/Mexico/Beach'],
    ]);
  });

  it('supports a synthetic folder represented only by recorded descendants', () => {
    const syntheticTravel = _album('folder:root-1:Travel', 'Travel');
    const plan = buildAlbumMovePlan([root, mexico, beach, archive], syntheticTravel, archive);

    expect([...plan.updatedRelativePaths.values()]).toEqual([
      'Archive/Travel/Mexico',
      'Archive/Travel/Mexico/Beach',
    ]);
  });

  it('allows a root-area drop within the current library', () => {
    expect(buildAlbumMovePlan(albums, mexico, null).destinationRelativePath).toBe('Mexico');
  });

  it('rejects roots, descendants, cross-root targets, no-ops, and collisions', () => {
    expect(getAlbumMoveError(albums, root, archive)).toContain('root');
    expect(getAlbumMoveError(albums, travel, mexico)).toContain('nested');
    expect(getAlbumMoveError(albums, mexico, travel)).toContain('already');
    expect(getAlbumMoveError(albums, mexico, _album('other', '/', 'root-2', '/other'))).toContain(
      'same library',
    );

    const existingMexico = _album('existing-mexico', 'Archive/Mexico');
    expect(getAlbumMoveError([...albums, existingMexico], mexico, archive)).toContain('already exists');
  });
});
