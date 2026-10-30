import { describe, expect, it } from 'vitest';
import { countryNameFromCode, normalizeCountryCode } from './countryCode';

describe('normalizeCountryCode', () => {
  it('keeps valid alpha-2 codes, upper-cased', () => {
    expect(normalizeCountryCode('es')).toBe('ES');
    expect(normalizeCountryCode('GB')).toBe('GB');
    expect(normalizeCountryCode('  it  ')).toBe('IT');
  });

  it('converts alpha-3 codes to alpha-2', () => {
    expect(normalizeCountryCode('ESP')).toBe('ES');
    expect(normalizeCountryCode('gbr')).toBe('GB');
    expect(normalizeCountryCode('USA')).toBe('US');
    expect(normalizeCountryCode('DEU')).toBe('DE');
  });

  it('rejects empty, unknown or malformed input', () => {
    expect(normalizeCountryCode(null)).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
    expect(normalizeCountryCode('ZZ')).toBeNull();
    expect(normalizeCountryCode('XXX')).toBeNull();
    expect(normalizeCountryCode('Spain')).toBeNull();
  });
});

describe('countryNameFromCode', () => {
  it('resolves a localized country name from a code', () => {
    expect(countryNameFromCode('ES', 'en')).toBe('Spain');
    expect(countryNameFromCode('GB', 'en')).toBe('United Kingdom');
    expect(countryNameFromCode('gbr', 'en')).toBe('United Kingdom');
    expect(countryNameFromCode('ES', 'es')).toBe('España');
  });

  it('returns null for missing or unrecognized codes', () => {
    expect(countryNameFromCode(null)).toBeNull();
    expect(countryNameFromCode('ZZ')).toBeNull();
  });
});
