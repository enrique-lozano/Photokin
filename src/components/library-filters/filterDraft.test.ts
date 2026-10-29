import { SearchQueryType } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { TagDTO } from '@/db/models/TagDTO';
import { describe, expect, it } from 'vitest';
import {
  buildDraftConditions,
  createEmptyDraft,
  formatDateRange,
  getSectionSummaries,
  hydrateDraftFromFilters,
} from './filterDraft';

const none = { people: [], tags: [] };

describe('filter drawer draft', () => {
  it('builds nothing from an empty draft', () => {
    expect(buildDraftConditions(createEmptyDraft(), [], none)).toEqual([]);
  });

  it('keeps one camera in the main condition', () => {
    const draft = { ...createEmptyDraft(), cameras: ['FUJIFILM X100V'], ratingValue: 3 };

    expect(buildDraftConditions(draft, [], none)).toEqual([
      {
        filters: [
          { filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: 3 },
          { filterCriteria: FilterCriteria.camera, operator: 'equals', value: 'FUJIFILM X100V' },
        ],
      },
    ]);
  });

  it('ORs several cameras in their own condition', () => {
    const draft = { ...createEmptyDraft(), cameras: ['FUJIFILM X100V', 'Apple iPhone 15'] };

    expect(buildDraftConditions(draft, [], none)).toEqual([
      {
        type: SearchQueryType.OR,
        filters: [
          { filterCriteria: FilterCriteria.camera, operator: 'equals', value: 'FUJIFILM X100V' },
          { filterCriteria: FilterCriteria.camera, operator: 'equals', value: 'Apple iPhone 15' },
        ],
      },
    ]);
  });

  it('round-trips cameras, exposure ranges and flash through the applied query', () => {
    const draft = createEmptyDraft();
    draft.cameras = ['A', 'B'];
    draft.exposure.iso = [2000, null];
    draft.exposure.shutterSpeed = [null, 16.667];
    draft.flash = 'notFired';

    const filters = buildDraftConditions(draft, [], none).flatMap((condition) => condition.filters);
    const hydrated = hydrateDraftFromFilters(filters);

    expect(hydrated.cameras).toEqual(['A', 'B']);
    expect(hydrated.exposure.iso).toEqual([2000, null]);
    expect(hydrated.exposure.shutterSpeed).toEqual([null, 16.667]);
    expect(hydrated.flash).toBe('notFired');
  });

  it('carries over filters the drawer cannot edit', () => {
    const typed: SearchFilter[] = [
      { filterCriteria: FilterCriteria.camera, operator: 'contains', value: 'X100' },
      { filterCriteria: FilterCriteria.rated, operator: 'equals', value: true },
    ];

    const hydrated = hydrateDraftFromFilters(typed);
    expect(hydrated.cameras).toEqual([]);
    expect(buildDraftConditions(hydrated, typed, none)).toEqual([{ filters: typed }]);
  });

  it('adds resolved people and tags', () => {
    const ana = { id: 'p1', name: 'Ana' } as TagDTO;
    const draft = { ...createEmptyDraft(), peopleIds: ['p1'] };

    expect(buildDraftConditions(draft, [], { people: [ana], tags: [] })).toEqual([
      { filters: [{ filterCriteria: FilterCriteria.person, operator: 'contains', value: [ana] }] },
    ]);
  });

  it('formats date ranges, collapsing whole years', () => {
    expect(formatDateRange('2024-01-01', '2026-12-31')).toBe('2024 – 2026');
    expect(formatDateRange('2024-01-01', '2024-12-31')).toBe('2024');
    expect(formatDateRange('', '')).toBeNull();
    expect(formatDateRange('2024-03-02', '')).toMatch(/^Since /);
  });

  it('summarises only the sections that filter something', () => {
    const draft = createEmptyDraft();
    draft.cameras = ['FUJIFILM X100V'];
    draft.exposure.iso = [2000, null];
    draft.ratingValue = 3;

    const summaries = getSectionSummaries(draft, none);

    expect(summaries.camera).toBe(`FUJIFILM X100V · ISO ≥ ${(2000).toLocaleString()}`);
    expect(summaries.rating).toBe('3★ and up');
    expect(summaries.quick).toBeNull();
    expect(summaries['date-taken']).toBeNull();
    expect(summaries.size).toBeNull();
  });
});
