import { toast } from '@/components/ui/toast';
import { shutdownExiftoolSession } from '@/media/metadata/exiftool/exiftoolSession';
import { ProcessKind, selectActiveProcesses, useProcessStore } from '@/stores/processStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { trackProcess } from '@/system/processTracker';
import { emit, listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import packageInfo from '../../package.json';

/**
 * In-app updates come from signed GitHub releases (see `plugins > updater` in
 * `tauri.conf.json`). The main window owns installing because it runs the
 * library work and sidecars that must be idle before the installer replaces
 * the app files; other windows ask it via {@link requestAppUpdateInstall}.
 */

export const RELEASES_URL = 'https://github.com/enrique-lozano/Photokin/releases';

const INSTALL_REQUEST_EVENT = 'app-update-install-requested';
const LAST_CHECK_KEY = 'photokin-last-update-check';
const CHECK_TIMEOUT_MS = 15_000;

/** Outcome of the latest successful check, shared by every window. */
export interface LastUpdateCheck {
  checkedAt: number;
  /** Newer version that was offered, or `null` when already up to date. */
  version: string | null;
  /** Release date of {@link version} as published in the release feed. */
  releasedAt: string | null;
}

class TasksRunningError extends Error {
  constructor() {
    super('Finish or stop running tasks first');
  }
}

/** Latest check made by this app version, so an old answer never outlives an update. */
export function getLastUpdateCheck(): LastUpdateCheck | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_CHECK_KEY) ?? 'null');
    if (stored?.appVersion !== packageInfo.version || typeof stored.checkedAt !== 'number') return null;
    return {
      checkedAt: stored.checkedAt,
      version: stored.version ?? null,
      releasedAt: stored.releasedAt ?? null,
    };
  } catch {
    return null;
  }
}

/** Asks the release feed for a newer signed build; `null` when up to date. */
export async function checkForAppUpdate(): Promise<Update | null> {
  const update = await check({ timeout: CHECK_TIMEOUT_MS });
  const pubDate = update?.rawJson.pub_date;
  localStorage.setItem(
    LAST_CHECK_KEY,
    JSON.stringify({
      appVersion: packageInfo.version,
      checkedAt: Date.now(),
      version: update?.version ?? null,
      releasedAt: typeof pubDate === 'string' ? pubDate : (update?.date ?? null),
    }),
  );
  return update;
}

let autoCheckStarted = false;

/** Main window only: checks once per launch, unless the user turned it off. */
export function startAutoUpdateCheck(): void {
  if (autoCheckStarted || import.meta.env.DEV) return;
  autoCheckStarted = true;

  if (!useSettingsStore.getState().autoCheckForUpdates) return;

  checkForAppUpdate()
    .then((update) => {
      if (!update) return;

      toast.info(`Photokin ${update.version} is available`, {
        duration: false,
        action: { label: 'Install and restart', onClick: () => void installAppUpdate() },
      });
      void update.close();
    })
    .catch((error: unknown) => {
      // Offline or no published release yet; the next launch tries again.
      console.warn('Automatic update check failed', error);
    });
}

function _hasRunningTasks(ownTasks = 0): boolean {
  return selectActiveProcesses(useProcessStore.getState().processes).length > ownTasks;
}

let installing = false;

/**
 * Main window only: downloads the update through the process center, then
 * installs it and restarts. Refuses while imports, scans, or syncs are running
 * so the installer never has to replace a sidecar that is still in use.
 */
export async function installAppUpdate(): Promise<void> {
  if (installing) return;
  if (_hasRunningTasks()) {
    toast.warning('Finish or stop running tasks first');
    return;
  }

  installing = true;
  try {
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Updating Photokin',
        message: 'Looking for the update…',
        successMessage: false,
        errorMessage: (error) =>
          error instanceof TasksRunningError ? error.message : 'Couldn’t install the update',
      },
      async (reporter) => {
        const update = await checkForAppUpdate();
        if (!update) throw new Error('No update is available');

        reporter.update({ title: `Updating to Photokin ${update.version}`, message: 'Downloading…' });
        let totalBytes = 0;
        let downloadedBytes = 0;
        await update.download((event) => {
          if (event.event === 'Started') {
            totalBytes = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) reporter.setProgress(downloadedBytes, totalBytes);
          }
        });

        // Something may have started while downloading; installing now would
        // cut it off, so let the user retry once it finishes.
        if (_hasRunningTasks(1)) throw new TasksRunningError();

        reporter.setIndeterminate('Restarting…');
        shutdownExiftoolSession();
        // On Windows the installer takes over and the app exits right here.
        await update.install();
        await relaunch();
      },
    );
  } catch (error) {
    // The process center already showed the failure.
    console.warn('App update failed', error);
  } finally {
    installing = false;
  }
}

/** Asks the main window to install the update (used from the settings window). */
export function requestAppUpdateInstall(): Promise<void> {
  return emit(INSTALL_REQUEST_EVENT);
}

/** Main window only: installs when another window asks. Returns the unlistener. */
export function listenForAppUpdateInstallRequests(): () => void {
  const unlisten = listen(INSTALL_REQUEST_EVENT, () => void installAppUpdate());
  return () => void unlisten.then((stop) => stop());
}
