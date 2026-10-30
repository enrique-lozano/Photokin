import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SeparatedListView } from './separated-list-view';

const items = Array.from({ length: 10000 }, (_, id) => ({ id, label: `Row ${id}` }));

describe('SeparatedListView', () => {
  it('builds a bounded initial window rather than every row', () => {
    const renderItem = vi.fn((item: (typeof items)[number]) => <button>{item.label}</button>);
    const markup = renderToStaticMarkup(
      <SeparatedListView
        aria-label="Test rows"
        items={items}
        itemKey={(item) => item.id}
        estimateSize={40}
        renderItem={renderItem}
      />,
    );

    expect(renderItem.mock.calls.length).toBeGreaterThan(0);
    expect(renderItem.mock.calls.length).toBeLessThanOrEqual(21);
    expect(markup).toContain('height:400000px');
    expect(markup).toContain('aria-label="Test rows"');
    expect(markup).toContain('aria-posinset="1"');
    expect(markup).toContain('aria-setsize="10000"');
    expect(markup).not.toContain('Row 9999');
  });

  it('renders separators between rows, but never after the final row', () => {
    const separator = vi.fn(() => <hr />);
    const markup = renderToStaticMarkup(
      <SeparatedListView
        aria-label="Short list"
        items={items.slice(0, 3)}
        itemKey={(item) => item.id}
        estimateSize={40}
        renderItem={(item) => <button>{item.label}</button>}
        separatorBuilder={separator}
      />,
    );

    expect(separator).toHaveBeenCalledTimes(2);
    expect(separator.mock.calls[0]).toEqual([items[0], 0]);
    expect(markup.match(/role="listitem"/g)).toHaveLength(3);
    expect(markup.match(/<hr/g)).toHaveLength(2);
  });

  it('supports per-item height estimates and stable non-index identities', () => {
    const markup = renderToStaticMarkup(
      <SeparatedListView
        aria-label="Grouped rows"
        items={[
          { id: 'group-a', height: 70 },
          { id: 'row-b', height: 35 },
        ]}
        itemKey={(item) => item.id}
        estimateSize={(item) => item.height}
        renderItem={(item) => <button>{item.id}</button>}
      />,
    );

    expect(markup).toContain('height:105px');
    expect(markup).toContain('translateY(70px)');
    expect(markup).toContain('group-a');
    expect(markup).toContain('row-b');
  });

  it('renders the supplied empty state without building items or separators', () => {
    const renderItem = vi.fn();
    const separator = vi.fn();
    const markup = renderToStaticMarkup(
      <SeparatedListView
        aria-label="Empty list"
        items={[]}
        itemKey={() => ''}
        estimateSize={40}
        renderItem={renderItem}
        separatorBuilder={separator}
        emptyState={<p>No matching items</p>}
      />,
    );

    expect(markup).toContain('No matching items');
    expect(markup).not.toContain('role="listitem"');
    expect(renderItem).not.toHaveBeenCalled();
    expect(separator).not.toHaveBeenCalled();
  });
});
