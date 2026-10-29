import { AssetInClient } from '@/db/models/AssetInClient';

/** Relationship that binds a set together. */
export enum DuplicateRelationship {
  /**
   * Every member is the *same* byte-identical file (shared content hash).
   * These photos are kept out of Similar/Burst sets so each photo belongs to a
   * single set, which lets the UI treat exact sets as 100% matches.
   */
  Exact = 'exact',
  /**
   * Grouped by perceptual similarity. Members may differ in quality/resolution
   * and are shown with their own match %. Byte-identical copies are never
   * listed here; they live in their own {@link DuplicateRelationship.Exact} set.
   */
  Similar = 'similar',
  /** A run of close-in-time, same-camera, visually-alike frames. */
  Burst = 'burst',
}

/** Selectable keep rules, with their UI labels. Single source of truth. */
export const KEEP_RULE_OPTIONS = [
  { value: 'largest-file', label: 'Largest file' },
  { value: 'smallest-file', label: 'Smallest file' },
  { value: 'highest-resolution', label: 'Highest resolution' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'manual', label: 'Manual' },
] as const;

/**
 * How the auto-selection picks which member of each set to keep.
 * Derived from {@link KEEP_RULE_OPTIONS} so the type and the option list
 * (values + labels) can never drift apart.
 */
export type KeepRule = (typeof KEEP_RULE_OPTIONS)[number]['value'];

/** Per-member keep/remove decision held in memory for the session. */
export type MemberDecision = 'keep' | 'remove';

export interface DuplicateMember {
  asset: AssetInClient;
  /**
   * 64-bit perceptual hash of the photo (as a bigint), or null for assets we
   * could not perceptually hash (e.g. videos or decode failures).
   */
  pHash: bigint | null;
  /** Content hash (sha-256 hex) for byte-identical detection, when computed. */
  contentHash: string | null;
  /**
   * Similarity to the set's representative member, 0..100. `100` means exact /
   * identical. Used for the "Similar 92%" labels.
   */
  matchPercent: number;
}

export interface DuplicateSet {
  id: string;
  relationship: DuplicateRelationship;
  members: DuplicateMember[];
  /** Index (into `members`) of the member proposed as the representative. */
  representativeIndex: number;
  /** Capture time of the representative, used for the title/meta line. */
  capturedAt: Date | null;
  /** A human title for the set (filename of the representative, or burst label). */
  title: string;
}

/** A scope + parameters captured at scan time. */
export interface DuplicateScanOptions {
  /** Album ids to restrict the scan to. Empty = the whole library. */
  albumIds: string[];
  includeSubAlbums: boolean;
  /**
   * Max perceptual-hash Hamming distance (0..64) for two photos to be grouped
   * as *similar*. Lower = stricter. Exact duplicates ignore this entirely.
   */
  similarityThreshold: number;
}

export interface DuplicateScanResult {
  sets: DuplicateSet[];
  comparedCount: number;
  scannedAt: number;
  warnings: string[];
}

export const DEFAULT_SIMILARITY_THRESHOLD = 10;
// 19 maps to ~70% (rounded) and avoids extremely loose, noisy grouping.
export const MAX_SIMILARITY_THRESHOLD = 19;

/** Visual identity for each relationship dot/badge, reusing app semantic tokens. */
export const RELATIONSHIP_META: Record<DuplicateRelationship, { label: string; dotColor: string }> = {
  // Use semantic text/status tokens so contrast remains readable in dark mode.
  [DuplicateRelationship.Exact]: { label: 'Exact', dotColor: 'hsl(var(--destructive-text))' },
  [DuplicateRelationship.Similar]: { label: 'Similar', dotColor: 'hsl(var(--warning))' },
  [DuplicateRelationship.Burst]: { label: 'Burst', dotColor: 'hsl(var(--primary))' },
};
