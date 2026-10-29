import { normalizeCountryCode } from '@/media/metadata/location/countryCode';
import * as Flags from 'country-flag-icons/react/3x2';

import type { JSX } from 'react';

type FlagComponent = (props: { className?: string; title?: string }) => JSX.Element;

const FLAGS = Flags as unknown as Record<string, FlagComponent | undefined>;

interface CountryFlagProps {
  /** Any ISO 3166-1 code (alpha-2/alpha-3); normalized to alpha-2 internally. */
  code: string | null | undefined;
  className?: string;
}

/**
 * Renders the SVG flag for a country code via `country-flag-icons`. Unlike the
 * regional-indicator emoji flags, these render consistently on every platform
 * (notably Windows, where emoji flags fall back to letter pairs). Returns
 * `null` for a missing or unrecognized code so callers can lay out without it.
 * The flag's accessible title is the code, so screen readers announce it.
 */
export function CountryFlag({ code, className }: CountryFlagProps) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  const Flag = FLAGS[normalized];
  if (!Flag) return null;

  return <Flag className={className} title={normalized} />;
}
