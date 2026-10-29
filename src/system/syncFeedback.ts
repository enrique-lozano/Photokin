import { toast } from '@/components/ui/toast';
import type { SyncResult } from '@/db/api/services/assetIndexer.service';

/** Up to how many unsupported extensions to spell out in the warning toast. */
const MAX_LISTED_EXTENSIONS = 5;

/**
 * Surfaces the outcome of a library sync to the user: a concise success toast
 * summarizing what changed, plus a separate warning when new files were skipped
 * because their format is unsupported.
 */
export function notifySyncResult(result: SyncResult): void {
  const changes: string[] = [];
  if (result.addedCount > 0) {
    changes.push(`${result.addedCount} added`);
  }
  if (result.changedCount > 0) {
    changes.push(`${result.changedCount} updated`);
  }
  if (result.renamedCount > 0) {
    changes.push(`${result.renamedCount} renamed`);
  }
  if (result.removedCount > 0) {
    changes.push(`${result.removedCount} removed`);
  }

  if (changes.length === 0) {
    toast.success('Library up to date', { description: 'No changes were found.' });
  } else {
    toast.success('Library synchronized', { description: changes.join(' · ') });
  }

  if (result.unsupportedNewCount > 0) {
    const listed = result.unsupportedExtensions
      .slice(0, MAX_LISTED_EXTENSIONS)
      .map((entry) => `${entry.extension} (${entry.count})`)
      .join(', ');

    const remaining = result.unsupportedExtensions.length - MAX_LISTED_EXTENSIONS;
    const description = remaining > 0 ? `${listed} +${remaining} more` : listed;

    toast.warning(
      `${result.unsupportedNewCount} unsupported file${result.unsupportedNewCount > 1 ? 's were' : ' was'} skipped`,
      { description: description || undefined },
    );
  }

  if (result.unreadableCount > 0) {
    toast.warning(`Could not re-read ${_files(result.unreadableCount)}`, {
      description: 'Those photos keep their previous details. Check the console for the reasons.',
    });
  }

  if (result.writeBackFailedCount > 0) {
    toast.warning(`Could not write your edits into ${_files(result.writeBackFailedCount)}`, {
      description: 'The edits are safe in Photokin and will be retried on the next sync.',
    });
  }
}

function _files(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}
