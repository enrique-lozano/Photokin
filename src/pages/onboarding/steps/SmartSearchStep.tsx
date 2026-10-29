import { Segmented } from '@/components/segmented/Segmented';
import { SettingsRadioCard } from '@/components/settings/SettingsRadioCard';
import { ModelRatings } from '@/components/smart-search/ModelRatings';
import { modelDisplay, SmartSearchModelsCard } from '@/components/smart-search/SmartSearchModelsCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { startBackgroundIndexing } from '@/media/smartSearch/indexing';
import { downloadModel } from '@/media/smartSearch/modelDownload';
import { CLIP_MODELS, formatModelSize, isModelDownloaded } from '@/media/smartSearch/models';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { IconArrowRight, IconCheck, IconDownload } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingHeading, OnboardingStep, OnboardingStepProps } from '../OnboardingStep';
import { getRecommendedModelId, MODEL_PICKS, ModelLanguage } from './modelPicks';

const LANGUAGE_OPTIONS: { value: ModelLanguage; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'multilingual', label: 'Multilingual' },
];

export function SmartSearchStep({ goNext, goBack }: OnboardingStepProps) {
  const setActiveModel = useSmartSearchSettingsStore((state) => state.setActiveModel);
  const [language, setLanguage] = useState<ModelLanguage>('english');
  const [selectedId, setSelectedId] = useState(getRecommendedModelId('english'));
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
  const isSelectedDownloaded = downloadedIds.includes(selectedId);

  const refreshDownloaded = useCallback(async () => {
    const checks = await Promise.all(
      CLIP_MODELS.map(async (model) => ((await isModelDownloaded(model.id)) ? model.id : null)),
    );
    setDownloadedIds(checks.filter((id) => id !== null));
  }, []);

  useEffect(() => {
    void refreshDownloaded();
  }, [refreshDownloaded]);

  const changeLanguage = (next: ModelLanguage) => {
    setLanguage(next);
    setSelectedId(getRecommendedModelId(next));
  };

  // The transfer runs in the background and outlives this screen.
  const downloadAndContinue = () => {
    setActiveModel(selectedId);
    if (isSelectedDownloaded) {
      startBackgroundIndexing();
      goNext();
      return;
    }
    downloadModel(selectedId)
      .then((result) => {
        if (result.status === 'completed') startBackgroundIndexing();
      })
      .catch((error) => toast.error(`Could not download the model: ${String(error)}`));
    goNext();
  };

  return (
    <OnboardingStep
      start={
        <Button variant="ghost" onClick={goNext}>
          Skip · only name and tag search
        </Button>
      }
      onBack={goBack}
      end={
        <Button onClick={downloadAndContinue}>
          {isSelectedDownloaded ? 'Continue' : 'Download & continue'} <IconArrowRight size={16} />
        </Button>
      }
    >
      <OnboardingHeading
        title="Search your photos by what's in them"
        subtitle={
          'Find photos with descriptions like "sunset at the beach" or "a red bicycle." Download a search model to process photos on your computer, without uploading them.'
        }
      />
      <Segmented
        options={LANGUAGE_OPTIONS}
        value={language}
        onChange={changeLanguage}
        ariaLabel="Search language"
      />
      <div className="onboarding__tiers" role="radiogroup" aria-label="Smart search model">
        {MODEL_PICKS[language].map((pick) => {
          const model = CLIP_MODELS.find((candidate) => candidate.id === pick.modelId);
          if (!model) return null;
          const selected = pick.modelId === selectedId;
          return (
            <SettingsRadioCard
              key={pick.modelId}
              name="onboarding-search-model"
              value={pick.modelId}
              checked={selected}
              onChange={() => setSelectedId(pick.modelId)}
            >
              <div className="settings-radio-card__header">
                <span className="settings-radio-card__title">{pick.tier}</span>
                {pick.recommended && <span className="onboarding__model-recommendation">Recommended</span>}
              </div>
              <span className="settings-radio-card__description">{modelDisplay(model).name}</span>
              <ModelRatings model={model} />
              <p className="settings-radio-card__description">{pick.note}</p>
              <span className="onboarding__model-status">
                {downloadedIds.includes(pick.modelId) ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <IconCheck size={12} /> Downloaded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <IconDownload size={12} /> Download · {formatModelSize(model)}
                  </span>
                )}
              </span>
            </SettingsRadioCard>
          );
        })}
      </div>
      <Dialog onOpenChange={(open) => !open && void refreshDownloaded()}>
        <DialogTrigger asChild>
          <Button variant="link" size="sm">
            Compare all {CLIP_MODELS.length} models
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[min(90vw,40rem)]">
          <DialogHeader>
            <DialogTitle>Smart search models</DialogTitle>
            <DialogDescription>
              Download or switch models directly. You can change this later in Settings.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <SmartSearchModelsCard />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </OnboardingStep>
  );
}
