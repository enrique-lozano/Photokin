import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useId, useState, type ReactNode } from 'react';
import { format as timeAgo } from 'timeago.js';
import { useProcessStore, selectActiveProcesses, type AppProcess } from '../../stores/processStore';
import { pauseProcess, resumeProcess, stopProcess } from '../../system/processCancellation';
import { Button } from '../ui/button';
import { VerticalDivider } from '../ui/verticalDivider';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useProcessWarningsDialog } from './ProcessWarningsDialog';
import { getProcessKindMeta } from './processKind';
import { dismissProcessResultToast } from './processToasts';
import './processCenter.css';

function sortProcesses(processes: AppProcess[]): AppProcess[] {
  const rank = (process: AppProcess) =>
    process.status !== 'running' ? 2 : process.paused ? 1 : 0;
  return [...processes].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2 ? b.updatedAt - a.updatedAt : a.startedAt - b.startedAt),
  );
}

function progressText(process: AppProcess): string | null {
  if (process.progressCurrent !== undefined && process.progressTotal !== undefined) {
    return `${process.progressCurrent.toLocaleString()} of ${process.progressTotal.toLocaleString()}${
      process.progressUnit ? ` ${process.progressUnit}` : ''
    }`;
  }
  if (process.progress !== null && Number.isFinite(process.progress)) {
    return `${Math.round(process.progress * 100)}%`;
  }
  return null;
}

function ProcessProgress({ process }: { process: AppProcess }) {
  const determinate = process.progress !== null && Number.isFinite(process.progress);
  const max = process.progressTotal && process.progressTotal > 0 ? process.progressTotal : 100;
  const value =
    process.progressCurrent !== undefined && process.progressTotal !== undefined && process.progressTotal > 0
      ? Math.min(process.progressCurrent, process.progressTotal)
      : Math.round((process.progress ?? 0) * max);

  return (
    <span
      className="process-progress"
      role="progressbar"
      aria-label={`${process.title} progress`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={determinate ? value : undefined}
      aria-valuetext={progressText(process) ?? 'In progress'}
    >
      <span
        className={clsx(
          'process-progress__fill',
          !determinate && 'process-progress__fill--indeterminate',
        )}
        style={determinate ? { width: `${Math.min(100, Math.max(0, (process.progress ?? 0) * 100))}%` } : undefined}
      />
    </span>
  );
}

function ProcessRow({ process, onShowWarnings }: { process: AppProcess; onShowWarnings: () => void }) {
  const running = process.status === 'running';
  const finishedAt = process.finishedAt ?? process.updatedAt;
  const KindIcon = getProcessKindMeta(process.kind).icon;
  const hasWarnings = !running && (process.warnings?.length ?? 0) > 0;
  const StatusIcon: Icon =
    process.status === 'error'
      ? IconAlertCircle
      : hasWarnings
        ? IconAlertTriangle
        : process.status === 'success'
          ? IconCircleCheck
          : process.status === 'stopped'
            ? IconX
            : process.paused
              ? IconPlayerPause
              : KindIcon;
  const detail = process.status === 'error' ? process.error ?? process.message : process.message;

  return (
    <li
      className={clsx(
        'process-task',
        `process-task--${process.status}`,
        process.paused && 'process-task--paused',
        hasWarnings && 'process-task--warning',
      )}
    >
      <StatusIcon
        size={18}
        className={clsx('process-task__icon', running && !process.paused && 'process-row-spinner')}
        aria-hidden="true"
      />
      <div className="process-task__body">
        <div className="process-task__heading">
          <span className="process-task__title" title={process.title}>{process.title}</span>
          {running ? (
            <div className="process-task__actions">
              {process.canPause && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  disabled={process.stopping}
                  aria-label={`${process.paused ? 'Resume' : 'Pause'} ${process.title}`}
                  title={process.paused ? 'Resume' : 'Pause'}
                  onClick={() => (process.paused ? resumeProcess(process.id) : pauseProcess(process.id))}
                >
                  {process.paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
                </Button>
              )}
              {process.canStop && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Cancel ${process.title}`}
                  title={process.stopping ? 'Stopping' : 'Cancel'}
                  aria-busy={process.stopping}
                  disabled={process.stopping}
                  onClick={() => {
                    useProcessStore.getState().updateProcess(process.id, { stopping: true });
                    stopProcess(process.id);
                  }}
                >
                  <IconX size={14} />
                </Button>
              )}
            </div>
          ) : (
            <div className="process-task__actions">
              <span className="process-task__state">
                <span className="sr-only">
                  {hasWarnings ? 'Completed with warnings' : process.status === 'success' ? 'Done' : process.status === 'error' ? 'Failed' : 'Stopped'}
                  {' · '}
                </span>
                {timeAgo(finishedAt)
                  .replace(/(\d+) seconds?/, '$1s')
                  .replace(/(\d+) minutes?/, '$1min')
                  .replace(/(\d+) hours?/, '$1h')
                  .replace(/(\d+) days?/, '$1d')
                  .replace(/(\d+) weeks?/, '$1w')
                  .replace(/(\d+) months?/, '$1mo')
                  .replace(/(\d+) years?/, '$1y')}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Dismiss ${process.title}`}
                title="Dismiss notification"
                onClick={() => {
                  dismissProcessResultToast(process.id);
                  useProcessStore.getState().removeProcess(process.id);
                }}
              >
                <IconX size={14} />
              </Button>
            </div>
          )}
        </div>

        {running && (
          <div className="process-task__progress">
            <ProcessProgress process={process} />
            {progressText(process) && <span className="process-task__count">{progressText(process)}</span>}
          </div>
        )}
        {detail && <p className="process-task__detail">{detail}</p>}

        {!running && process.warnings && process.warnings.length > 0 && (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={onShowWarnings}
          >
            View {process.warnings.length} skipped item{process.warnings.length === 1 ? '' : 's'}
          </Button>
        )}
        {process.status === 'success' && process.successAction && (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => process.successAction?.onClick()}
          >
            {process.successAction.label}
          </Button>
        )}
      </div>
    </li>
  );
}

