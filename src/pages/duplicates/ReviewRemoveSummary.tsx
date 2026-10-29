import { formatBytes } from '@/utils/numberFormatter';
import { decisionOf } from './duplicateSelectors';
import { DuplicateRelationship, DuplicateSet, MemberDecision, RELATIONSHIP_META } from './duplicateTypes';

type ReviewRemoveSummaryProps = {
  sets: DuplicateSet[];
  decisions: Record<string, MemberDecision>;
};

/**
 * Breakdown shown inside the "Review & remove" confirmation: how many
 * photos each relationship type contributes, and the total space freed. Pass
 * only the sets the action covers.
 */
export function ReviewRemoveSummary({ sets, decisions }: ReviewRemoveSummaryProps) {
  const perType: Record<DuplicateRelationship, number> = {
    [DuplicateRelationship.Exact]: 0,
    [DuplicateRelationship.Similar]: 0,
    [DuplicateRelationship.Burst]: 0,
  };
  let freesBytes = 0;

  for (const set of sets) {
    for (const member of set.members) {
      if (decisionOf(decisions, member.asset.id) !== 'remove') continue;
      perType[set.relationship]++;
      freesBytes += member.asset.filesize;
    }
  }

  return (
    <ul className="dup-review-summary">
      {Object.values(DuplicateRelationship).map((type) => (
        <li key={type} className="dup-review-summary__row">
          <span className="dup-dot" style={{ background: RELATIONSHIP_META[type].dotColor }} />
          <span className="dup-review-summary__label">{RELATIONSHIP_META[type].label}</span>
          <span className="font-semibold text-foreground">{perType[type].toLocaleString()}</span>
        </li>
      ))}
      <li className="dup-review-summary__row dup-review-summary__row--total">
        <span className="dup-review-summary__label">Space freed</span>
        <span className="font-semibold text-success">{formatBytes(freesBytes)}</span>
      </li>
    </ul>
  );
}
