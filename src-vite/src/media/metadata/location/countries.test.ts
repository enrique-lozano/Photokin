import { describe, expect, it } from 'vitest';
import { countryCodeFromName, getCountryOptions } from './countries';

describe('countryCodeFromName', () => {
  it('resolves ISO codes regardless of case or length', () => {
    expect(countryCodeFromName('ES')).toBe('ES');
    expect(countryCodeFromName('esp')).toBe('ES');
    expect(countryCodeFromName('  gb ')).toBe('GB');
    expect(countryCodeFromName('USA')).toBe('US');
  });

  it('resolves country names (English, any case)', () => {
    expect(countryCodeFromName('Spain')).toBe('ES');
    expect(countryCodeFromName('spain')).toBe('ES');
    // Both the Intl spelling and the dataset's official name resolve.
    expect(countryCodeFromName('United States')).toBe('US');
    expect(countryCodeFromName('United States of America')).toBe('US');
    // English still resolves even when the UI locale is not English.
    expect(countryCodeFromName('United States', 'es')).toBe('US');
  });

  it('resolves localized country names for the given locale', () => {
    expect(countryCodeFromName('España', 'es')).toBe('ES');
    expect(countryCodeFromName('Alemania', 'es')).toBe('DE');
    // English still resolves even when a non-English locale is requested.
    expect(countryCodeFromName('Germany', 'es')).toBe('DE');
  });

  it('returns null for empty input or unknown free text', () => {
    expect(countryCodeFromName(null)).toBeNull();
    expect(countryCodeFromName('')).toBeNull();
    expect(countryCodeFromName('   ')).toBeNull();
    expect(countryCodeFromName('Middle Earth')).toBeNull();
  });
});

describe('getCountryOptions', () => {
  it('lists real countries with alpha-2 codes, sorted by name', () => {
    const options = getCountryOptions('en');
    expect(options.length).toBeGreaterThan(150);
    expect(options.every((option) => /^[A-Z]{2}$/.test(option.code))).toBe(true);
    expect(options.some((option) => option.code === 'ES')).toBe(true);

    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('localizes names to the requested locale', () => {
    const spanish = getCountryOptions('es');
    expect(spanish.find((option) => option.code === 'ES')?.name).toBe('España');
    expect(spanish.find((option) => option.code === 'DE')?.name).toBe('Alemania');
  });
});
