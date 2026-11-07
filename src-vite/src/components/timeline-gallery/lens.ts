import { useAppStore } from '@/stores/appState';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCallback, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/** How a photo list is looked at. Never changes which photos it contains. */
export type Lens = 'grid' | 'list' | 'map' | 'faces';

export const LENSES: Lens[] = ['grid', 'list', 'map', 'faces'];

export const LENS_PARAM = 'lens';

export function parseLens(value: string | null | undefined): Lens | null {
  return LENSES.find((lens) => lens === value) ?? null;
}

/**
 * The active lens of the current list. The URL (`?lens=list`, omitted for
 * Grid) is the source of truth so views are linkable and Back/Forward work.
 * On arrival without a lens, the one last used on this list is restored.
 */
export function useLens(): { lens: Lens; setLens: (lens: Lens) => void } {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const rememberLens = useSettingsStore((state) => state.setListLens);
  const urlLens = parseLens(params.get(LENS_PARAM));

  useEffect(() => {
    if (urlLens) return;
    const stored = parseLens(useSettingsStore.getState().lensByList[pathname]);
    if (!stored || stored === 'grid') return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(LENS_PARAM, stored);
        return next;
      },
      { replace: true },
    );
    // Only on arrival at a list; later lens-less URLs (Back to Grid) must stay Grid.
  }, [pathname]);

  const setLens = useCallback(
    (lens: Lens) => {
      rememberLens(pathname, lens);
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (lens === 'grid') next.delete(LENS_PARAM);
        else next.set(LENS_PARAM, lens);
        return next;
      });
    },
    [pathname, rememberLens, setParams],
  );

  return { lens: urlLens ?? 'grid', setLens };
}

/** The lens actually shown: one unavailable for this list falls back to Grid. */
export function useEffectiveLens(): { lens: Lens; requested: Lens; setLens: (lens: Lens) => void } {
  const { lens: requested, setLens } = useLens();
  const mapLensAvailable = useAppStore((state) => state.mapLensAvailable);
  const facesLensAvailable = useAppStore((state) => state.facesLensAvailable);
  // A lens that doesn't apply to this list (no locations, not a person page) falls back to Grid.
  const unavailable =
    (requested === 'map' && mapLensAvailable === false) || (requested === 'faces' && !facesLensAvailable);
  const lens: Lens = unavailable ? 'grid' : requested;
  return { lens, requested, setLens };
}
