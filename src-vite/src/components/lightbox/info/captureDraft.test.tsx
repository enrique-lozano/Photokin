import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_CAMERA_TAGS } from '@/db/models/CameraTags';
import { CaptureCard } from './CaptureCard';
import { captureDraft, parseCaptureDraft } from './captureDraft';
import { normalizeMaker } from './CameraMaker';
import { useInfoPanelState } from './infoPanelState';
import { buildCaptureChips, hasAnyCameraData } from './CameraInfo';

describe('capture states', () => {
  it('recognizes an unknown metering value and formats library focal lengths with units', () => {
    expect(hasAnyCameraData({ ...EMPTY_CAMERA_TAGS, MeteringMode: 0 })).toBe(true);
    expect(buildCaptureChips({ ...EMPTY_CAMERA_TAGS, FocalLength: '150' })[0].value).toBe('150 mm');
  });
  it('shows an add action and four missing shot values when empty', () => {
    const html = renderToStaticMarkup(
      <CaptureCard camera={EMPTY_CAMERA_TAGS} disabled={false} onEdit={() => {}} />,
    );
    expect(html).toContain('Add capture details');
    expect(html).toContain('Camera &amp; lens - not set');
    expect(html).not.toContain('aria-label="Edit capture"');
    expect(html.match(/data-empty="true"/g)).toHaveLength(4);
    expect(html).not.toContain('More settings');
  });
  it('shows partial capture data without inventing a lens', () => {
    const html = renderToStaticMarkup(
      <CaptureCard
        camera={{ ...EMPTY_CAMERA_TAGS, Model: 'Scan', WhiteBalance: 'Auto', Flash: 'No Flash' }}
        disabled={false}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Edit capture"');
    expect(html).toContain('Auto');
    expect(html).not.toContain('Add capture details');
    expect(html).not.toContain('Not set');
  });
  it('shows the identity placeholder while preserving available capture settings', () => {
    const html = renderToStaticMarkup(
      <CaptureCard
        camera={{
          ...EMPTY_CAMERA_TAGS,
          FocalLength: '4.3',
          ShutterSpeed: 62.5,
          Aperture: 2.4,
          ISO: 125,
          WhiteBalance: 'Auto',
        }}
        disabled={false}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain('Camera &amp; lens - not set');
    expect(html).toMatch(
      /data-slot="info-row-title" class="overflow-hidden text-ellipsis text-xs font-normal text-muted-foreground"/,
    );
    expect(html).toContain('border-dashed');
    expect(html).toContain('camera-maker--empty');
    expect(html).toContain('aria-label="Edit capture"');
    expect(html).not.toContain('Add capture details');
    expect(html).toContain('1/16');
    expect(html).toContain('Auto');
    expect(html.match(/data-empty="false"/g)).toHaveLength(4);
  });
  it('preserves a known lens when the camera name is missing', () => {
    const html = renderToStaticMarkup(
      <CaptureCard camera={{ ...EMPTY_CAMERA_TAGS, Lens: '18-150mm' }} disabled={false} onEdit={() => {}} />,
    );
    expect(html).toContain('Camera - not set');
    expect(html).toContain('18-150mm');
    expect(html).not.toContain('Camera &amp; lens - not set');
    expect(html).toContain('aria-label="Edit capture"');
  });
  it('shows complete capture data and preserves expansion between photos', () => {
    useInfoPanelState.setState({ captureExpanded: true });
    const html = renderToStaticMarkup(
      <CaptureCard
        camera={{
          ...EMPTY_CAMERA_TAGS,
          Make: 'Canon',
          Model: 'EOS R10',
          Lens: '18-150mm',
          FocalLength: '150.0 mm',
          ShutterSpeed: 1.5625,
          Aperture: 7.1,
          ISO: 160,
          Flash: 'No Flash',
        }}
        disabled={false}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain('18-150mm');
    expect(html).toContain('1/640');
    expect(useInfoPanelState.getState().captureExpanded).toBe(true);
    expect(html.match(/data-empty="false"/g)).toHaveLength(4);
    useInfoPanelState.setState({ captureExpanded: false });
  });
  it('accepts fractions and normalizes printed focal length', () => {
    const draft = captureDraft({
      ...EMPTY_CAMERA_TAGS,
      FocalLength: '150.0 mm',
      ExposureCompensation: '+1/3',
    });
    const parsed = parseCaptureDraft({ ...draft, shutterSpeed: '1/640', aperture: '7.1', iso: '160' });
    expect(parsed).toMatchObject({ focalLength: '150', shutterSpeed: 1.5625, aperture: 7.1, iso: 160 });
    expect(Number(parsed.exposureCompensation)).toBeCloseTo(1 / 3);
  });
  it.each([
    ['iso', '1.5'],
    ['shutterSpeed', '1/0'],
    ['aperture', '-1'],
    ['focalLength', 'abc'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => parseCaptureDraft({ ...captureDraft(EMPTY_CAMERA_TAGS), [key]: value })).toThrow();
  });
  it.each([
    ['CANON', 'canon'],
    ['Canon Inc.', 'canon'],
    ['NIKON CORPORATION', 'nikon'],
    ['FUJIFILM', 'fujifilm'],
    ['Apple', 'apple'],
    ['unknown', null],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeMaker(input)).toBe(expected);
  });
});
