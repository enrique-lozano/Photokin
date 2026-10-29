import { useCallback, useEffect, useState } from 'react';
import { ExternalDependencyStatus, getExternalDependencyStatus } from './dependencyStatus';

type DependencyStatusState = {
  dependencies: ExternalDependencyStatus[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
};

/** Loads the external-dependency diagnostics, exposing a `reload` for re-checks. */
export function useDependencyStatus(): DependencyStatusState {
  const [dependencies, setDependencies] = useState<ExternalDependencyStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getExternalDependencyStatus()
      .then((result) => {
        if (!cancelled) setDependencies(result);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setDependencies([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { dependencies, isLoading, error, reload };
}
