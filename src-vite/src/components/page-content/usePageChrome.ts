import { useLayoutEffect, useMemo } from 'react';
import {
  GlobalFiltersState,
  PageChrome,
  PageContentKind,
  PageFooterStatus,
  useAppStore,
} from '@/stores/appState';

/**
 * Declares what the page shows so the shell (footer, filter button, filter
 * strip) only renders controls that apply. Layout effects keep the previous
 * page's chrome from flashing for a frame. Memoize `status` when it is derived.
 */
export function usePageChrome(
  kind: PageContentKind,
  status?: PageFooterStatus,
  globalFilters?: GlobalFiltersState,
): void {
  const setPageChrome = useAppStore((state) => state.setPageChrome);

  useLayoutEffect(() => {
    setPageChrome({ kind, status, globalFilters });
  }, [kind, status, globalFilters, setPageChrome]);

  useLayoutEffect(() => () => setPageChrome(null), [setPageChrome]);
}

/** A stable "N items" readout for pages that just count what they list; none while loading. */
export function useCountStatus(
  count: number | null | undefined,
  singular: string,
  plural: string,
): PageFooterStatus | undefined {
  return useMemo(
    () =>
      count === null || count === undefined
        ? undefined
        : { summary: `${count.toLocaleString()} ${count === 1 ? singular : plural}` },
    [count, singular, plural],
  );
}

export function getGlobalFiltersState(chrome: PageChrome | null): GlobalFiltersState {
  if (!chrome) return 'none';
  return chrome.globalFilters ?? (chrome.kind === 'photos' || chrome.kind === 'stats' ? 'applied' : 'none');
}
