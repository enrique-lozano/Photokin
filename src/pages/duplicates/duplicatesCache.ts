import { getDbDir } from '@/db/connection/db.service';
import { join } from '@tauri-apps/api/path';
import { exists, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { DuplicateRelationship, DuplicateSet, KeepRule, MemberDecision } from './duplicateTypes';

/*
  On-disk caching for the Duplicates page. We keep one regenerable result file
  next to the library database:

    - `duplicates-result.json` — the last scan snapshot (sets as lightweight
      asset-id references plus the user's keep/remove decisions and ignored
      sets). Re-hydrated on app start so the page shows instantly instead of
      re-scanning every time. Rewritten on every edit (small).
  Fingerprints live in SQLite. `duplicates-hashes.json` remains below only as a
  legacy cleanup path for libraries created before that migration.
*/

const RESULT_FILE = 'duplicates-result.json';
const HASHES_FILE = 'duplicates-hashes.json';
const RESULT_VERSION = 1;

interface PersistedMember {
  assetId: string;
  pHash: string | null;
  contentHash: string | null;
  matchPercent: number;
}

interface PersistedSet {
  id: string;
  relationship: DuplicateRelationship;
  representativeIndex: number;
  capturedAt: number | null;
  title: string;
  members: PersistedMember[];
}

/** Compact, asset-id-referencing snapshot of the page state. */
export interface DuplicatesSnapshot {
  scannedAt: number | null;
  comparedCount: number;
  totalLibraryBytes: number;
  albumIds: string[];
  includeSubAlbums: boolean;
  similarityThreshold: number;
  keepRule: KeepRule;
  manualEdited: boolean;
  manualOverrideCount: number;
  decisions: Record<string, MemberDecision>;
  ignoredSignatures: string[];
  sets: PersistedSet[];
  ignoredSets: PersistedSet[];
}

interface ResultFile extends DuplicatesSnapshot {
  version: number;
}

// --- Module state -----------------------------------------------------------

let loadPromise: Promise<DuplicatesSnapshot | null> | null = null;

async function _resultPath(): Promise<string> {
  return join(await getDbDir(), RESULT_FILE);
}

async function _hashesPath(): Promise<string> {
  return join(await getDbDir(), HASHES_FILE);
}

// --- Serialization ----------------------------------------------------------

function _toPersistedSet(set: DuplicateSet): PersistedSet {
  return {
    id: set.id,
    relationship: set.relationship,
    representativeIndex: set.representativeIndex,
    capturedAt: set.capturedAt ? set.capturedAt.getTime() : null,
    title: set.title,
    members: set.members.map((member) => ({
      assetId: member.asset.id,
      pHash: member.pHash === null ? null : member.pHash.toString(),
      contentHash: member.contentHash,
      matchPercent: member.matchPercent,
    })),
  };
}

/** Builds the compact, serializable snapshot from live sets + page state. */
export function buildSnapshot(input: {
  scannedAt: number | null;
  comparedCount: number;
  totalLibraryBytes: number;
  albumIds: string[];
  includeSubAlbums: boolean;
  similarityThreshold: number;
  keepRule: KeepRule;
  manualEdited: boolean;
  manualOverrideCount: number;
  decisions: Record<string, MemberDecision>;
  ignoredSignatures: string[];
  sets: DuplicateSet[];
  ignoredSets: DuplicateSet[];
}): DuplicatesSnapshot {
  return {
    scannedAt: input.scannedAt,
    comparedCount: input.comparedCount,
    totalLibraryBytes: input.totalLibraryBytes,
    albumIds: input.albumIds,
    includeSubAlbums: input.includeSubAlbums,
    similarityThreshold: input.similarityThreshold,
    keepRule: input.keepRule,
    manualEdited: input.manualEdited,
    manualOverrideCount: input.manualOverrideCount,
    decisions: input.decisions,
    ignoredSignatures: input.ignoredSignatures,
    sets: input.sets.map(_toPersistedSet),
    ignoredSets: input.ignoredSets.map(_toPersistedSet),
  };
}

/** A persisted set re-paired with its (now freshly fetched) member assets. */
export type { PersistedSet };

// --- Loading ----------------------------------------------------------------

/** Loads the page snapshot once per session (or `null` when uncached). */
export function loadDuplicatesCache(): Promise<DuplicatesSnapshot | null> {
  if (!loadPromise) {
    loadPromise = _loadSnapshot();
  }
  return loadPromise;
}

async function _loadSnapshot(): Promise<DuplicatesSnapshot | null> {
  try {
    const path = await _resultPath();
    if (!(await exists(path))) return null;
    const parsed = JSON.parse(await readTextFile(path)) as ResultFile;
    if (parsed.version !== RESULT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Saving -----------------------------------------------------------------

export async function saveSnapshot(snapshot: DuplicatesSnapshot): Promise<void> {
  const file: ResultFile = { version: RESULT_VERSION, ...snapshot };
  try {
    await writeTextFile(await _resultPath(), JSON.stringify(file));
  } catch {
    // A failed cache write is non-fatal — the page still works in memory.
  }
}

async function _removeIfExists(getPath: () => Promise<string>): Promise<void> {
  try {
    const path = await getPath();
    if (await exists(path)) await remove(path);
  } catch {
    // Ignore — the file may not exist or be momentarily locked.
  }
}

/** Removes the result and legacy hash files when wiping all user data. */
export async function clearDuplicatesCache(): Promise<void> {
  loadPromise = null;
  await Promise.all([_removeIfExists(_resultPath), _removeIfExists(_hashesPath)]);
}
