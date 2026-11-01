import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem,
    removeItem: (key: string) => values.delete(key),
  });
  return { values, setItem };
});

vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
import { toast } from '@/components/ui/toast';
import { useRecentSearchesStore } from './recentSearchesStore';

beforeEach(() => {
  storage.setItem.mockClear();
  useRecentSearchesStore.getState().clear();
  vi.mocked(toast.error).mockClear();
});

describe('recent searches', () => {
  it('records trimmed non-empty submissions, newest first, without altering query syntax', () => {
    const { record } = useRecentSearchesStore.getState();
    record(' ');
    record('person:"Ana Lopez"  rating>=4');
    record('  beach  ');
    expect(useRecentSearchesStore.getState().queries).toEqual(['beach', 'person:"Ana Lopez"  rating>=4']);
  });

  it('moves repeated queries to the top without duplicates', () => {
    const { record } = useRecentSearchesStore.getState();
    record('beach');
    record('mountains');
    record(' beach ');
    expect(useRecentSearchesStore.getState().queries).toEqual(['beach', 'mountains']);
  });

  it('retains exactly 20 queries, discarding the oldest', () => {
    for (let i = 0; i < 25; i++) useRecentSearchesStore.getState().record(`query ${i}`);
    const { queries } = useRecentSearchesStore.getState();
    expect(queries).toHaveLength(20);
    expect(queries[0]).toBe('query 24');
    expect(queries[19]).toBe('query 5');
  });

  it('persists query text only and restores it across hydration', async () => {
    useRecentSearchesStore.getState().record('rating>=4 beach');
    const saved = storage.values.get('photokin-recent-searches')!;
    expect(JSON.parse(saved)).toEqual({ state: { queries: ['rating>=4 beach'] }, version: 1 });
    useRecentSearchesStore.getState().clear();
    storage.values.set('photokin-recent-searches', saved);
    await useRecentSearchesStore.persist.rehydrate();
    expect(useRecentSearchesStore.getState().queries).toEqual(['rating>=4 beach']);
  });

  it('removes a single query and clears all retained queries persistently', async () => {
    const { record, remove, clear } = useRecentSearchesStore.getState();
    record('beach');
    record('mountains');
    remove('beach');
    await useRecentSearchesStore.persist.rehydrate();
    expect(useRecentSearchesStore.getState().queries).toEqual(['mountains']);
    clear();
    await useRecentSearchesStore.persist.rehydrate();
    expect(useRecentSearchesStore.getState().queries).toEqual([]);
  });

  it('reports malformed saved history instead of letting it break the search bar', async () => {
    storage.values.set('photokin-recent-searches', '{"state":{"queries":[42]},"version":1}');
    await useRecentSearchesStore.persist.rehydrate();
    expect(useRecentSearchesStore.getState().queries).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Could not load recent searches.');
  });

  it('reports storage failures without blocking a search or history removal', () => {
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('Storage full');
    });
    expect(() => useRecentSearchesStore.getState().record('beach')).not.toThrow();
    expect(useRecentSearchesStore.getState().queries).toEqual(['beach']);
    expect(toast.error).toHaveBeenCalledWith(
      'Could not save recent searches. History changes will not survive restarting Photokin.',
    );
  });
});
