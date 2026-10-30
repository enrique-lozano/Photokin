import { IconAlertTriangle } from '@tabler/icons-react';
import { create } from 'zustand';
import { buttonVariants } from '../ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ProcessWarningsDialogState {
  /** Headline of the process whose warnings are shown, or `null` when closed. */
  title: string | null;
  warnings: string[];
  /** Opens the dialog with a snapshot so it survives the toast being dismissed. */
  open: (title: string, warnings: string[]) => void;
  close: () => void;
}

/**
 * Holds a snapshot (title + warnings) rather than a process id so the dialog
 * keeps working after the originating toast autohides and the process is
 * dropped from the store.
 */
export const useProcessWarningsDialog = create<ProcessWarningsDialogState>((set) => ({
  title: null,
  warnings: [],
  open: (title, warnings) => set({ title, warnings }),
  close: () => set({ title: null, warnings: [] }),
}));

/**
 * Lists the non-fatal warnings collected by a finished process (e.g. files that
 * couldn't be read during a face scan). Mounted once per window alongside the
 * toaster and opened from the "View details" action on a process toast.
 */
export function ProcessWarningsDialog() {
  const title = useProcessWarningsDialog((state) => state.title);
  const warnings = useProcessWarningsDialog((state) => state.warnings);
  const close = useProcessWarningsDialog((state) => state.close);

  return (
    <Dialog
      open={title !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="w-[min(90vw,40rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconAlertTriangle size={18} className="text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>
            The operation finished, but {warnings.length} item{warnings.length === 1 ? '' : 's'} could not be
            processed and {warnings.length === 1 ? 'was' : 'were'} skipped.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="bg-muted/30">
          <ul className="space-y-1">
            {warnings.map((warning, index) => (
              <li
                key={`${index}-${warning}`}
                className="break-all font-mono text-xs leading-relaxed text-foreground"
              >
                {warning}
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: 'outline' })}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
