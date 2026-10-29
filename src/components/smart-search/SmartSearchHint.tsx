import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { isModelDownloaded } from '@/media/smartSearch/models';
import { SettingsTab } from '@/stores/settingsStore';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { openSettingsWindow } from '@/utils/openSettingsWindow';
import './smartSearchHint.css';

/**
 * Subtle nudge shown in search results while no CLIP model is downloaded: name
 * and tag matching still works, but semantic search stays off until a model
 * exists. Clicking opens Settings on the model list.
 */
export function SmartSearchHint() {
  const activeModel = useSmartSearchSettingsStore((state) => state.activeModel);
  const [modelReady, setModelReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void isModelDownloaded(activeModel).then((ready) => {
      if (!cancelled) setModelReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [activeModel]);

  if (modelReady) return null;

  return (
    <button
      type="button"
      className="smart-search-hint"
      onClick={() => void openSettingsWindow(SettingsTab.System)}
    >
      <IconSparkles size={16} className="smart-search-hint__icon" />
      <span>
        Showing name and tag matches. <strong>Enable smart search</strong> to find photos by what&apos;s in
        them.
      </span>
    </button>
  );
}
