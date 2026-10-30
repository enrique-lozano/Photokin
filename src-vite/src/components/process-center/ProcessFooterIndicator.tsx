import { IconAlertCircle, IconCircleCheck, IconLoader2, type Icon } from '@tabler/icons-react';
import clsx from 'clsx';
import { selectActiveProcesses, useProcessStore } from '../../stores/processStore';
import './processCenter.css';
import { getProcessKindMeta } from './processKind';
import { reopenProcessToasts } from './processToasts';

/**
 * Compact, always-available footer entry point for the process center. Mirrors
 * the VS Code status-bar item: it shows the single active task's message, or a
 * "N processes" summary, and re-opens the autohidden notifications on click.
 */
export function ProcessFooterIndicator() {
  const processes = useProcessStore((state) => state.processes);

  if (processes.length === 0) {
    return null;
  }

  const active = selectActiveProcesses(processes);
  const hasError = processes.some((process) => process.status === 'error');

  let label: string;
  let LeadingIcon: Icon = IconLoader2;
  let spin = false;

  if (active.length === 1) {
    const [process] = active;
    LeadingIcon = getProcessKindMeta(process.kind).icon;
    const percent =
      process.progress !== null && Number.isFinite(process.progress)
        ? ` · ${Math.round(process.progress * 100)}%`
        : '';
    label = `${process.title}${percent}`;
    spin = process.progress === null || process.kind === 'generic';
  } else if (active.length > 1) {
    LeadingIcon = IconLoader2;
    spin = true;
    label = `${active.length} processes running`;
  } else if (hasError) {
    LeadingIcon = IconAlertCircle;
    label = 'A process failed';
  } else {
    LeadingIcon = IconCircleCheck;
    label = 'Done';
  }

  return (
    <button
      type="button"
      className={clsx('process-footer-indicator', hasError && 'process-footer-indicator--error')}
      onClick={reopenProcessToasts}
      title="Show background activity"
    >
      <LeadingIcon size={15} className={clsx(spin && 'process-row-spinner')} />
      <span className="process-footer-indicator-label">{label}</span>
    </button>
  );
}
