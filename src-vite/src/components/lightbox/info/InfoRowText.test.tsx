import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InfoRowText } from './InfoRowText';

describe('photo information row text', () => {
  it('shares the title/subtitle hierarchy without presentational strong or small tags', () => {
    const html = renderToStaticMarkup(<InfoRowText title="Canon EOS R10" subtitle="18-150 mm" />);
    expect(html).toContain('data-slot="info-row-title" class="text-sm font-semibold"');
    expect(html).toContain('data-slot="info-row-subtitle" class="text-xs font-normal text-muted-foreground"');
    expect(html).not.toMatch(/<(strong|small|em)\b/);
    expect(html).toContain('flex min-w-0 flex-1 flex-col');
  });

  it.each([undefined, null, ''])('omits an absent subtitle (%s)', (subtitle) => {
    const html = renderToStaticMarkup(<InfoRowText title="Add location" subtitle={subtitle} />);
    expect(html).toContain('Add location');
    expect(html).not.toContain('info-row-subtitle');
  });

  it('retains the camera name and lens tooltips when their visible text truncates', () => {
    const html = renderToStaticMarkup(
      <InfoRowText
        title="Camera model"
        subtitle="Lens model"
        titleClassName="truncate"
        subtitleClassName="truncate"
      />,
    );
    expect(html).toContain('title="Camera model"');
    expect(html).toContain('title="Lens model"');
    expect(html.match(/truncate/g)).toHaveLength(2);
  });

  it('merges per-row differences without conflicting typography utilities', () => {
    const html = renderToStaticMarkup(
      <InfoRowText
        title="Camera - not set"
        subtitle="Lens"
        titleClassName="text-xs font-normal text-muted-foreground"
        subtitleClassName="text-sm"
      />,
    );
    expect(html).toContain('data-slot="info-row-title" class="text-xs font-normal text-muted-foreground"');
    expect(html).toContain('data-slot="info-row-subtitle" class="font-normal text-muted-foreground text-sm"');
  });
});
