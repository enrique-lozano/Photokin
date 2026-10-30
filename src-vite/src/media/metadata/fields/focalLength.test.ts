import { describe, expect, it } from 'vitest';
import { formatFocalLength } from './focalLength';

describe('formatFocalLength', () => {
  it('rounds the number while keeping the printed unit', () => {
    expect(formatFocalLength('4.7568284600108 mm')).toBe('4.8 mm');
    expect(formatFocalLength('50.0 mm')).toBe('50 mm');
  });

  it('leaves already tidy values alone', () => {
    expect(formatFocalLength('5 mm')).toBe('5 mm');
    expect(formatFocalLength(' 35 mm ')).toBe('35 mm');
  });

  it('passes through values that do not start with a number', () => {
    expect(formatFocalLength('n/a')).toBe('n/a');
  });

  it('returns null for missing or empty values', () => {
    expect(formatFocalLength(null)).toBeNull();
    expect(formatFocalLength(undefined)).toBeNull();
    expect(formatFocalLength('   ')).toBeNull();
  });
});
