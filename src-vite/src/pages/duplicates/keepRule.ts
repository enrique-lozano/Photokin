import { DuplicateMember, DuplicateRelationship, DuplicateSet, KeepRule } from './duplicateTypes';

export { KEEP_RULE_OPTIONS } from './duplicateTypes';

/** Short tag shown on the kept tile naming why it was kept. */
export function keepRuleJustification(rule: KeepRule, isBurst: boolean): string | null {
  if (isBurst && rule === 'largest-file') return 'Sharpest';
  switch (rule) {
    case 'largest-file':
      return 'Largest file';
    case 'smallest-file':
      return 'Smallest file';
    case 'highest-resolution':
      return 'Highest resolution';
    case 'newest':
      return 'Newest';
    case 'oldest':
      return 'Oldest';
    case 'manual':
      return null;
  }
}

function _megapixels(member: DuplicateMember): number {
  return member.asset.metadata.width * member.asset.metadata.height;
}

function _captureTime(member: DuplicateMember): number {
  return member.asset.metadata.date?.getTime() ?? member.asset.dateAdded.getTime();
}

/**
 * Picks the asset id to keep for a set under a rule. Bursts default to the
 * sharpest frame (approximated by the largest file at comparable resolution).
 * Returns `null` for the `manual` rule (the caller preserves manual decisions).
 */
export function pickKeptAssetId(set: DuplicateSet, rule: KeepRule): string | null {
  if (rule === 'manual') return null;

  const members = set.members;
  if (members.length === 0) return null;

  const effectiveRule: KeepRule =
    set.relationship === DuplicateRelationship.Burst && rule !== 'oldest' && rule !== 'smallest-file'
      ? // Bursts: regardless of file/resolution/newest preference, keep the
        // sharpest frame (largest file) by default — the user can still keep more.
        'largest-file'
      : rule;

  // Ties go to the earliest capture, independent of the display order.
  const best = [...members].sort(
    (a, b) => _compareForRule(a, b, effectiveRule) || _captureTime(a) - _captureTime(b),
  )[0];
  return best.asset.id;
}

function _compareForRule(a: DuplicateMember, b: DuplicateMember, rule: KeepRule): number {
  switch (rule) {
    case 'largest-file':
      return b.asset.filesize - a.asset.filesize || _megapixels(b) - _megapixels(a);
    case 'smallest-file':
      return a.asset.filesize - b.asset.filesize || _megapixels(b) - _megapixels(a);
    case 'highest-resolution':
      return _megapixels(b) - _megapixels(a) || b.asset.filesize - a.asset.filesize;
    case 'newest':
      return _captureTime(b) - _captureTime(a);
    case 'oldest':
      return _captureTime(a) - _captureTime(b);
    case 'manual':
      return 0;
  }
}
