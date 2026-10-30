import { IconLoader2, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { isSmartSearchIndexPending } from '@/media/smartSearch/indexing';
import { isModelDownloaded } from '@/media/smartSearch/models';
import { useProcessStore } from '@/stores/processStore';
import { SettingsTab } from '@/stores/settingsStore';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { openSettingsWindow } from '@/utils/openSettingsWindow';
import './smartSearchHint.css';

/**
 * Subtle nudge shown in search results while no CLIP model is downloaded: name
 * and tag matching still works, but semantic search stays off until a model
 * exists. Clicking opens Settings on the model list. With a model, it instead
 * notes when the index is still being built, so thin results aren't final.
 */
export function SmartSearchHint() {
  const activeModel = useSmartSearchSettingsStore((state) => state.activeModel);
  const [modelReady, setModelReady] = useState(true);
  const indexPending = useProcessStore((state) => state.processes.some(isSmartSearchIndexPending));

  useEffect(() => {
    let cancelled = false;
    void isModelDownloaded(activeModel).then((ready) => {
      if (!cancelled) setModelReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [activeModel]);

  if (modelReady) {
    return indexPending ? (
      <p className="smart-search-hint smart-search-hint--static" role="status">
        <IconLoader2 size={16} className="smart-search-hint__icon motion-safe:animate-spin" />
        <span>Smart search is still indexing your photos. Results will improve as it finishes.</span>
      </p>
    ) : null;
  }

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
