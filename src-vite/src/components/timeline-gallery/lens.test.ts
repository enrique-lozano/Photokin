import { useSettingsStore } from '@/stores/settingsStore';
import { describe, expect, it } from 'vitest';
import { parseLens } from './lens';

describe('parseLens', () => {
  it('accepts known lenses and rejects anything else', () => {
    expect(parseLens('strips')).toBe('strips');
    expect(parseLens('map')).toBe('map');
    expect(parseLens('calendar')).toBeNull();
    expect(parseLens(null)).toBeNull();
  });
});

describe('setListLens', () => {
  it('remembers non-grid lenses per list and forgets grid', () => {
    const { setListLens } = useSettingsStore.getState();
    setListLens('/tags/1', 'list');
    expect(useSettingsStore.getState().lensByList['/tags/1']).toBe('list');
    setListLens('/tags/1', 'grid');
    expect(useSettingsStore.getState().lensByList['/tags/1']).toBeUndefined();
  });
});
