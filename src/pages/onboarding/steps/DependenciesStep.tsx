import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { openContainingFolder } from '@/system/diskManager';
import { installExiftool, locateExiftool, type ExiftoolInstallProgress } from '@/system/exiftoolSetup';
import { useDependencyStatus } from '@/system/useDependencyStatus';
import { PhotokinMark } from '@/components/brand/PhotokinMark';
import { IconArrowRight } from '@tabler/icons-react';
import { isTauri } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { useState } from 'react';
import { OnboardingHeading, OnboardingStep, OnboardingStepProps } from '../OnboardingStep';
import { ExiftoolSetupCard, type ExiftoolSetupStatus } from './ExiftoolSetupCard';

// Guarded so the UI kit can import this outside Tauri.
const CAN_AUTO_INSTALL = isTauri() && platform() === 'windows';

export function DependenciesStep({ goNext }: OnboardingStepProps) {
  const { dependencies, isLoading, error, reload } = useDependencyStatus();
  const [operation, setOperation] = useState<'installing' | 'locating' | null>(null);
  const [progress, setProgress] = useState<ExiftoolInstallProgress | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [retryOperation, setRetryOperation] = useState<'installing' | 'locating'>('installing');
  const dependency = dependencies.find((dependency) => dependency.id === 'exiftool');
  const setupError = operationError ?? error;
  const busy = isLoading || operation !== null;
  const status: ExiftoolSetupStatus =
    operation === 'installing'
      ? 'installing'
      : busy
        ? 'checking'
        : setupError
          ? 'error'
          : dependency?.available
            ? 'ready'
            : 'missing';

  const install = async () => {
    setOperation('installing');
    setRetryOperation('installing');
    setOperationError(null);
    setProgress({ stage: 'downloading', version: null, percent: null });
    try {
      await installExiftool(setProgress);
      reload();
    } catch (caught) {
      const message = `Could not install ExifTool: ${String(caught)}`;
      setOperationError(message);
      toast.error(message);
    } finally {
      setOperation(null);
    }
  };

  const locate = async () => {
    setOperation('locating');
    setRetryOperation('locating');
    setOperationError(null);
    try {
      if (await locateExiftool()) reload();
    } catch (caught) {
      const message = `Could not use that file: ${String(caught)}`;
      setOperationError(message);
      toast.error(message);
    } finally {
      setOperation(null);
    }
  };

  const openFolder = async () => {
    if (!dependency?.location) return;
    try {
      await openContainingFolder(dependency.location);
    } catch (caught) {
      toast.error(`Could not open the ExifTool folder: ${String(caught)}`);
    }
  };

  const retry = () => {
    if (operationError) {
      if (retryOperation === 'locating') void locate();
      else void install();
    } else {
      reload();
    }
  };

  return (
    <OnboardingStep
      start={<p className="onboarding__hint">Everything stays on this computer.</p>}
      end={
        <Button onClick={goNext} disabled={busy}>
          Continue <IconArrowRight size={16} />
        </Button>
      }
    >
      <OnboardingHeading
        icon={<PhotokinMark size={32} />}
        title="Welcome to Photokin"
        subtitle="Browse your photo collection, organize it with albums and tags, and find photos by people, places, or what's in them."
      />
      <div className="onboarding__dependencies">
        <ExiftoolSetupCard
          status={status}
          dependency={dependency}
          progress={progress}
          error={setupError}
          canAutoInstall={CAN_AUTO_INSTALL}
          onInstall={() => void install()}
          onLocate={() => void locate()}
          onRetry={retry}
          onOpenFolder={() => void openFolder()}
        />
      </div>
    </OnboardingStep>
  );
}
