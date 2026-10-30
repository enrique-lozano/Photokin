import { formatBytes } from '@/utils/numberFormatter';
import { IconArrowsMaximize, IconCheck, IconTarget, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import { DuplicateMember, MemberDecision } from './duplicateTypes';

type Props = {
  member: DuplicateMember;
  decision: MemberDecision;
  /** Show the "Reference" marker: the photo every other match % is measured against. */
  isRepresentative: boolean;
  showMatch: boolean;
  keepTag: string | null;
  onToggle: () => void;
  onOpenViewer: () => void;
};

export function SetMemberTile({
  member,
  decision,
  isRepresentative,
  showMatch,
  keepTag,
  onToggle,
  onOpenViewer,
}: Props) {
  const { asset } = member;
  const isKeep = decision === 'keep';

  return (
    <div className={clsx('dup-tile', isKeep ? 'dup-tile--keep' : 'dup-tile--remove')}>
      <button
        type="button"
        className="dup-tile__hit"
        onClick={onToggle}
        onDoubleClick={onOpenViewer}
        aria-label={isKeep ? 'Marked to keep — click to remove' : 'Marked to remove — click to keep'}
      >
        <AssetThumbnail asset={asset} className="dup-tile__thumb" />
      </button>

      <span className={clsx('dup-tile__chip', isKeep ? 'dup-tile__chip--keep' : 'dup-tile__chip--remove')}>
        {isKeep ? <IconCheck size={13} /> : <IconTrash size={13} />}
        {isKeep ? 'Keep' : 'Remove'}
      </span>

      <div className="dup-tile__hover-actions">
        <button
          type="button"
          className="dup-tile__action"
          title="Open full screen"
          aria-label="Open full screen"
          onClick={onOpenViewer}
        >
          <IconArrowsMaximize size={15} />
        </button>
      </div>

      <div className="dup-tile__caption">
        <span className="dup-tile__meta">
          {asset.metadata.width} × {asset.metadata.height} · {formatBytes(asset.filesize)}
        </span>
        <span className="dup-tile__tags">
          {keepTag && isKeep && <span className="dup-tile__keep-tag">{keepTag}</span>}
          {isRepresentative && (
            <span
              className="dup-tile__reference"
              title="Reference photo: the other photos' match % is measured against this one (the highest resolution). It isn't necessarily the one you keep."
            >
              <IconTarget size={12} aria-hidden />
              <span className="dup-tile__reference-label">Reference</span>
            </span>
          )}
          {showMatch && (
            <span className="text-xs font-semibold text-warning">{member.matchPercent}% match</span>
          )}
        </span>
      </div>
    </div>
  );
}
