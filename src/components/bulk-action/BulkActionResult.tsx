import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FileWriteTiming, policyFileWriteTiming } from '@/media/metadata/exiftool/write/metadataWritePolicy';
import { successfulFileCount, type BulkItemFailure, type BulkOutcome } from '@/system/bulkOutcome';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconPlayerSkipForward,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import './bulkAction.css';

/**
 * `warning`: the change went through but a secondary copy of it is missing.
 * `error`: the action did not happen for these files.
 */
type Tone = 'success' | 'warning' | 'error' | 'muted';

const TONE_ICON: Record<Tone, Icon> = {
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  error: IconCircleX,
  muted: IconPlayerSkipForward,
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const files = (count: number) => `${count.toLocaleString()} ${plural(count, 'file', 'files')}`;

/** How a result names what happened to the files, which depends on what the action does to them. */
export type BulkResultWording = {
  /** Where the change landed, under the summary. `partial` when some files failed or were skipped. */
  succeeded: (count: number, partial: boolean) => string;
  failed: { tone: 'warning' | 'error'; title: (count: number) => string; description: string; hint?: string };
  /**
   * Set for metadata edits, whose change lives in the library even for files
   * that failed. `follows-setting` edits are written, queued or skipped by the
   * write-back setting; `always` edits write the files whatever it says.
   */
  metadataWrite?: 'follows-setting' | 'always';
};

/** Library edits that are then mirrored into the metadata embedded in each file. */
export const METADATA_WRITE_WORDING: BulkResultWording = {
  succeeded: (count, partial) => {
    if (!partial) return 'Saved in Photokin and written into each file’s metadata.';
    return count > 0
      ? `Saved in Photokin and written into the metadata of ${files(count)}.`
      : 'Saved in Photokin.';
  },
  failed: {
    tone: 'warning',
    title: (count) => `${files(count)} saved in Photokin only`,
    description: 'Couldn’t write the file metadata.',
    hint: 'Photokin already has the change. Only the info embedded in these files is out of date, so other apps won’t see it yet. You can try again later with Write metadata to files.',
  },
  metadataWrite: 'follows-setting',
};

/** Metadata edits the user explicitly asked to write, such as date fields, even in read-only mode. */
export const EXPLICIT_METADATA_WRITE_WORDING: BulkResultWording = {
  ...METADATA_WRITE_WORDING,
  metadataWrite: 'always',
};

/** Actions that move the files themselves, where a failed file is left as it was. */
export const FILE_MOVE_WORDING: BulkResultWording = {
  succeeded: (count, partial) =>
    partial
      ? `${files(count)} ${plural(count, 'is', 'are')} in the new folder.`
      : 'Every file is in its new folder.',
  failed: {
    tone: 'error',
    title: (count) => `Couldn’t move ${files(count)}`,
    description: 'Still in the original folder.',
  },
};

type Tile = {
  tone: Tone;
  title: string;
  description: string;
  hint?: string;
  items?: BulkItemFailure[];
};

function ResultTile({ tile }: { tile: Tile }) {
  const TileIcon = TONE_ICON[tile.tone];
  const header = (
    <>
      <span className="bulk-action-result__tile-icon">
        <TileIcon size={18} stroke={1.75} />
      </span>
      <span className="bulk-action-result__tile-text">
        <span className="bulk-action-result__tile-title">{tile.title}</span>
        <span className="bulk-action-result__tile-description">{tile.description}</span>
      </span>
    </>
  );
  const className = clsx('bulk-action-result__tile', `bulk-action-result__tile--${tile.tone}`);

  if (!tile.items?.length) {
    return (
      <div className={className}>
        <div className="bulk-action-result__tile-header">{header}</div>
      </div>
    );
  }

  return (
    <Collapsible className={className} defaultOpen={tile.tone === 'warning' || tile.tone === 'error'}>
      <CollapsibleTrigger className="bulk-action-result__tile-header">
        {header}
        <span className="bulk-action-result__tile-chevron">
          <CollapsibleChevron />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="bulk-action-result__tile-body">
          {tile.hint && <p className="bulk-action-result__tile-hint">{tile.hint}</p>}
          <ul className="bulk-action-result__failures">
            {tile.items.map((item) => (
              <li key={item.id} className="bulk-action-result__failure">
                <span className="bulk-action-result__file">{item.label}</span>
                <span className="bulk-action-result__reason">{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function _succeededDescription(
  outcome: BulkOutcome,
  wording: BulkResultWording,
  fileWrite: FileWriteTiming,
  partial: boolean,
): string {
  if (outcome.fileCount === 0) return 'Saved in Photokin. No files needed changes.';
  if (fileWrite === FileWriteTiming.None)
    return 'Saved in Photokin only. Your files were left untouched (read-only mode).';
  if (fileWrite === FileWriteTiming.OnSync)
    return 'Saved in Photokin. File metadata will be written on your next library sync.';
  return wording.succeeded(successfulFileCount(outcome), partial);
}

/**
 * In-dialog summary of a finished bulk action: a row for what went through,
 * then one per problem listing its files with the reason. Rendered for a clean
 * run too, so the outcome of an action always lands in the same place instead
 * of alternating between a closed dialog and a toast the user may miss.
 */
export function BulkActionResult({
  summary,
  outcome,
  wording = METADATA_WRITE_WORDING,
}: {
  /** What went through, e.g. "Confirmed 412 faces for Daniel". */
  summary: string;
  outcome: BulkOutcome;
  wording?: BulkResultWording;
}) {
  const fileWrite: FileWriteTiming =
    wording.metadataWrite === 'follows-setting' ? policyFileWriteTiming() : FileWriteTiming.Immediate;
  const failures = outcome.fileFailures;
  const skipped = outcome.skipped ?? [];
  const partial = failures.length > 0 || skipped.length > 0;

  const tiles: Tile[] = [
    {
      tone: 'success',
      title: summary,
      description: _succeededDescription(outcome, wording, fileWrite, partial),
    },
  ];
  if (failures.length > 0) {
    const { title, ...failed } = wording.failed;
    tiles.push({ ...failed, title: title(failures.length), items: failures });
  }
  if (skipped.length > 0) {
    tiles.push({
      tone: 'muted',
      title: `Skipped ${files(skipped.length)}`,
      description: 'Left untouched on purpose.',
      items: skipped,
    });
  }

  return (
    <div className="bulk-action-result">
      {tiles.map((tile) => (
        <ResultTile key={tile.tone} tile={tile} />
      ))}
    </div>
  );
}
