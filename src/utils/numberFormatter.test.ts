import { describe, expect, it } from 'vitest';
import { roundTo } from './numberFormatter';

describe('roundTo', () => {
  it('rounds to the requested number of decimals', () => {
    expect(roundTo(4.7568284600108, 1)).toBe(4.8);
    expect(roundTo(11.313708498985, 0)).toBe(11);
    expect(roundTo(1.2345, 2)).toBe(1.23);
  });

  it('drops trailing zeros when coerced to a string', () => {
    expect(String(roundTo(50.0, 1))).toBe('50');
    expect(String(roundTo(4.02, 1))).toBe('4');
  });
});
