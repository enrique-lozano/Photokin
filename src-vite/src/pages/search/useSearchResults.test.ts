import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchQuery } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { TagDTO } from '@/db/models/TagDTO';
import { resolveEntityFilters, resolveQuery } from './useSearchResults';

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  tags: vi.fn(),
  rank: vi.fn(),
}));
vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getScopedAssetIds: mocks.candidates },
}));
vi.mock('@/db/api/services/tags.service', () => ({ TagsService: { findByNamesOrPaths: mocks.tags } }));
vi.mock('@/media/smartSearch/searchResults', () => ({ resolveSearchResults: mocks.rank }));
vi.mock('@/stores/appState', () => ({ useAppStore: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.candidates.mockResolvedValue(['scoped']);
  mocks.tags.mockResolvedValue([]);
  mocks.rank.mockResolvedValue([]);
});

describe('strict search scope', () => {
  it('does not rank structured-only queries', async () => {
    const result = await resolveQuery(parseSearchBarInput('type:video rating>=4'), []);
    expect(result.mode).toBe('timeline');
    expect(result.scope).toEqual([{ filters: parseSearchBarInput('type:video rating>=4').filters }]);
    expect(result.filters).toEqual(parseSearchBarInput('type:video rating>=4').filters);
    expect(mocks.rank).not.toHaveBeenCalled();
  });

  it('never retries globally when mixed-query candidates are empty', async () => {
    mocks.candidates.mockResolvedValue([]);
    const result = await resolveQuery(parseSearchBarInput('person:Missing beach'), []);
    expect(result.assetIds).toEqual([]);
    expect(mocks.rank).not.toHaveBeenCalled();
    expect(mocks.candidates.mock.calls[0][0].searchQuery[0].filters[0].value).toEqual([]);
    expect(result.filters[0].value).toEqual([]);
  });

  it('combines global and typed filters, even when ranking finds nothing', async () => {
    const global: SearchQuery = [
      { filters: [{ filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: 4 }] },
    ];
    await resolveQuery(parseSearchBarInput('type:video snow'), global);
    expect(mocks.candidates.mock.calls[0][0].searchQuery).toEqual([
      ...global,
      { filters: parseSearchBarInput('type:video').filters },
    ]);
    expect(mocks.rank).toHaveBeenCalledOnce();
    expect(mocks.rank).toHaveBeenCalledWith('snow', expect.objectContaining({ candidateIds: ['scoped'] }));
  });

  it('weaker matching retains candidates and never ranks the filter text', async () => {
    await resolveQuery(parseSearchBarInput('beach rating>=4'), [], { includeWeak: true });
    expect(mocks.rank).toHaveBeenCalledWith(
      'beach',
      expect.objectContaining({ includeWeak: true, candidateIds: ['scoped'] }),
    );
  });

  it('ordinary words are unfiltered text; invalid filters remain text with notices', async () => {
    await resolveQuery(parseSearchBarInput('videos rating:abc'), []);
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.rank).toHaveBeenCalledWith(
      'videos rating:abc',
      expect.objectContaining({ candidateIds: undefined }),
    );
  });

  it('does not start ranking after cancellation or swallow search failures', async () => {
    await resolveQuery(parseSearchBarInput('beach'), [], { isCancelled: () => true });
    expect(mocks.rank).not.toHaveBeenCalled();
    mocks.candidates.mockRejectedValue(new Error('Database unavailable'));
    await expect(resolveQuery(parseSearchBarInput('beach rating>=4'), [])).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('clearing query filters retains original literal quoting and global filters', async () => {
    const parsed = parseSearchBarInput('"videos" person:Missing rating:abc');
    const global: SearchQuery = [
      { filters: [{ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'photo' }] },
    ];
    await resolveQuery(parseSearchBarInput(parsed.textQuery), global);
    expect(parsed.textQuery).toBe('"videos" rating:abc');
    expect(mocks.candidates).toHaveBeenCalledWith({ searchQuery: global });
  });
});

describe('entity name resolution', () => {
  const tag = (id: string, name: string, fullPath: string): TagDTO & { fullPath: string } => ({
    id,
    name,
    fullPath,
    parentId: null,
    color: null,
  });

  it('matches all duplicate leaf names, not only the last', async () => {
    const tags = [tag('1', 'Ana', 'Family/Ana'), tag('2', 'Ana', 'Friends/Ana')];
    mocks.tags.mockResolvedValue(tags);
    const filters = await resolveEntityFilters(parseSearchBarInput('person:Ana').filters);
    expect(filters[0].value).toEqual(tags);
  });

  it('exposes resolved typed filters separately from the existing library scope', async () => {
    const ana = tag('1', 'Ana', 'Family/Ana');
    mocks.tags.mockResolvedValue([ana]);
    const global: SearchQuery = [{ filters: parseSearchBarInput('year:2024').filters }];
    const result = await resolveQuery(parseSearchBarInput('person:Ana beach'), global);
    expect(result.filters).toEqual([
      { filterCriteria: FilterCriteria.person, operator: 'contains', value: [ana] },
    ]);
    expect(result.scope).toEqual([...global, { filters: result.filters }]);
  });

  it('prefers an exact full path over another entity with the same leaf spelling', async () => {
    mocks.tags.mockResolvedValue([tag('1', 'Ana', 'Family/Ana'), tag('2', 'Family/Ana', 'Other/Family/Ana')]);
    const filters = await resolveEntityFilters(parseSearchBarInput('tag:Family/Ana').filters);
    expect(filters[0].value).toEqual([tag('1', 'Ana', 'Family/Ana')]);
  });

  it('preserves list OR, deduplicates resolved entities and leaves unknowns empty', async () => {
    mocks.tags.mockResolvedValue([tag('1', 'Ana', 'Family/Ana')]);
    const filters = await resolveEntityFilters(
      parseSearchBarInput('person:Ana,Family/Ana person:Unknown').filters,
    );
    expect(filters[0].value).toEqual([tag('1', 'Ana', 'Family/Ana')]);
    expect(filters[1].value).toEqual([]);
  });
});
