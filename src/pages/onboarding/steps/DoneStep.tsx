import { modelDisplay } from '@/components/smart-search/SmartSearchModelsCard';
import { Button } from '@/components/ui/button';
import { CLIP_MODELS, formatModelSize } from '@/media/smartSearch/models';
import { useModelDownloadFraction } from '@/media/smartSearch/useModelDownloadFraction';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { OnboardingHeading, OnboardingStep, OnboardingStepProps } from '../OnboardingStep';

export function DoneStep({ goNext, goBack }: OnboardingStepProps) {
  const activeModelId = useSmartSearchSettingsStore((state) => state.activeModel);
  const fraction = useModelDownloadFraction(activeModelId);
  const model = CLIP_MODELS.find((candidate) => candidate.id === activeModelId);
  const isDownloading = model !== undefined && fraction !== null && fraction < 1;

  return (
    <OnboardingStep
      start={<p className="onboarding__hint">Manage models any time in Settings.</p>}
      onBack={goBack}
      end={
        <Button onClick={goNext}>
          Start using Photokin <IconArrowRight size={16} />
        </Button>
      }
    >
      <OnboardingHeading
        icon={<IconCheck size={30} />}
        title="You're all set"
        subtitle={
          isDownloading
            ? 'Smart search turns on by itself when the download finishes. You can start now.'
            : 'Everything is ready. You can start now.'
        }
      />
      {isDownloading && (
        <div className="onboarding__download">
          <div className="onboarding__download-row">
            <span>{modelDisplay(model).name}</span>
            <span className="onboarding__download-amount">
              {Math.round(fraction * model.sizeMb)} of {formatModelSize(model)}
            </span>
          </div>
          <div className="onboarding__progress">
            <div className="onboarding__progress-fill" style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>
      )}
    </OnboardingStep>
  );
}
