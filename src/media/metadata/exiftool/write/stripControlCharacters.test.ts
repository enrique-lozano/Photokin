import { describe, expect, it } from 'vitest';
import { stripControlCharacters } from './stripControlCharacters';

describe('stripControlCharacters', () => {
  it('removes ASCII control characters', () => {
    expect(stripControlCharacters(' hel\nlo\t')).toBe(' hello');
    expect(stripControlCharacters('a\r\nb')).toBe('ab');
    expect(stripControlCharacters('del\x7f')).toBe('del');
  });

  it('preserves normal text', () => {
    expect(stripControlCharacters('People/Alejandro López')).toBe('People/Alejandro López');
  });
});
