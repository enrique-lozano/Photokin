import type { LightboxNavigationScope } from '@/context/LightboxContext';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { notifyTableUpdate } from '@/db/api/tableObservables';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScopedAssetIds } from './useScopedAssetIds';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  effect: vi.fn(),
  setIds: vi.fn(),
  setSettledKey: vi.fn(),
}));

vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getScopedAssetIds: mocks.query },
}));
vi.mock('react', () => ({
  useEffect: mocks.effect,
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => [initial, Array.isArray(initial) ? mocks.setIds : mocks.setSettledKey],
}));

let cleanup: (() => void) | undefined;

function _mount(scope: LightboxNavigationScope = null, enabled = true) {
  const result = useScopedAssetIds(scope, enabled);
  cleanup = mocks.effect.mock.calls.at(-1)?.[0]();
  return result;
}

async function _flush() {
  await vi.advanceTimersByTimeAsync(250);
}

describe('filmstrip scope refresh after image edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.query.mockResolvedValue(['original']);
  });

  afterEach(async () => {
    cleanup?.();
    cleanup = undefined;
    await _flush();
    vi.useRealTimers();
  });

  it.each(['assets', 'fileTags', 'tagRegionInfo'] as const)(
    'includes a newly matching copy after %s changes',
    async (table) => {
      _mount();
      await _flush();
      expect(mocks.setIds).toHaveBeenLastCalledWith(['original']);
      mocks.query.mockResolvedValue(['original', 'copy']);
      notifyTableUpdate(table);
      await _flush();
      expect(mocks.setIds).toHaveBeenLastCalledWith(['original', 'copy']);
    },
  );

  it('keeps the active filters and fixed-list ordering when refreshing', async () => {
    const scope: LightboxNavigationScope = {
      searchQuery: {
        filters: [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 5 }],
      },
      assetIds: ['original'],
      dateField: 'dateAdded',
      preserveOrder: true,
    };
    _mount(scope);
    await _flush();
    notifyTableUpdate('assets');
    await _flush();
    expect(mocks.query).toHaveBeenLastCalledWith({
      searchQuery: scope.searchQuery,
      assetIds: ['original'],
      dateField: 'dateAdded',
      preserveOrder: true,
    });
    expect(mocks.setIds).toHaveBeenLastCalledWith(['original']);
  });

  it('does not let an older query hide a copy found after its associations were imported', async () => {
    let resolveOld: (ids: string[]) => void = () => {};
    mocks.query.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        resolveOld = resolve;
      }),
    );
    _mount();
    mocks.query.mockResolvedValue(['original', 'copy']);
    notifyTableUpdate('fileTags');
    await _flush();
    expect(mocks.setIds).toHaveBeenLastCalledWith(['original', 'copy']);
    resolveOld(['original']);
    await _flush();
    expect(mocks.setIds).toHaveBeenLastCalledWith(['original', 'copy']);
  });

  it('does not query while closed and unsubscribes when the lightbox closes', async () => {
    _mount(null, false);
    notifyTableUpdate('assets');
    await _flush();
    expect(mocks.query).not.toHaveBeenCalled();
    _mount();
    await _flush();
    cleanup?.();
    cleanup = undefined;
    mocks.query.mockClear();
    for (const table of ['assets', 'fileTags', 'tagRegionInfo'] as const) notifyTableUpdate(table);
    await _flush();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
