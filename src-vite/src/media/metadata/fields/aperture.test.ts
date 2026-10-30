import { describe, expect, it } from 'vitest';
import { formatAperture } from './aperture';

describe('formatAperture', () => {
  it('rounds APEX conversion tails to one decimal', () => {
    expect(formatAperture(4.7568284600108)).toBe('f/4.8');
    expect(formatAperture(1.7999999523162842)).toBe('f/1.8');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatAperture(2)).toBe('f/2');
    expect(formatAperture(4.02)).toBe('f/4');
  });

  it('shows whole stops from f/10 up', () => {
    expect(formatAperture(11.313708498985)).toBe('f/11');
    expect(formatAperture(22)).toBe('f/22');
  });

  it('returns null for missing or nonsensical values', () => {
    expect(formatAperture(null)).toBeNull();
    expect(formatAperture(undefined)).toBeNull();
    expect(formatAperture(0)).toBeNull();
    expect(formatAperture(Number.NaN)).toBeNull();
  });
});
