import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlbumScopePicker } from '@/pages/people/AlbumScopePicker';
import { DuplicatesEmptyState } from './DuplicatesEmptyState';
import { ScanOptionsForm } from './ScanOptionsForm';
import { distanceToMatchPercent } from './perceptualHash';
import { useDuplicatesStore } from './useDuplicatesStore';

vi.mock('./useDuplicatesStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useDuplicatesStore')>();
  return {
    ...actual,
    useDuplicatesStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useDuplicatesStore.getState>) => unknown) =>
        selector(actual.useDuplicatesStore.getState()),
      actual.useDuplicatesStore,
    ),
  };
});
vi.mock('@/components/page-content/ImportStatus', () => ({ useImportStatus: () => null }));
vi.mock('@/components/ui/infoHint', () => ({ InfoHint: () => null }));
vi.mock('@/components/ui/button', () => ({
  Button: vi.fn(({ children, disabled }) => <button disabled={disabled}>{children}</button>),
}));
vi.mock('@/components/ui/slider', () => ({ Slider: vi.fn(() => null) }));
vi.mock('@/pages/people/AlbumScopePicker', () => ({ AlbumScopePicker: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  useDuplicatesStore.setState({
    albumIds: [],
    includeSubAlbums: true,
    similarityThreshold: 10,
  });
});

describe('Duplicate scan options', () => {
  it('gives the empty-state form a full-width action area and review reassurance', () => {
    const markup = renderToStaticMarkup(<DuplicatesEmptyState onScan={vi.fn()} scanning={false} />);
    expect(markup).toContain('w-full max-w-md');
    expect(markup).toContain('dup-scan-options--inline');
    expect(markup).toContain('Nothing is removed until you review it.');
    expect(markup).toContain('More matches');
    expect(markup).toContain('Closer matches');
    expect(markup).toContain('Exact copies are always included.');
  });

  it('preserves album selection, sub-albums, similarity and the scan action', () => {
    const onScan = vi.fn();
    renderToStaticMarkup(<ScanOptionsForm layout="inline" onScan={onScan} scanning={false} />);

    const picker = vi.mocked(AlbumScopePicker).mock.calls[0][0];
    expect(picker.selectedIds).toEqual([]);
    expect(picker.includeSubAlbums).toBe(true);
    picker.onChangeSelected(['album-1']);
    picker.onChangeIncludeSubAlbums(false);
    expect(useDuplicatesStore.getState().albumIds).toEqual(['album-1']);
    expect(useDuplicatesStore.getState().includeSubAlbums).toBe(false);

    const slider = vi.mocked(Slider).mock.calls[0][0];
    expect(slider.value).toEqual([distanceToMatchPercent(10)]);
    expect(slider['aria-valuetext']).toBe(`${distanceToMatchPercent(10)}%`);
    slider.onValueChange?.([100]);
    expect(useDuplicatesStore.getState().similarityThreshold).toBe(0);
    slider.onValueChange?.([70]);
    expect(distanceToMatchPercent(useDuplicatesStore.getState().similarityThreshold)).toBe(70);

    expect(vi.mocked(Button).mock.calls[0][0].onClick).toBe(onScan);
  });

  it('keeps re-scan compact and disables scanning while a scan is running', () => {
    const markup = renderToStaticMarkup(
      <ScanOptionsForm layout="popover" onScan={vi.fn()} scanning={true} scanLabel="Re-scan" />,
    );
    expect(markup).toContain('dup-scan-options--popover');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Scanning');
    expect(markup).not.toContain('More matches');
    expect(markup).not.toContain('Nothing is removed');

    const ready = renderToStaticMarkup(
      <ScanOptionsForm layout="popover" onScan={vi.fn()} scanning={false} scanLabel="Re-scan" />,
    );
    expect(ready).toContain('Re-scan');
  });
});
