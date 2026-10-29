import { describe, expect, it } from 'vitest';
import { CLIP_MODELS, groupModels } from './models';
import { MODEL_PICKS } from '@/pages/onboarding/steps/modelPicks';

describe('model selection groups', () => {
  const [active, ready, missing, downloading] = CLIP_MODELS;

  it('assigns every model to exactly one group in display order', () => {
    const groups = groupModels(
      active.id,
      { [active.id]: true, [ready.id]: true },
      { [downloading.id]: 0.38 },
    );
    expect(groups.map((group) => group.label)).toEqual(['In use', 'Downloaded', 'Not downloaded']);
    expect(groups[0].models).toEqual([active]);
    expect(groups[1].models).toEqual([ready, downloading]);
    expect(groups[2].models).toContain(missing);
    const ids = groups.flatMap((group) => group.models.map((model) => model.id));
    expect(ids).toHaveLength(CLIP_MODELS.length);
    expect(new Set(ids).size).toBe(CLIP_MODELS.length);
  });

  it('shows a downloading active model with the downloaded ones, including zero progress', () => {
    const groups = groupModels(active.id, {}, { [active.id]: 0 });
    expect(groups[0].models).toEqual([]);
    expect(groups[1].models).toEqual([active]);
    expect(groups[2].models).not.toContain(active);
  });

  it('moves completed downloads to downloaded or in-use and keeps missing defaults honest', () => {
    expect(groupModels(active.id, {}, {})[0].models).toEqual([]);
    const groups = groupModels(
      active.id,
      { [active.id]: true, [ready.id]: true },
      { [active.id]: 1, [ready.id]: 1 },
    );
    expect(groups[0].models).toEqual([active]);
    expect(groups[1].models).toEqual([ready]);
  });

  it('provides bounded ratings and consistent recommendations for every onboarding choice', () => {
    for (const model of CLIP_MODELS) {
      expect(model.speed).toBeGreaterThanOrEqual(1);
      expect(model.speed).toBeLessThanOrEqual(4);
      expect(model.accuracy).toBeGreaterThanOrEqual(1);
      expect(model.accuracy).toBeLessThanOrEqual(4);
    }
    for (const picks of Object.values(MODEL_PICKS)) {
      for (const pick of picks) {
        const model = CLIP_MODELS.find((model) => model.id === pick.modelId);
        expect(model).toBeDefined();
        expect(Boolean(model?.recommended)).toBe(Boolean(pick.recommended));
      }
    }
  });
});