export function ProcessFooterIndicator({
  renderIndicators = (process, notification) => <>{process}{notification}</>,
}: {
  renderIndicators?: (process: ReactNode, notification: ReactNode) => ReactNode;
}) {
  const processes = useProcessStore((state) => state.processes);
  const active = sortProcesses(selectActiveProcesses(processes));
  const primary = active[0];
  const [open, setOpen] = useState(false);
  const contentId = useId();

  const StatusIcon: Icon = primary
    ? primary.paused
      ? IconPlayerPause
      : getProcessKindMeta(primary.kind).icon
    : IconBell;
  const label = primary
    ? primary.paused
      ? `Paused · ${primary.title}`
      : primary.title
    : null;
  const count = primary ? progressText(primary) : null;
  const rows = sortProcesses(processes);
  const additionalTasks = Math.max(0, active.length - 1);
  const hasError = processes.some((process) => process.status === 'error');
  const finished = processes.filter((process) => process.status !== 'running');

  const processIndicator = primary && !open ? (
    <>
      <VerticalDivider className="h-3.5" />
      <button
        type="button"
        className={clsx('process-footer-indicator', primary.paused && 'process-footer-indicator--paused')}
        aria-label={`Current task: ${label}${count ? `, ${count}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(true)}
        title="Show background tasks"
      >
        <StatusIcon size={15} className={clsx(!primary.paused && 'process-row-spinner')} aria-hidden="true" />
        <span className="process-footer-indicator-label">{label}</span>
        {count && <span className="process-footer-indicator-count">{count}</span>}
        {primary.progress !== null && <ProcessProgress process={primary} />}
        {additionalTasks > 0 && <span className="process-footer-indicator-extra">+{additionalTasks}</span>}
      </button>
    </>
  ) : null;
  const notificationIndicator = (
    <PopoverTrigger asChild>
        <button
          type="button"
          className={clsx(
            'process-footer-indicator',
            'process-footer-indicator--idle',
            hasError && 'process-footer-indicator--error',
          )}
          aria-label={
            hasError
                ? 'Background tasks: recent failures'
                : finished.length > 0
                  ? `Background tasks: ${finished.length} recent notifications`
                  : 'Background tasks'
          }
          aria-expanded={open}
          title="Background tasks"
        >
          <IconBell size={15} aria-hidden="true" />
          {processes.length > 0 && (
            <span className="process-footer-indicator-dot" aria-hidden="true" />
          )}
        </button>
    </PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      {renderIndicators(processIndicator, notificationIndicator)}
      <PopoverContent
        id={contentId}
        className="process-center-popover z-1000003 w-[min(440px,calc(100vw-24px))] p-0"
        side="top"
        align="end"
        sideOffset={10}
        aria-label="Background tasks"
      >
        <div className="process-center-popover__header">
          <h2 className="process-center-popover__title">Background tasks</h2>
          <div className="process-task__actions">
            {finished.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                finished.forEach((process) => dismissProcessResultToast(process.id));
                useProcessStore.getState().clearFinishedProcesses();
              }}
            >
              Clear finished
            </Button>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Close background tasks"
              title="Close background tasks"
              onClick={() => setOpen(false)}
            >
              <IconX size={14} />
            </Button>
          </div>
        </div>
        {rows.length > 0 ? (
          <ul className="process-task-list">
            {rows.map((process) => (
              <ProcessRow
                key={process.id}
                process={process}
                onShowWarnings={() => {
                  setOpen(false);
                  useProcessWarningsDialog.getState().open(process.title, process.warnings ?? []);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="process-center-popover__empty">No recent background tasks</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
