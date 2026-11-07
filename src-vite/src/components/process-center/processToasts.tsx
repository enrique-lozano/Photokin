import { useProcessStore } from '../../stores/processStore';
import { toast } from '../ui/toast';
import { useProcessWarningsDialog } from './ProcessWarningsDialog';

/** Briefly announces the start; live progress and results are shown in the footer. */
export function showProcessToast(id: string): void {
  const process = useProcessStore.getState().processes.find((item) => item.id === id);
  if (process) toast.info(process.title, { id, duration: 4_000 });
}

export function dismissProcessResultToast(id: string): void {
  toast.dismiss(`process-result-${id}`);
}

export function showProcessResultToast(id: string, announceSuccess = true): void {
  const process = useProcessStore.getState().processes.find((item) => item.id === id);
  if (!process || process.status === 'running') return;

  // Replace an outstanding start notice instead of leaving contradictory notices.
  toast.dismiss(id);
  const toastId = `process-result-${id}`;
  if (process.status === 'error') {
    toast.error(process.error ?? process.message ?? `${process.title} failed`, { id: toastId });
  } else if (process.status === 'stopped') {
    toast.info(`${process.title} stopped`, { id: toastId });
  } else if (process.warnings && process.warnings.length > 0) {
    const warnings = process.warnings;
    toast.warning(process.message ?? `${process.title} completed`, {
      id: toastId,
      duration: 10_000,
      description: `${warnings.length} item${warnings.length === 1 ? '' : 's'} could not be processed.`,
      action: {
        label: 'View details',
        onClick: () => useProcessWarningsDialog.getState().open(process.title, warnings),
      },
    });
  } else if (announceSuccess) {
    toast.success(process.message ?? `${process.title} completed`, {
      id: toastId,
      action: process.successAction,
      ...(process.successAction ? { duration: 10_000 } : {}),
    });
  }
}
