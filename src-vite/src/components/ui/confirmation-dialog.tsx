import { MetadataMode, WriteBackTiming } from '@/common/metadataOptions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useConfirmationDialog } from '@/components/ui/confirmationDialogStore';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { type ReactNode, type RefObject } from 'react';

export type ConfirmationTone = 'default' | 'warning' | 'destructive';
export type FileMetadataImpact = 'automatic' | 'explicit';

/**
 * What a confirmation says. Shared by {@link ConfirmationDialog} and the
 * imperative `confirm()`, so a dialog reads the same either way.
 */
export interface ConfirmationOptions {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  tone?: ConfirmationTone;
  /** How this action reaches original-file metadata, when it does. */
  fileMetadataImpact?: FileMetadataImpact;
  /** Extra detail shown between the description and the actions. */
  content?: ReactNode;
}

interface ConfirmationDialogProps extends ConfirmationOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  isConfirming?: boolean;
  /** Keep the dialog mounted while an asynchronous confirmation runs. */
  keepOpenOnConfirm?: boolean;
  /** Element to focus on open instead of the default Cancel button. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * One source of truth for file-impact copy across forms and confirmations.
 * Automatic writes honor the persisted mode/timing; explicit writes happen now
 * regardless of automatic write-back settings.
 */
export function MetadataImpactNotice({
  impact,
  className,
  showReadOnly = false,
}: {
  impact: FileMetadataImpact;
  className?: string;
  showReadOnly?: boolean;
}) {
  const metadataMode = useSettingsStore((state) => state.metadataMode);
  const writeBackTiming = useSettingsStore((state) => state.writeBackTiming);
  const readonly = impact === 'automatic' && metadataMode !== MetadataMode.Full;
  if (readonly && !showReadOnly) return null;

  const explicit = impact === 'explicit';
  const text = readonly
    ? 'Read-only mode is on. This change stays in Photokin and does not modify the original file.'
    : explicit
      ? 'This rewrites embedded metadata in the affected originals now and cannot be automatically undone. Keep a backup if you may need the previous metadata.'
      : writeBackTiming === WriteBackTiming.DeferredOnSync
        ? 'File write-back is on. This queues embedded metadata changes for the affected originals; they will be written on the next sync.'
        : 'File write-back is on. This updates embedded metadata in the affected originals when you apply the change.';

  return (
    <p
      className={cn(
        'flex shrink-0 items-start gap-2 rounded-md border p-3 text-left text-xs',
        readonly
          ? 'border-border bg-muted/50 text-muted-foreground'
          : 'border-warning/40 bg-warning/10 text-warning',
        className,
      )}
    >
      {explicit ? (
        <IconAlertTriangle size={16} className="mt-px shrink-0" />
      ) : (
        <IconInfoCircle size={16} className="mt-px shrink-0" />
      )}
      {text}
    </p>
  );
}

/**
 * Shared confirm/cancel surface: a tonal icon states the kind of action, so the
 * body can stay a single sentence instead of stacking repeated warnings.
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'default',
  fileMetadataImpact,
  content,
  confirmDisabled = false,
  isConfirming = false,
  keepOpenOnConfirm = false,
  initialFocusRef,
}: ConfirmationDialogProps) {
  const actionVariant = tone === 'destructive' ? 'destructive' : 'default';
  // A dialog that stays open has to keep showing progress, which the Radix
  // action (it closes on click) cannot do.
  const action = keepOpenOnConfirm ? (
    <Button
      className="flex-1"
      variant={actionVariant}
      onClick={onConfirm}
      disabled={confirmDisabled}
      isLoading={isConfirming}
    >
      {confirmLabel}
    </Button>
  ) : (
    <AlertDialogAction
      className="flex-1"
      variant={actionVariant}
      onClick={onConfirm}
      disabled={confirmDisabled || isConfirming}
    >
      {confirmLabel}
    </AlertDialogAction>
  );

  return (
    <AlertDialog open={open} onOpenChange={(value) => !isConfirming && onOpenChange(value)}>
      <AlertDialogContent
        onOpenAutoFocus={
          initialFocusRef
            ? (event) => {
                event.preventDefault();
                initialFocusRef.current?.focus();
              }
            : undefined
        }
      >
        <AlertDialogHeader className="items-center gap-3 px-7 pb-2 pt-7 text-center sm:text-center">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-full ring-1',
              tone === 'destructive'
                ? 'bg-destructive/10 text-destructive-text ring-destructive/20'
                : tone === 'warning'
                  ? 'bg-warning/10 text-warning ring-warning/20'
                  : 'bg-primary/10 text-primary ring-primary/20',
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="flex max-w-md flex-col gap-1.5">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        {content && <AlertDialogBody className="border-y-0 px-7 py-2">{content}</AlertDialogBody>}

        {fileMetadataImpact && <MetadataImpactNotice impact={fileMetadataImpact} className="mx-7" />}

        <AlertDialogFooter className="flex-row gap-2 px-7 pb-6 pt-4">
          <AlertDialogCancel className="flex-1" disabled={isConfirming}>
            Cancel
          </AlertDialogCancel>
          {action}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Global host for `confirm()`. Mounted once in the app shell. */
export function ConfirmationDialogHost() {
  const open = useConfirmationDialog((state) => state.open);
  const options = useConfirmationDialog((state) => state.options);
  const settle = useConfirmationDialog((state) => state.settle);

  if (!options) return null;

  return (
    <ConfirmationDialog
      {...options}
      open={open}
      onOpenChange={(value) => !value && settle(false)}
      onConfirm={() => settle(true)}
    />
  );
}
