import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '../components/app-shell/AppShell';
import { AppDataKey, AppDataService } from '../db/api/services/appData.service';
import { startBackgroundIndexing } from '../media/smartSearch/indexing';
import { startStartupFolderCheck } from '../media/startupFolderCheck';
import { recoverIncompleteImports } from '../media/import/importRecovery';
import { shutdownExiftoolSession } from '../media/metadata/exiftool/exiftoolSession';
import { AppRoutes } from '../router';
import { listenForAppUpdateInstallRequests, startAutoUpdateCheck } from '../system/appUpdater';

function Dashboard() {
  // `null` while the flag is still being read from the database.
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AppDataService.get(AppDataKey.OnboardingCompleted)
      .then((value) => {
        if (!cancelled) setOnboardingCompleted(value === 'true');
      })
      .catch((error) => {
        // If the flag can't be read, fall back to the intro rather than hanging
        // on a blank screen — an unset (fresh) database looks the same anyway.
        console.error('Could not read onboarding status:', error);
        if (!cancelled) setOnboardingCompleted(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Explicit import checkpoints always resume; the optional full folder check
  // remains a separate user preference.
  useEffect(() => {
    if (!onboardingCompleted) return;
    void recoverIncompleteImports()
      .catch(() => {
        // The process center already reported the failure; checkpoints remain.
      })
      .then(() => {
        if (!startStartupFolderCheck()) startBackgroundIndexing();
      });
    startAutoUpdateCheck();
  }, [onboardingCompleted]);

  useEffect(() => listenForAppUpdateInstallRequests(), []);

  useEffect(() => {
    const shutdown = () => shutdownExiftoolSession();
    window.addEventListener('beforeunload', shutdown);
    return () => {
      window.removeEventListener('beforeunload', shutdown);
    };
  }, []);

  // Still reading the flag: render nothing to avoid flashing the app shell
  // before we know whether to send the user to the intro.
  if (onboardingCompleted === null) {
    return null;
  }

  // First launch (or after a database wipe): send the user through the intro.
  if (!onboardingCompleted) {
    return <Navigate to={AppRoutes.onboarding} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default Dashboard;
