import { describe, expect, it } from 'vitest';
import { TreeEntryEl } from './TreeEntryEl.model';
import { countTreeNameMatches, filterTreeItemsByName } from './filterTreeItems';

function _entry(name: string, children: TreeEntryEl[] = [], id = name): TreeEntryEl {
  return { name, id, children, open: false, selected: false };
}

const tree = [
  _entry('Travel', [
    _entry('Mexico', [_entry('2024', [], 'album-2024')], 'folder:travel:Mexico'),
    _entry('Japan'),
  ]),
];

describe('countTreeNameMatches', () => {
  it('counts a matching name and not the ancestors opened to reveal it', () => {
    expect(filterTreeItemsByName(tree, '2024').map((node) => node.name)).toEqual(['Travel']);
    expect(countTreeNameMatches(tree, '2024')).toBe(1);
    expect(countTreeNameMatches(tree, 'mexico')).toBe(1);
  });

  it('does not count descendants shown only because an ancestor matched', () => {
    expect(countTreeNameMatches(tree, 'travel')).toBe(1);
  });

  it('can skip rows that are not part of the section total', () => {
    const albumsOnly = (node: TreeEntryEl) => !node.id.startsWith('folder:');

    expect(countTreeNameMatches(tree, 'mexico', albumsOnly)).toBe(0);
    expect(countTreeNameMatches(tree, '2024', albumsOnly)).toBe(1);
  });
});
