import type { AssetInClient } from '@/db/models/AssetInClient';
import type { MetadataSnapshot } from '@/media/metadata/exiftool/read/metadataExplorer';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataExplorer } from './MetadataExplorer';
import { useInfoPanelState } from './infoPanelState';

const mocks = vi.hoisted(() => ({
  snapshot: null as MetadataSnapshot | null,
  input: null as ComponentProps<'input'> | null,
  stateIndex: 0,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => [mocks.stateIndex++ === 0 ? mocks.snapshot : initial, vi.fn()],
}));
vi.mock('./infoPanelState', async (original) => {
  const actual = await original<typeof import('./infoPanelState')>();
  return {
    useInfoPanelState: Object.assign(
      (selector: (state: ReturnType<typeof actual.useInfoPanelState.getState>) => unknown) =>
        selector(actual.useInfoPanelState.getState()),
      actual.useInfoPanelState,
    ),
  };
});
vi.mock('@/stores/appState', () => ({ useAppStore: () => undefined }));
vi.mock('@/media/metadata/exiftool/read/metadataExplorer', () => ({ loadFullMetadata: vi.fn() }));
vi.mock('@/components/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => {
    mocks.input = props;
    return <input {...props} />;
  },
}));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPhoto(id: string, lens: string) {
  mocks.stateIndex = 0;
  mocks.snapshot = {
    raw: {},
    rows: [
      { group: 'EXIF', tag: 'LensModel', value: lens },
      { group: 'EXIF', tag: 'ISO', value: '100' },
    ],
    loadedAt: 0,
    version: '13.6',
  };
  return renderToStaticMarkup(
    <MetadataExplorer
      asset={{ id, filename: `${id}.jpg`, fullPath: `C:\\photos\\${id}.jpg` } as AssetInClient}
      onCount={vi.fn()}
    />,
  );
}

function changeSearch(value: string) {
  mocks.input?.onChange?.({ target: { value } } as Parameters<
    NonNullable<ComponentProps<'input'>['onChange']>
  >[0]);
}

beforeEach(() => {
  useInfoPanelState.setState(useInfoPanelState.getInitialState());
  mocks.input = null;
});

describe('metadata search across navigation', () => {
  it('keeps the entered search on a fresh viewer for another photo and shows its matching values', () => {
    renderPhoto('first', 'First lens');
    changeSearch('LeNs');
    const html = renderPhoto('second', 'Second lens');
    expect(html).toContain('value="LeNs"');
    expect(html).toContain('Second lens');
    expect(html).not.toContain('First lens');
    expect(html).not.toContain('>ISO<');
  });

  it('preserves the search across info tabs and viewer remounts, while allowing it to be cleared', () => {
    renderPhoto('first', 'First lens');
    changeSearch('lens');
    useInfoPanelState.getState().setSegment('overview');
    useInfoPanelState.getState().setSegment('metadata');
    expect(renderPhoto('reopened', 'Another lens')).toContain('value="lens"');
    changeSearch('');
    const html = renderPhoto('reopened', 'Another lens');
    expect(html).toContain('value=""');
    expect(html).toContain('>ISO<');
  });
});
