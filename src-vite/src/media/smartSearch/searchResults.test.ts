import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSearchResults } from './searchResults';

const mocks = vi.hoisted(() => ({ select: vi.fn(), model: vi.fn(), smart: vi.fn() }));
vi.mock('@/db/connection/db.service', () => ({ selectFromDB: mocks.select }));
vi.mock('@/stores/smartSearchSettingsStore', () => ({
  useSmartSearchSettingsStore: { getState: () => ({ activeModel: 'test' }) },
}));
vi.mock('./models', () => ({ isModelDownloaded: mocks.model }));
vi.mock('./search', () => ({ smartSearch: mocks.smart }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockResolvedValue([]);
  mocks.model.mockResolvedValue(true);
  mocks.smart.mockResolvedValue([]);
});

describe('search resolver candidate boundary', () => {
  it('empty scope never becomes whole-library matching', async () => {
    expect(await resolveSearchResults('beach', { candidateIds: [] })).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.smart).not.toHaveBeenCalled();
  });

  it('passes candidates unchanged to semantic and literal matching, including weaker hits', async () => {
    const candidates = ['a', 'b'];
    const ran = vi.fn();
    await resolveSearchResults('beach', { candidateIds: candidates, includeWeak: true, onSemanticRan: ran });
    expect(mocks.smart).toHaveBeenCalledWith(
      'beach',
      expect.objectContaining({ candidateIds: candidates, includeWeak: true }),
    );
    for (const [query] of mocks.select.mock.calls) {
      expect(query.compile().parameters).toEqual(expect.arrayContaining(candidates));
    }
    expect(ran).toHaveBeenCalledOnce();
  });

  it('missing model still gives literal results and never offers weaker matches', async () => {
    mocks.model.mockResolvedValue(false);
    mocks.select.mockResolvedValue([{ id: 'a' }]);
    const ran = vi.fn();
    expect(await resolveSearchResults('beach', { candidateIds: ['a'], onSemanticRan: ran })).toEqual(['a']);
    expect(ran).not.toHaveBeenCalled();
  });
});
