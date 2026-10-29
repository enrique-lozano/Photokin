import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsRadioCard } from './SettingsRadioCard';
import { ModelRatings } from '@/components/smart-search/ModelRatings';
import { CLIP_MODELS } from '@/media/smartSearch/models';

describe('shared choice card', () => {
  it('uses a labelled native radio with its visual indicator after the content', () => {
    const html = renderToStaticMarkup(
      <SettingsRadioCard name="models" value="balanced" checked onChange={() => {}}>
        Balanced
      </SettingsRadioCard>,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="models"');
    expect(html).toContain('checked=""');
    expect(html).toContain('settings-radio-card--selected');
    expect(html.indexOf('Balanced')).toBeLessThan(html.indexOf('settings-radio-card__bullet'));
  });

  it('retains disabled behavior without selected styling on unchecked cards', () => {
    const html = renderToStaticMarkup(
      <SettingsRadioCard name="models" value="fast" checked={false} disabled onChange={() => {}}>
        Fast
      </SettingsRadioCard>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-disabled="true"');
    expect(html).not.toContain('settings-radio-card--selected');
  });

  it('labels both relative ratings and renders exactly four bars per rating', () => {
    const model = CLIP_MODELS[0];
    const html = renderToStaticMarkup(<ModelRatings model={model} />);
    expect(html).toContain(`Indexing speed: ${model.speed} out of 4 (relative estimate)`);
    expect(html).toContain(`Search accuracy: ${model.accuracy} out of 4 (relative estimate)`);
    expect(html.match(/data-filled=/g)).toHaveLength(8);
    expect(html.match(/data-filled="true"/g)).toHaveLength(model.speed + model.accuracy);
  });

  it('can show plain-language rating labels in expanded model details', () => {
    const html = renderToStaticMarkup(<ModelRatings model={CLIP_MODELS[0]} showLabels />);
    expect(html).toContain('>Indexing speed</span>');
    expect(html).toContain('>Search accuracy</span>');
    expect(html.match(/data-filled=/g)).toHaveLength(8);
  });
});
