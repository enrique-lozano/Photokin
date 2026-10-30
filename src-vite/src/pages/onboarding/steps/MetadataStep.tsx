import { MetadataMode } from '@/common/metadataOptions';
import { ResyncMode } from '@/common/resyncOptions';
import { SettingsRadioCard } from '@/components/settings/SettingsRadioCard';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconArrowRight, IconFileText, IconFlask, IconShieldCheck } from '@tabler/icons-react';
import { emit } from '@tauri-apps/api/event';
import { OnboardingHeading, OnboardingStep, OnboardingStepProps } from '../OnboardingStep';

const METADATA_CHOICES = [
  {
    value: MetadataMode.ReadOnly,
    label: 'Library only',
    description:
      'Metadata changes are saved only in Photokin’s library, without writing them to your photo files.',
    bestFor: 'trying the app out, or if you don’t have a backup of your photos yet.',
    bestForIcon: IconFlask,
  },
  {
    value: MetadataMode.Full,
    label: 'Library and photo files',
    description:
      'Photokin also writes tags, ratings, titles, descriptions and locations into each photo’s metadata (EXIF, IPTC, XMP), so other apps can read them.',
    bestFor: 'everyday use, once your photos are backed up.',
    bestForIcon: IconShieldCheck,
  },
] as const;

export function MetadataStep({ goNext, goBack }: OnboardingStepProps) {
  const metadataMode = useSettingsStore((state) => state.metadataMode);

  const selectMode = (nextMode: MetadataMode) => {
    const store = useSettingsStore.getState();
    store.setMetadataMode(nextMode);
    void emit('settings-metadataMode-changed', nextMode);

    const nextResync = nextMode === MetadataMode.ReadOnly ? ResyncMode.Off : ResyncMode.Mtime;
    store.setResyncMode(nextResync);
    void emit('settings-resyncMode-changed', nextResync);
  };

  return (
    <OnboardingStep
      start={<p className="onboarding__hint">You can change this any time in Settings → Metadata.</p>}
      onBack={goBack}
      end={
        <Button onClick={goNext}>
          Continue <IconArrowRight size={16} />
        </Button>
      }
    >
      <OnboardingHeading
        icon={<IconFileText size={30} />}
        title="Where should metadata changes be saved?"
        subtitle="Each photo file stores details such as its date, place and camera, known as metadata. Choose whether your edits to them (tags, ratings, dates…) stay in Photokin or are also saved into the files."
      />

      <div className="onboarding__metadata-choices" role="radiogroup" aria-label="File metadata mode">
        {METADATA_CHOICES.map((option) => {
          const isSelected = option.value === metadataMode;
          const BestForIcon = option.bestForIcon;
          return (
            <SettingsRadioCard
              key={option.value}
              name="onboarding-metadata-mode"
              value={option.value}
              checked={isSelected}
              onChange={() => selectMode(option.value)}
            >
              <div className="settings-radio-card__header">
                <span className="settings-radio-card__title">{option.label}</span>
              </div>

              <div className="settings-radio-card__content">
                <p className="settings-radio-card__description">{option.description}</p>
                <p className="settings-radio-card__best-for">
                  <span className="settings-radio-card__best-for-icon" aria-hidden="true">
                    <BestForIcon size={14} />
                  </span>
                  <span>
                    <strong className="font-semibold text-foreground">Best for</strong> {option.bestFor}
                  </span>
                </p>
              </div>
            </SettingsRadioCard>
          );
        })}
      </div>
    </OnboardingStep>
  );
}
