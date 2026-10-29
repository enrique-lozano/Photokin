import { describe, expect, it, vi } from 'vitest';
import { TagDTO } from '../../models/TagDTO';
import { getTagMoveError } from './tags.service';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, sep: () => '/', join: async (...parts: string[]) => parts.join('/') };
});

const tag = (id: string, name: string, parentId: string | null): TagDTO => ({
  id,
  name,
  parentId,
  color: null,
});

const tags = [
  tag('travel', 'Travel', null),
  tag('spain', 'Spain', 'travel'),
  tag('madrid', 'Madrid', 'spain'),
  tag('people', 'People', null),
  tag('other-spain', 'Spain', 'people'),
];

describe('getTagMoveError', () => {
  it('allows moving a branch to a different parent or the top level', () => {
    expect(getTagMoveError(tags, 'madrid', 'people')).toBeNull();
    expect(getTagMoveError(tags, 'spain', null)).toBeNull();
  });

  it('rejects moves into the source or one of its descendants', () => {
    expect(getTagMoveError(tags, 'travel', 'travel')).toContain('itself');
    expect(getTagMoveError(tags, 'travel', 'madrid')).toContain('nested');
  });

  it('rejects no-op and duplicate sibling moves, including at root', () => {
    expect(getTagMoveError(tags, 'spain', 'travel')).toContain('already');
    expect(getTagMoveError(tags, 'spain', 'people')).toContain('already exists');

    const duplicateRoot = [...tags, tag('root-spain', 'Spain', null)];
    expect(getTagMoveError(duplicateRoot, 'spain', null)).toContain('already exists');
  });
});
