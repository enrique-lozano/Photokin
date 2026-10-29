/**
 * Country option list + name→code resolution for the location editor.
 *
 * The canonical dataset comes from `country-codes-list`; display names are
 * localized through `Intl.DisplayNames` (falling back to the dataset's English
 * name). This powers a "loosely constrained" country field: the user still types
 * free text, but a `<datalist>` suggests real countries and a match back-fills
 * the ISO code so grouping and flags light up.
 */
import { customList } from 'country-codes-list';
import { countryNameFromCode, getCurrentLocale, normalizeCountryCode } from './countryCode';

export interface CountryOption {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Localized display name (English fallback). */
  name: string;
}

/** alpha-2 → English name, straight from the dataset. */
const ENGLISH_NAMES: Record<string, string> = customList('countryCode', '{countryNameEn}');

// Localized structures are built lazily and cached per locale: the real locale
// is only known after startup resolves the OS locale, so building at import time
// would freeze the wrong language.
const _optionsByLocale = new Map<string, readonly CountryOption[]>();
const _codeByNameByLocale = new Map<string, Map<string, string>>();

/**
 * All countries as `{ code, name }`, localized to `locale` (defaulting to the
 * app locale) and sorted by name. Memoized per locale; safe to render directly.
 */
export function getCountryOptions(locale: string = getCurrentLocale()): readonly CountryOption[] {
  const cached = _optionsByLocale.get(locale);
  if (cached) return cached;

  const options = Object.entries(ENGLISH_NAMES)
    .map(([code, englishName]) => ({ code, name: countryNameFromCode(code, locale) ?? englishName }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  _optionsByLocale.set(locale, options);
  return options;
}

/** Casefolded name (localized + English) → alpha-2, memoized per locale. */
function _codeByName(locale: string): Map<string, string> {
  const cached = _codeByNameByLocale.get(locale);
  if (cached) return cached;

  const map = new Map<string, string>();
  const put = (name: string | null | undefined, code: string) => {
    const key = name?.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, code);
  };
  for (const { code, name } of getCountryOptions(locale)) {
    put(name, code);
    // English is always accepted so a value/typing in English resolves in any UI
    // language. Two spellings: the Intl name (e.g. "United States") and the
    // dataset's official name (e.g. "United States of America").
    put(countryNameFromCode(code, 'en'), code);
    put(ENGLISH_NAMES[code], code);
  }
  _codeByNameByLocale.set(locale, map);
  return map;
}

/**
 * Resolves a free-text country entry to its alpha-2 code, or `null` when it
 * doesn't match a known country. Accepts an ISO code directly (e.g. "ES", "esp")
 * or a country name in the given locale or English ("Spain" / "España").
 */
export function countryCodeFromName(
  value: string | null | undefined,
  locale: string = getCurrentLocale(),
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return normalizeCountryCode(trimmed) ?? _codeByName(locale).get(trimmed.toLowerCase()) ?? null;
}
