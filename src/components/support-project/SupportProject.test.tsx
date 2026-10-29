import { renderToStaticMarkup } from 'react-dom/server';
import { siBuymeacoffee, siLiberapay, siPaypal } from 'simple-icons';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('launch-time donation badge visibility', () => {
  it.each([
    [0, true],
    [0.299999, true],
    [0.3, false],
    [0.999999, false],
  ])('uses a 30%% threshold for a random draw of %s', async (draw, visible) => {
    vi.resetModules();
    vi.spyOn(Math, 'random').mockReturnValue(draw);
    const { DonateBadge } = await import('./SupportProject');

    const html = renderToStaticMarkup(<DonateBadge />);
    expect(html.includes('Donate to Photokin')).toBe(visible);
  });

  it.each([true, false])('keeps visibility %s across re-renders and remounts', async (visible) => {
    vi.resetModules();
    const random = vi.spyOn(Math, 'random').mockReturnValue(visible ? 0.1 : 0.9);
    const { DonateBadge } = await import('./SupportProject');
    const callsAfterLoad = random.mock.calls.length;
    random.mockReturnValue(visible ? 0.9 : 0.1);

    for (let render = 0; render < 3; render++) {
      expect(renderToStaticMarkup(<DonateBadge />).includes('Donate to Photokin')).toBe(visible);
    }
    expect(random).toHaveBeenCalledTimes(callsAfterLoad);
  });

  it('always keeps the About donation line available when the footer badge is hidden', async () => {
    vi.resetModules();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { DonateBadge, SupportProjectFooter } = await import('./SupportProject');

    expect(renderToStaticMarkup(<DonateBadge />)).toBe('');
    const html = renderToStaticMarkup(<SupportProjectFooter />);
    expect(html).toContain('Donate a little love');
    expect(html).toContain('>Donate<');
  });
});

describe('donation chooser', () => {
  it.each([
    ['PayPal', 'https://paypal.me/lozanoelc?country.x=ES&amp;locale.x=es_ES', siPaypal],
    ['Buy Me a Coffee', 'https://www.buymeacoffee.com/enrique.lozano', siBuymeacoffee],
    ['Liberapay', 'https://liberapay.com/enrique-lozano/donate', siLiberapay],
  ])('links to %s in the system browser with its logo', async (label, url, icon) => {
    const { SupportProjectCard } = await import('./SupportProject');
    const html = renderToStaticMarkup(<SupportProjectCard />);
    expect(html).toContain(`href="${url}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain(`aria-label="${label} (opens in your browser)"`);
    expect(html).toContain(`<path d="${icon.path}">`);
  });
});
