import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MetadataRows, visibleRows } from './MetadataRows';

describe('shared metadata rows', () => {
  it('keeps ordinary shot details as a compact definition list without actions', () => {
    const html = renderToStaticMarkup(<MetadataRows rows={[{ label: 'ISO', value: 250 }]} />);
    expect(html).toContain('<dl class="metadata-rows">');
    expect(html).toContain('<div class="metadata-row">');
    expect(html).toContain('title="250">250</span>');
    expect(html).not.toContain('metadata-row__actions');
    expect(html).not.toContain('metadata-row--actionable');
  });

  it('preserves zero values and omits missing values by default', () => {
    const rows = [
      { label: 'Zero', value: 0 },
      { label: 'Missing', value: null },
      { label: 'Empty', value: '' },
      { label: 'Undefined', value: undefined },
    ];
    expect(visibleRows(rows)).toEqual([rows[0]]);
    expect(renderToStaticMarkup(<MetadataRows rows={rows.slice(1)} />)).toBe('');
  });

  it('retains empty raw ExifTool fields and their copy action on request', () => {
    const html = renderToStaticMarkup(
      <MetadataRows
        showEmpty
        rows={[{ label: 'Comment', value: '', actions: <button aria-label="Copy Comment">Copy</button> }]}
      />,
    );
    expect(html).toContain('>Comment</dt>');
    expect(html).toContain('aria-label="Copy Comment"');
    expect(html).toContain('metadata-row--actionable');
  });

  it('keeps full values in tooltips and copy callbacks while rendering multiple actions', () => {
    const path = 'C:\\Pictures\\A long folder name\\Another folder';
    const copy = vi.fn();
    const html = renderToStaticMarkup(
      <MetadataRows
        rows={[
          {
            label: 'Folder',
            value: path,
            valueClassName: 'file-details-path',
            actions: (
              <>
                <button aria-label="Copy folder path" onClick={() => copy(path)}>
                  Copy
                </button>
                <button aria-label="Open folder in Explorer">Open</button>
              </>
            ),
          },
        ]}
      />,
    );
    expect(html).toContain('metadata-row__text file-details-path');
    expect(html).toContain(`title="${path}"`);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(copy).not.toHaveBeenCalled();
  });

  it('keeps editors and save/cancel controls in the value cell without nesting controls', () => {
    const html = renderToStaticMarkup(
      <MetadataRows
        rows={[
          {
            label: 'File name',
            value: <input aria-label="New file name" defaultValue="photo.jpg" />,
            editing: true,
            actions: (
              <>
                <button aria-label="Save file name">Save</button>
                <button aria-label="Cancel rename">Cancel</button>
              </>
            ),
          },
        ]}
      />,
    );
    expect(html).toContain('data-editing="true"');
    expect(html).toContain('aria-label="New file name"');
    expect(html).toContain('aria-label="Save file name"');
    expect(html).toContain('aria-label="Cancel rename"');
    expect(html).toMatch(/<dd[^>]*>.*<input.*metadata-row__actions/);
    expect(html).not.toMatch(/<button[^>]*>.*<input/);
  });
});
