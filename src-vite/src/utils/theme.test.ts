import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Appearance, applyTheme, THEME_LABELS } from './theme';

function _rgb(hsl: string): number[] {
  const [hue, saturationPercent, lightnessPercent] = hsl.split(' ').map(parseFloat);
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map((offset) => {
    const sector = (offset + hue / 30) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(sector - 3, 9 - sector, 1));
  });
}

function _luminance(channels: number[]): number {
  return channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function _contrast(first: number[], second: number[]): number {
  const values = [_luminance(first), _luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

afterEach(() => vi.unstubAllGlobals());

describe.each([Appearance.Light, Appearance.Dark])('theme contrast in appearance %s', (appearance) => {
  it.each(THEME_LABELS.map((label, index) => ({ label, index })))(
    '$label keeps filled controls readable',
    ({ index }) => {
      const properties = new Map<string, string>();
      vi.stubGlobal('document', {
        documentElement: {
          dataset: {},
          style: { setProperty: (name: string, value: string) => properties.set(name, value) },
        },
      });

      applyTheme(appearance, index, index);

      const action = _rgb(properties.get('--action')!);
      const foreground = _rgb(properties.get('--action-foreground')!);
      expect(_contrast(action, foreground)).toBeGreaterThanOrEqual(4.5);
      const surface = _rgb(appearance === Appearance.Light ? '0 0% 100%' : '222.2 84% 4.9%');
      expect(_contrast(_rgb(properties.get('--ring')!), surface)).toBeGreaterThanOrEqual(3);
      const border = appearance === Appearance.Light ? action : _rgb(properties.get('--primary')!);
      expect(_contrast(border, surface)).toBeGreaterThanOrEqual(3);
      expect(
        _contrast(
          action.map((channel) => channel * 0.88),
          foreground,
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        _contrast(_rgb(properties.get('--primary')!), _rgb(properties.get('--primary-foreground')!)),
      ).toBeGreaterThanOrEqual(4.5);

      for (const token of ['main-navbar', 'secondary-navbar']) {
        expect(
          _contrast(_rgb(properties.get(`--${token}`)!), _rgb(properties.get(`--${token}-foreground`)!)),
          `${THEME_LABELS[index]} ${token}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('base semantic colors', () => {
  const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8');
  const palettes: Map<string, string>[] = [];
  parse(css).walkRules((rule) => {
    if (rule.selector !== ':root' && rule.selector !== '.dark') return;
    const palette = new Map<string, string>();
    rule.walkDecls((declaration) => {
      palette.set(declaration.prop.slice(2), declaration.value);
    });
    if (palette.has('background')) palettes.push(palette);
  });

  it.each(palettes.map((palette, index) => ({ palette, index })))(
    'appearance $index has readable semantic pairs',
    ({ palette }) => {
      for (const token of [
        'card',
        'popover',
        'secondary',
        'muted',
        'accent',
        'destructive',
        'success',
        'warning',
      ]) {
        expect(
          _contrast(_rgb(palette.get(token)!), _rgb(palette.get(`${token}-foreground`)!)),
          token,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
