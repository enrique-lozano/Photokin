import { SettingsPageHeader } from '@/components/settings/SettingsRow';
import { SmartSearchModelsCard } from '@/components/smart-search/SmartSearchModelsCard';

export function SettingsModels() {
  return (
    <>
      <SettingsPageHeader
        title="Smart search models"
        description="Changing models rebuilds the search index on this device."
      />
      <SmartSearchModelsCard />
    </>
  );
}
