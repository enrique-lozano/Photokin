import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { formatBytes } from '@/utils/numberFormatter';
import clsx from 'clsx';
import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import { recoverableBytes, setSimilarityPercent } from './duplicateSelectors';
import { DuplicateRelationship, DuplicateSet, MemberDecision, RELATIONSHIP_META } from './duplicateTypes';

type Props = {
  set: DuplicateSet;
  active: boolean;
  decisions: Record<string, MemberDecision>;
  onSelect: () => void;
};

export function SetListRow({ set, active, decisions, onSelect }: Props) {
  const meta = RELATIONSHIP_META[set.relationship];
  const representative = set.members[set.representativeIndex] ?? set.members[0];
  const freed = recoverableBytes(set, decisions);

  return (
    <button type="button" className={clsx('dup-set-row', active && 'selected')} onClick={onSelect}>
      <div className="dup-set-row__thumb">
        <AssetThumbnail asset={representative.asset} size={ThumbnailSize.XS} />
        <span className="dup-set-row__count">{set.members.length}</span>
      </div>

      <div className="dup-set-row__body">
        <span className="dup-set-row__title">{set.title}</span>
        <span className="dup-set-row__sub">
          <span className="dup-dot" style={{ background: meta.dotColor }} />
          <span className="dup-set-row__type">
            {meta.label}
            {set.relationship === DuplicateRelationship.Similar && ` ${setSimilarityPercent(set)}%`}
          </span>
          {freed > 0 && <span className="text-success font-semibold">{formatBytes(freed)}</span>}
        </span>
      </div>
    </button>
  );
}
