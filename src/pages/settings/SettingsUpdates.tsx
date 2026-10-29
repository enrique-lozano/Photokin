import { SettingsGroup, SettingsRow, SettingsToggleRow } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  checkForAppUpdate,
  getLastUpdateCheck,
  RELEASES_URL,
  requestAppUpdateInstall,
} from '@/system/appUpdater';
import { formatDate } from '@/utils/dateFormatter';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleArrowUp,
  IconClock,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { type ReactNode, useState } from 'react';
import { SettingsExternalLink } from './SettingsExternalLink';

type UpdateStatus =
  | { kind: 'notChecked' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; checkedAt: number }
  | { kind: 'available'; version: string; releasedAt: string | null }
  | { kind: 'error' };

function statusFromLastCheck(): UpdateStatus {
  const last = getLastUpdateCheck();
  if (!last) return { kind: 'notChecked' };
  return last.version
    ? { kind: 'available', version: last.version, releasedAt: last.releasedAt }
    : { kind: 'upToDate', checkedAt: last.checkedAt };
}

function formatCheckedAt(checkedAt: number): string {
  const date = new Date(checkedAt);
  const time = formatDate(date, { timeStyle: 'short' });
  const day =
    date.toDateString() === new Date().toDateString() ? 'today' : formatDate(date, { dateStyle: 'medium' });
  return `${day}, ${time}`;
}

function formatReleasedAt(releasedAt: string | null): string | undefined {
  const date = releasedAt ? new Date(releasedAt) : null;
  return date && !Number.isNaN(date.getTime())
    ? `Released ${formatDate(date, { dateStyle: 'medium' })}`
    : undefined;
}

export function SettingsUpdates() {
  const [status, setStatus] = useState<UpdateStatus>(statusFromLastCheck);
  const autoCheckForUpdates = useSettingsStore((state) => state.autoCheckForUpdates);

  const checkNow = async () => {
    setStatus({ kind: 'checking' });
    try {
      const update = await checkForAppUpdate();
      // The main window downloads it again when asked to install.
      void update?.close();
      setStatus(statusFromLastCheck());
    } catch (error) {
      console.warn('Update check failed', error);
      setStatus({ kind: 'error' });
    }
  };

  const install = async () => {
    await requestAppUpdateInstall();
    // Progress (and any "finish running tasks first" warning) shows up there.
    await getCurrentWindow().close();
  };

  const handleAutoCheckChange = (value: boolean) => {
    useSettingsStore.getState().setAutoCheckForUpdates(value);
    void emit('settings-autoCheckForUpdates-changed', value);
  };

  const checkButton = (label: string) => (
    <Button variant="outline" size="sm" onClick={() => void checkNow()}>
      {label}
    </Button>
  );

  const line: { icon: ReactNode; title: string; detail?: string; actions?: ReactNode } = {
    notChecked: {
      icon: <IconClock size={18} />,
      title: 'Not checked yet.',
      actions: checkButton('Check for updates'),
    },
    checking: {
      icon: <IconLoader2 size={18} className="motion-safe:animate-spin" />,
      title: 'Checking for updates…',
    },
    upToDate: {
      icon: <IconCheck size={18} className="text-success" />,
      title: 'You’re up to date',
      detail: status.kind === 'upToDate' ? `Last checked ${formatCheckedAt(status.checkedAt)}` : undefined,
      actions: checkButton('Check for updates'),
    },
    available: {
      icon: <IconCircleArrowUp size={18} className="text-primary" />,
      title: status.kind === 'available' ? `Version ${status.version} is available` : '',
      detail: status.kind === 'available' ? formatReleasedAt(status.releasedAt) : undefined,
      actions: status.kind === 'available' && (
        <>
          <SettingsExternalLink href={`${RELEASES_URL}/tag/v${status.version}`} label="Release notes" />
          <Button size="sm" onClick={() => void install()}>
            Install and restart
          </Button>
        </>
      ),
    },
    error: {
      icon: <IconAlertTriangle size={18} className="text-warning" />,
      title: 'Couldn’t check for updates',
      detail: 'No connection, or the update server didn’t answer.',
      actions: checkButton('Try again'),
    },
  }[status.kind];

  return (
    <SettingsGroup title="Updates">
      <SettingsRow
        icon={line.icon}
        label="Updates"
        description={[line.title, line.detail].filter(Boolean).join(' · ')}
        aria-live="polite"
      >
        {line.actions}
      </SettingsRow>

      <SettingsToggleRow
        icon={<IconRefresh size={18} />}
        label="Check when Photokin starts"
        checked={autoCheckForUpdates}
        onCheckedChange={handleAutoCheckChange}
      />
    </SettingsGroup>
  );
}
