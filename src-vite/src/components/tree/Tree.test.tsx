import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tree } from './Tree';
import { TreeEntryEl } from './TreeEntryEl.model';

const entry = (name: string, children: TreeEntryEl[] = []): TreeEntryEl => ({
  id: name,
  name,
  children,
  open: false,
  selected: false,
});

describe('Tree caret spacing', () => {
  it('marks a tree containing only leaves as flat', () => {
    const markup = renderToStaticMarkup(<Tree entries={[entry('People'), entry('Travel')]} />);

    expect(markup).toContain('class="tree-root is-flat"');
  });

  it('keeps caret spacing when a collapsed entry has children', () => {
    const markup = renderToStaticMarkup(
      <Tree entries={[entry('People'), entry('Travel', [entry('Spain')])]} />,
    );

    expect(markup).toContain('class="tree-root"');
    expect(markup).not.toContain('is-flat');
  });

  it('removes caret spacing when filtering leaves only flat entries', () => {
    const markup = renderToStaticMarkup(
      <Tree entries={[entry('People'), entry('Travel', [entry('Spain')])]} filter="People" />,
    );

    expect(markup).toContain('class="tree-root is-flat"');
  });

  it('keeps caret spacing for ancestors retained by a descendant match', () => {
    const markup = renderToStaticMarkup(
      <Tree entries={[entry('People'), entry('Travel', [entry('Spain')])]} filter="Spain" />,
    );

    expect(markup).not.toContain('is-flat');
    expect(markup).toContain('Collapse Travel');
    expect(markup).toContain('tree-entry-children');
  });
});
