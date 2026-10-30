import { locale as osLocale } from '@tauri-apps/plugin-os';
import { setAppLocale } from '@/media/metadata/location/countryCode';

const STORAGE_KEY = 'app-locale';

/**
 * Resolves the user's language from the operating system and makes it the
 * app-wide locale for localized display names (currently country names).
 *
 * In Tauri the OS locale is the reliable source: WebView2's `navigator.language`
 * frequently reports `en-US` regardless of the system language. Best-effort — on
 * any failure we keep the existing navigator/persisted fallback. The value is
 * also persisted so the next launch has it synchronously before this resolves.
 */
export async function initAppLocale(): Promise<void> {
  // Dev builds can pin the locale (used by `pnpm screenshots`).
  const pinned = import.meta.env.DEV ? import.meta.env.VITE_PHOTOKIN_LOCALE : undefined;
  try {
    const loc = pinned || (await osLocale());
    if (!loc) return;
    setAppLocale(loc);
    try {
      localStorage.setItem(STORAGE_KEY, loc);
    } catch {
      /* localStorage may be unavailable; the in-memory override still applies. */
    }
  } catch {
    /* keep the navigator/persisted fallback. */
  }
}
