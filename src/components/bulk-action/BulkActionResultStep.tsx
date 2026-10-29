import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { BulkActionResult, type BulkResultWording } from './BulkActionResult';

/**
 * Complete final step for dialog-hosted bulk actions. Keeping the result body
 * and its Undo/Done footer together prevents each editor from drifting into a
 * slightly different completion pattern.
 */
export function BulkActionResultStep({
  summary,
  outcome,
  wording,
  isUndoing,
  onUndo,
  onDone,
}: {
  summary: string;
  outcome: BulkOutcome;
  wording?: BulkResultWording;
  isUndoing: boolean;
  onUndo: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <DialogBody>
        <BulkActionResult summary={summary} outcome={outcome} wording={wording} />
      </DialogBody>
      <DialogFooter>
        {outcome.undo && (
          <Button type="button" variant="outline" onClick={onUndo} isLoading={isUndoing}>
            Undo
          </Button>
        )}
        <Button type="button" onClick={onDone} disabled={isUndoing}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
