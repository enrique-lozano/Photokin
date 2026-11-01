import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isModelDownloaded } from '@/media/smartSearch/models';
import { useModelDownloads } from '@/media/smartSearch/modelDownload';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { SettingsTab } from '@/stores/settingsStore';
import { openSettingsWindow } from '@/utils/openSettingsWindow';

export const SEARCH_EXAMPLES = [
  'Describe a photo: dog on the beach',
  'Describe a photo: sunset over snowy mountains',
  'Describe a photo: people around a birthday cake',
] as const;

export function useSearchAvailability(focused: boolean) {
  const model = useSmartSearchSettingsStore((state) => state.activeModel);
  const revision = useModelDownloads((state) => state.revision);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; ready: boolean; error: string | null } | null>(null);
  const key = `${model}\0${revision}\0${retry}`;
  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    void isModelDownloaded(model)
      .then((ready) => {
        if (!cancelled) setResult({ key, ready, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            key,
            ready: false,
            error: `Couldn't check smart search: ${error instanceof Error ? error.message : String(error)}`,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [focused, key]);
  return {
    ready: result?.key === key && result.ready,
    loading: result?.key !== key,
    error: result?.key === key ? result.error : null,
    retry: () => setRetry((value) => value + 1),
  };
}

export function SearchExamplePlaceholder() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(interval);
      if (!motion.matches) interval = setInterval(() => setIndex((value) => value + 1), 4000);
    };
    update();
    motion.addEventListener('change', update);
    return () => {
      clearInterval(interval);
      motion.removeEventListener('change', update);
    };
  }, []);
  return (
    <span className="toolbar-searchbar__example" aria-hidden="true">
      {index > 0 && (
        <span key={`out-${index}`} className="toolbar-searchbar__example-line is-outgoing">
          {SEARCH_EXAMPLES[(index - 1) % SEARCH_EXAMPLES.length]}
        </span>
      )}
      <span
        key={`in-${index}`}
        className={`toolbar-searchbar__example-line${index > 0 ? ' is-incoming' : ''}`}
      >
        {SEARCH_EXAMPLES[index % SEARCH_EXAMPLES.length]}
      </span>
    </span>
  );
}

export function SearchDiscovery({ ready, loading, error, retry }: ReturnType<typeof useSearchAvailability>) {
  return (
    <div className="toolbar-searchbar__discovery">
      <IconSparkles size={16} aria-hidden="true" />
      <div>
        <strong>{ready ? "Search by what's in your photos" : 'Search names, people and tags'}</strong>
        <p>
          {ready
            ? 'AI-powered, on your device. Or choose a filter below.'
            : loading
              ? 'Checking smart search availability...'
              : (error ?? 'Enable smart search to find photos by describing them.')}
        </p>
        {error ? (
          <Button variant="link" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={retry}>
            Retry
          </Button>
        ) : (
          !loading &&
          !ready && (
            <Button
              variant="link"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void openSettingsWindow(SettingsTab.System)}
            >
              Enable smart search
            </Button>
          )
        )}
      </div>
    </div>
  );
}
