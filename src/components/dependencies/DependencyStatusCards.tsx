import { SettingsIconButton, SettingsRow } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { ExternalDependencyStatus } from '@/system/dependencyStatus';
import { installExiftool, locateExiftool, type ExiftoolInstallProgress } from '@/system/exiftoolSetup';
import { IconAlertTriangle, IconDownload, IconLoader2, IconRefresh, IconTool } from '@tabler/icons-react';
import { platform } from '@tauri-apps/plugin-os';
import { useState } from 'react';

const ICON_SIZE = 18;

/** What each tool does for the user, in plain words. */
const DEPENDENCY_PURPOSE: Record<string, string> = {
  exiftool: 'Reads and updates your photo details.',
};

/**
 * Quiet rows for available tools; missing tools explain the impact and the fix.
 */
export function DependencyStatusCards({
  dependencies,
  isLoading,
  error,
  onRecheck,
}: {
  dependencies: ExternalDependencyStatus[];
  isLoading: boolean;
  error: string | null;
  onRecheck?: () => void;
}) {
  const [operation, setOperation] = useState<'installing' | 'locating' | null>(null);
  const [progress, setProgress] = useState<ExiftoolInstallProgress | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const install = async () => {
    setOperation('installing');
    setOperationError(null);
    setProgress(null);
    try {
      await installExiftool(setProgress);
      onRecheck?.();
    } catch (error) {
      const message = `Could not install ExifTool: ${String(error)}`;
      setOperationError(message);
      toast.error(message);
    } finally {
      setOperation(null);
    }
  };

  const locate = async () => {
    setOperation('locating');
    setOperationError(null);
    try {
      if (await locateExiftool()) onRecheck?.();
    } catch (error) {
      const message = `Could not use that file: ${String(error)}`;
      setOperationError(message);
      toast.error(message);
    } finally {
      setOperation(null);
    }
  };

  if (isLoading) {
    return (
      <SettingsRow
        icon={<IconLoader2 size={ICON_SIZE} className="motion-safe:animate-spin" />}
        label="Checking photo tools…"
        role="status"
      />
    );
  }

  if (error) {
    return (
      <SettingsRow
        icon={<IconAlertTriangle size={ICON_SIZE} className="text-warning" />}
        label="Couldn’t check photo tools"
        description={error}
        role="alert"
      >
        {onRecheck && <RecheckButton onRecheck={onRecheck} />}
      </SettingsRow>
    );
  }

  if (dependencies.length === 0) {
    return <SettingsRow icon={<IconTool size={ICON_SIZE} />} label="No photo tools found." />;
  }

  return (
    <>
      {dependencies.map((dependency) => {
        const details = dependency.available
          ? [dependency.version && `Version ${dependency.version}`, DEPENDENCY_PURPOSE[dependency.id]]
          : [];
        const missingExiftool = dependency.id === 'exiftool' && !dependency.available;
        const installStage =
          progress?.stage === 'unpacking'
            ? 'Unpacking'
            : progress?.stage === 'checking'
              ? 'Checking'
              : 'Downloading';

        return (
          <SettingsRow
            key={dependency.id}
            icon={<IconTool size={ICON_SIZE} />}
            label={dependency.displayName}
            description={
              <>
                {dependency.available ? (
                  details.filter(Boolean).join(' · ')
                ) : (
                  <span
                    className="inline-flex items-start gap-1 text-warning"
                    title={dependency.error ?? undefined}
                    role="alert"
                  >
                    <IconAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {missingExiftool
                      ? 'Not found. Photokin can’t read or write metadata.'
                      : (dependency.error ?? 'Not installed or couldn’t be found.')}
                  </span>
                )}
                {missingExiftool && operation === 'installing' && (
                  <span className="block" role="status">
                    {installStage} ExifTool
                    {progress?.percent != null ? ` · ${Math.round(progress.percent)}%` : '…'}
                  </span>
                )}
                {missingExiftool && operationError && (
                  <span className="block text-destructive-text" role="alert">
                    {operationError}
                  </span>
                )}
              </>
            }
          >
            {missingExiftool ? (
              <>
                {platform() === 'windows' && (
                  <Button size="sm" disabled={operation !== null} onClick={() => void install()}>
                    {operation === 'installing' ? (
                      <IconLoader2 size={16} className="motion-safe:animate-spin" />
                    ) : (
                      <IconDownload size={16} />
                    )}
                    {operation === 'installing' ? 'Installing…' : 'Install'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={operation !== null}
                  onClick={() => void locate()}
                >
                  {operation === 'locating' ? 'Choosing…' : 'Choose file…'}
                </Button>
              </>
            ) : (
              onRecheck && <RecheckButton onRecheck={onRecheck} />
            )}
          </SettingsRow>
        );
      })}
    </>
  );
}

function RecheckButton({ onRecheck }: { onRecheck: () => void }) {
  return (
    <SettingsIconButton label="Check again" onClick={onRecheck}>
      <IconRefresh size={16} />
    </SettingsIconButton>
  );
}
