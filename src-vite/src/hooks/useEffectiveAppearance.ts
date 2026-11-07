import { useSyncExternalStore } from 'react';
import { Appearance, getResolvedAppearance } from '../utils/theme';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const noop = () => () => {};

function _subscribeToColorScheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
}

export function useEffectiveAppearance(appearance: Appearance): Appearance.Light | Appearance.Dark {
  return useSyncExternalStore(
    appearance === Appearance.System ? _subscribeToColorScheme : noop,
    () => getResolvedAppearance(appearance),
    () => (appearance === Appearance.System ? Appearance.Light : appearance),
  );
}
