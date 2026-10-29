import { MetadataMode } from '@/common/metadataOptions';
import { RatingMode } from '@/common/ratingModeOptions';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AssetInClient } from '@/db/models/AssetInClient';
import { AssetMetadata } from '@/db/models/AssetMetadata';
import { LocationSource } from '@/db/models/AssetLocation';
import { EMPTY_CAMERA_TAGS } from '@/db/models/CameraTags';
import type { TagInClient } from '@/db/models/TagDTO';
import { EMPTY_LOCATION } from '@/media/metadata/location/locationDraft';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxInfoPanel } from '../PhotoInfoPanel';
import { LocationSegment } from './LocationSegment';
import { TagsSegment } from './TagsSegment';
const settings = vi.hoisted(() => ({
  metadataMode: 'readonly',
  ratingMode: 'stars',
  writeBackTiming: 'immediate-on-edit',
  showPhotoDescription: true,
}));
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (select: (state: typeof settings) => unknown) => select(settings),
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/db/api/services/tags.service', () => ({ TagsService: {} }));
vi.mock('@/db/api/services/regions.service', () => ({ RegionsService: {} }));
vi.mock('@/db/connection/useLiveQuery', () => ({ useLiveQuery: () => ({ data: [] }) }));
vi.mock('@/system/diskManager', () => ({ openContainingFolder: vi.fn(), tauriFileTimestamps: vi.fn() }));
vi.mock('@/media/metadata/location/geocode', () => ({ reverseGeocode: vi.fn() }));
vi.mock('./PeopleSection', () => ({ PeopleSection: () => <div>Existing people</div> }));
vi.mock('./LightboxLocationMap', () => ({ LightboxLocationMap: () => <div>Existing map</div> }));
vi.mock('./EditCaptureDialog', () => ({ EditCaptureDialog: () => null }));

