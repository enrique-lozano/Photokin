import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Slider } from './slider';

describe('Slider accessible values', () => {
  it('places the label and descriptive value on the interactive thumb', () => {
    const markup = renderToStaticMarkup(
      <Slider value={[80]} aria-label="Photo quality" aria-valuetext="80% - Balanced" />,
    );
    expect(markup).toMatch(
      /role="slider"[^>]*aria-label="Photo quality"[^>]*aria-valuetext="80% - Balanced"/,
    );
  });
});
