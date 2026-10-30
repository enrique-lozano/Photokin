import { describe, expect, it } from 'vitest';
import { TagDTO } from '../../../../db/models/TagDTO';
import { FilterCriteria } from '../FilterCriteria';
import { describeFilter } from '../FilterLabels';
import { SearchFilter } from '../FilterTypes';

const tag = (name: string): TagDTO => ({ id: name, parentId: null, name, color: null });

describe('describeFilter', () => {
  it('names the selected tags', () => {
    const filter: SearchFilter = {
      filterCriteria: FilterCriteria.tag,
      operator: 'contains',
      value: [tag('Yosemite'), tag('Hiking')],
    };

    expect(describeFilter(filter)).toBe('Tags: Yosemite, Hiking');
  });

  it('summarises the tags it does not list', () => {
    const filter: SearchFilter = {
      filterCriteria: FilterCriteria.tag,
      operator: 'contains',
      value: [tag('Yosemite'), tag('Hiking'), tag('Summer'), tag('Trips')],
    };

    expect(describeFilter(filter)).toBe('Tags: Yosemite, Hiking +2');
  });

  it('uses the singular noun for a single person', () => {
    const filter: SearchFilter = {
      filterCriteria: FilterCriteria.person,
      operator: 'contains',
      value: [tag('Ana Lopez')],
    };

    expect(describeFilter(filter)).toBe('Person: Ana Lopez');
  });

  it('counts albums, which carry ids only', () => {
    const filter: SearchFilter = {
      filterCriteria: FilterCriteria.path,
      operator: 'contains',
      value: [{ id: 'album-1' }, { id: 'album-2' }],
    };

    expect(describeFilter(filter)).toBe('2 albums');
  });

  it('spells out numeric comparisons', () => {
    expect(
      describeFilter({
        filterCriteria: FilterCriteria.rating,
        operator: 'greaterThanOrEquals',
        value: 4,
      }),
    ).toBe('Rating ≥ 4');

    expect(
      describeFilter({
        filterCriteria: FilterCriteria.size,
        operator: 'smallerThanOrEquals',
        value: 20,
      }),
    ).toBe('Size ≤ 20 MB');

    expect(describeFilter({ filterCriteria: FilterCriteria.aperture, operator: 'equals', value: 2.8 })).toBe(
      'Aperture f/2.8',
    );
  });

  it('reads dates as before/after', () => {
    const filter: SearchFilter = {
      filterCriteria: FilterCriteria.dateAdded,
      operator: 'greaterThanOrEquals',
      value: new Date(2020, 2, 3),
    };

    expect(describeFilter(filter)).toContain('Added after ');
  });

  it('describes media type and text filters', () => {
    expect(
      describeFilter({ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'video' }),
    ).toBe('Videos only');

    expect(
      describeFilter({ filterCriteria: FilterCriteria.filename, operator: 'contains', value: 'IMG_1' }),
    ).toBe('Filename contains "IMG_1"');
  });

  it('describes the flash filter in plain words', () => {
    expect(describeFilter({ filterCriteria: FilterCriteria.flash, operator: 'equals', value: true })).toBe(
      'Flash fired',
    );
    expect(describeFilter({ filterCriteria: FilterCriteria.flash, operator: 'equals', value: false })).toBe(
      'No flash',
    );
  });
});
