import { normalizeAllPathSep } from '@/system/diskManager';

type Overlap = 'same' | 'inside' | 'contains';

/** Trailing separators and casing differ between the folder picker and stored paths. */
function _comparablePath(filePath: string): string {
  return normalizeAllPathSep(filePath).replace(/\/+$/, '').toLowerCase();
}

function _folderName(filePath: string): string {
  return normalizeAllPathSep(filePath).split('/').filter(Boolean).at(-1) ?? filePath;
}

/** Compares whole segments, so `2025` and `2025-backup` stay unrelated. */
function _overlapBetween(incoming: string, other: string): Overlap | null {
  const a = _comparablePath(incoming);
  const b = _comparablePath(other);

  if (a === b) return 'same';
  if (a.startsWith(`${b}/`)) return 'inside';
  if (b.startsWith(`${a}/`)) return 'contains';

  return null;
}

function _overlapMessage(incoming: string, other: string, overlap: Overlap, inLibrary: boolean): string {
  const name = _folderName(incoming);
  const otherName = _folderName(other);

  if (!inLibrary) return `"${name}" and "${otherName}" overlap. Select only the outer folder.`;
  if (overlap === 'same') return `"${name}" is already in the library.`;
  if (overlap === 'inside') return `"${name}" is inside "${otherName}", which is already in the library.`;

  return `"${name}" contains "${otherName}", which is already in the library. Remove "${otherName}" first, or pick another folder.`;
}

/**
 * Overlapping roots would index the same files twice, so a folder may not be the
 * same as, inside, or a parent of another root — whether that root is already in
 * the library or just another folder of the same selection.
 *
 * Returns the message to show the user, or `null` when every folder is fine.
 */
export function findRootPathOverlap(directoriesToImport: string[], libraryPaths: string[]): string | null {
  const taken = [...libraryPaths];

  for (const directory of directoriesToImport) {
    for (const [index, other] of taken.entries()) {
      const overlap = _overlapBetween(directory, other);
      if (overlap) return _overlapMessage(directory, other, overlap, index < libraryPaths.length);
    }

    taken.push(directory);
  }

  return null;
}
