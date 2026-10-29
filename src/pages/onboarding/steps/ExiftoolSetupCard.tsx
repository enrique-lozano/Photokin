import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ExternalDependencyStatus } from '@/system/dependencyStatus';
import type { ExiftoolInstallProgress } from '@/system/exiftoolSetup';
import {
  IconCheck,
  IconDownload,
  IconExclamationCircle,
  IconFolder,
  IconFolderSearch,
  IconLoader2,
  IconTool,
} from '@tabler/icons-react';

const STAGES = [
  { id: 'downloading', label: 'Downloading' },
  { id: 'unpacking', label: 'Unpacking' },
  { id: 'checking', label: 'Checking' },
] as const;

export type ExiftoolSetupStatus = 'checking' | 'missing' | 'installing' | 'ready' | 'error';

export function ExiftoolSetupCard({
  status,
  dependency,
  progress,
  error,
  canAutoInstall,
  onInstall,
  onLocate,
  onRetry,
  onOpenFolder,
}: {
  status: ExiftoolSetupStatus;
  dependency?: ExternalDependencyStatus;
  progress: ExiftoolInstallProgress | null;
  error: string | null;
  canAutoInstall: boolean;
  onInstall: () => void;
  onLocate: () => void;
  onRetry: () => void;
  onOpenFolder: () => void;
}) {
  const busy = status === 'installing' || status === 'checking';
  const activeStage = STAGES.findIndex((stage) => stage.id === progress?.stage);
  const percent = progress?.percent ?? null;
  const version = progress?.version ? ` v${progress.version}` : '';

  return (
    <article className="onboarding__dependency" aria-label="ExifTool setup" aria-busy={busy}>
      <div className="onboarding__dependency-head">
        <div className="onboarding__dependency-icon" aria-hidden="true">
          <IconTool size={20} />
        </div>
        <div className="onboarding__dependency-main">
          <h2 className="onboarding__dependency-name">ExifTool</h2>
          <div className="onboarding__dependency-meta" aria-live="polite">
            {status === 'ready' ? (
              <>
                <span>{dependency?.version ? `v${dependency.version}` : 'Version unknown'}</span>
                {dependency?.location && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="onboarding__dependency-path" title={dependency.location}>
                      {dependency.location}
                    </span>
                  </>
                )}
              </>
            ) : status === 'installing' ? (
              <span>Installing ExifTool{version}…</span>
            ) : status === 'checking' ? (
              <span>Checking ExifTool…</span>
            ) : (
              <span>Browse photos without it, or install it to read and edit their details.</span>
            )}
          </div>
        </div>
        <Badge variant={status === 'ready' ? 'success' : busy ? 'info' : 'warning'}>
          {busy ? (
            <IconLoader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : status === 'ready' ? (
            <IconCheck aria-hidden="true" />
          ) : (
            <IconExclamationCircle aria-hidden="true" />
          )}
          {status === 'ready'
            ? 'Available'
            : status === 'installing'
              ? 'Installing'
              : status === 'checking'
                ? 'Checking'
                : status === 'error'
                  ? 'Needs attention'
                  : 'Not found'}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Photokin uses ExifTool to read and edit the details stored inside your photos: tags, ratings,
        locations and more.
      </p>

      {status === 'installing' && progress && (
        <div className="onboarding__install-progress">
          <div
            className="onboarding__progress-track"
            role="progressbar"
            aria-label={`${STAGES[activeStage].label} ExifTool`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={percent === null ? STAGES[activeStage].label : `${percent}%`}
          >
            <div
              className="onboarding__progress-fill"
              data-indeterminate={percent === null}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <ol className="onboarding__install-stages" aria-label="Installation progress">
            {STAGES.map((stage, index) => (
              <li
                key={stage.id}
                data-active={index === activeStage}
                data-done={index < activeStage}
                aria-current={index === activeStage ? 'step' : undefined}
              >
                <span className="onboarding__install-stage-icon" aria-hidden="true">
                  {index < activeStage && <IconCheck size={10} />}
                </span>
                {stage.label}
                {index === activeStage && percent !== null && ` · ${percent}%`}
              </li>
            ))}
          </ol>
        </div>
      )}

      {status === 'error' && error && (
        <p className="onboarding__dependency-error" role="alert">
          {error}
        </p>
      )}

      {(status === 'missing' || status === 'error') && (
        <div className="onboarding__dependency-actions">
          {status === 'error' ? (
            <Button onClick={onRetry}>Try again</Button>
          ) : (
            canAutoInstall && (
              <Button onClick={onInstall}>
                <IconDownload size={16} /> Install automatically
              </Button>
            )
          )}
          <Button variant="outline" onClick={onLocate}>
            <IconFolderSearch size={16} /> Locate manually
          </Button>
        </div>
      )}

      {status === 'ready' && dependency?.location && (
        <Button
          size="xs"
          variant="ghost"
          className="onboarding__open-folder"
          onClick={onOpenFolder}
          title="Show in file explorer"
        >
          <IconFolder size={14} /> Open folder
        </Button>
      )}
    </article>
  );
}