const asset = {
  id: 'segment-fixture',
  filename: 'fixture.jpg',
  fullPath: 'fixture.jpg',
  filesize: 1000,
  metadata: {
    title: '',
    description: '',
    date: new Date('2024-12-27'),
    lastScanned: '2026-10-15',
    rating: 0,
    location: null,
    camera: EMPTY_CAMERA_TAGS,
    width: 100,
    height: 100,
    megapixels: 0.01,
    rights: null,
  },
} as AssetInClient;
beforeEach(() => {
  settings.metadataMode = MetadataMode.ReadOnly;
  settings.ratingMode = RatingMode.Stars;
  settings.showPhotoDescription = true;
});
describe('information panel state matrix', () => {
  it.each([
    [LocationSource.Auto, 'Auto · from GPS'],
    [LocationSource.Manual, 'Saved in library'],
    [LocationSource.File, 'Saved in file'],
    [null, 'Auto'],
  ] as const)('renders stored place source %s without checking the file', (source, label) => {
    const photo = new AssetInClient({
      ...asset,
      metadata: new AssetMetadata({
        ...asset.metadata,
        location: { ...EMPTY_LOCATION, name: 'Madrid', city: 'Madrid', source },
      }),
    });
    const html = renderToStaticMarkup(<LocationSegment asset={photo} disabled={false} />);
    expect(html).toContain(label);
    expect(html).not.toContain('Checking source');
    if (source === null) {
      expect(html).toMatch(/>Auto<\/span>/);
      expect(html).toContain('Source not yet classified');
      expect(html).not.toContain('Saved in file');
      expect(html).not.toContain('Auto · from GPS');
    }
  });
  it.each([MetadataMode.ReadOnly, MetadataMode.Full])(
    'shows %s mode without removing the tab controls',
    (mode) => {
      settings.metadataMode = mode;
      const html = renderToStaticMarkup(
        <TooltipProvider>
          <LightboxInfoPanel img={asset} isActive onClose={() => {}} />
        </TooltipProvider>,
      );
      expect(html).toContain(mode === MetadataMode.Full ? 'Saving to files' : 'Library only');
      expect(html.match(/role="tab"/g)).toHaveLength(4);
      expect(html).toContain('info-rating');
      expect(html).toContain('File details');
      expect(html).toContain('fixture.jpg · 100 × 100 ·');
      expect(html.match(/data-slot="info-row-title"/g)).toHaveLength(4);
      expect(html).not.toMatch(/<(strong|small|em)\b/);
    },
  );
  it('shows a distinct chip when file writes wait for the next sync', () => {
    settings.metadataMode = MetadataMode.Full;
    settings.writeBackTiming = 'deferred-on-sync';
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <LightboxInfoPanel img={asset} isActive onClose={() => {}} />
      </TooltipProvider>,
    );
    settings.writeBackTiming = 'immediate-on-edit';
    expect(html).toContain('Files on sync');
    expect(html).not.toContain('Saving to files');
  });
  it('hides panel stars in favorite mode', () => {
    settings.ratingMode = RatingMode.Favorites;
    expect(
      renderToStaticMarkup(
        <TooltipProvider>
          <LightboxInfoPanel img={asset} isActive onClose={() => {}} />
        </TooltipProvider>,
      ),
    ).not.toContain('info-rating');
  });
  it.each(['', 'A saved photo description'])(
    'toggles the description field without changing its value (%s)',
    (description) => {
      const photo = new AssetInClient({
        ...asset,
        id: `description-fixture-${description}`,
        metadata: new AssetMetadata({ ...asset.metadata, description }),
      });
      const renderPanel = () =>
        renderToStaticMarkup(
          <TooltipProvider>
            <LightboxInfoPanel img={photo} isActive onClose={() => {}} />
          </TooltipProvider>,
        );

      expect(renderPanel()).toContain('aria-label="Description"');
      settings.showPhotoDescription = false;
      const hidden = renderPanel();
      expect(hidden).not.toContain('aria-label="Description"');
      expect(hidden).not.toContain('Add a description...');
      expect(hidden).toContain('aria-label="Title"');
      expect(hidden).toContain('Add keyword');
      expect(hidden).toContain('File details');
      expect(photo.metadata.description).toBe(description);

      settings.showPhotoDescription = true;
      const visible = renderPanel();
      expect(visible).toContain('aria-label="Description"');
      if (description) expect(visible).toContain(description);
    },
  );
  it('renders empty keywords and disables clearing', () => {
    const html = renderToStaticMarkup(<TagsSegment asset={asset} tags={[]} faces={[]} disabled={false} />);
    expect(html).toContain('No keywords yet');
    expect(html).toMatch(/disabled=""[^>]*>[^<]*<svg[^>]*tabler-icon-tag-off/);
    expect(html).toContain('No people in this photo');
  });
  it('renders hierarchical colored and uncolored keywords without hiding people', () => {
    const tags = [
      { id: 'colored', name: 'Vuelos', fullPath: 'Viajes/Vuelos', color: '#00ff00', rootId: 'trips' },
      { id: 'plain', name: 'Cielo', fullPath: 'Cielo', color: null, rootId: 'plain' },
    ] as TagInClient[];
    const html = renderToStaticMarkup(<TagsSegment asset={asset} tags={tags} faces={[]} disabled={false} />);
    expect(html).toContain('Viajes');
    expect(html).toContain('Vuelos');
    expect(html).toContain('Cielo');
    expect(html).toContain('background-color:#00ff00');
    expect(html).toContain('background-color:hsl(');
  });
  it.each([
    [null, false, 'No location saved for this photo'],
    [{ ...EMPTY_LOCATION, city: 'Madrid', name: 'Madrid' }, false, 'Madrid'],
    [{ ...EMPTY_LOCATION, latitude: 40.416775, longitude: -3.70379 }, true, 'Latitude'],
  ])('renders empty, place-only and coordinate location states', (location, map, expected) => {
    const photo = { ...asset, metadata: { ...asset.metadata, location } } as AssetInClient;
    const html = renderToStaticMarkup(<LocationSegment asset={photo} disabled={false} />);
    expect(html).toContain(expected);
    expect(html.includes('Existing map')).toBe(map);
    expect(html).toContain('info-pinned-footer');
  });
});
