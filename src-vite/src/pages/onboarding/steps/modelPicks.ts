export type ModelLanguage = 'english' | 'multilingual';

export type ModelPick = {
  /** Id of a model in `CLIP_MODELS`. */
  modelId: string;
  tier: string;
  note: string;
  recommended?: boolean;
};

type ModelPicks = [ModelPick] | [ModelPick, ModelPick] | [ModelPick, ModelPick, ModelPick];

/** The few models offered during onboarding (max 3), in plain terms. The full list lives in Settings. */
export const MODEL_PICKS: Record<ModelLanguage, ModelPicks> = {
  english: [
    {
      modelId: 'ViT-B-32__laion2b-s34b-b79k',
      tier: 'Fast',
      note: 'Smallest download and quickest to index.',
    },
    { modelId: 'ViT-B-16-SigLIP__webli', tier: 'Balanced', note: 'Better results at a moderate size.' },
    {
      modelId: 'ViT-B-16-SigLIP2__webli',
      tier: 'Best',
      note: 'Most accurate. Also understands Spanish, French, German and other major languages.',
      recommended: true,
    },
  ],
  multilingual: [
    {
      modelId: 'XLM-Roberta-Base-ViT-B-32__laion5b_s13b_b90k',
      tier: 'Fast',
      note: 'Search in many languages, quickest to index.',
    },
    {
      modelId: 'nllb-clip-base-siglip__mrl',
      tier: 'Best',
      note: 'Most accurate across the widest range of languages, slower to index.',
      recommended: true,
    },
  ],
};

export function getRecommendedModelId(language: ModelLanguage): string {
  const picks = MODEL_PICKS[language];
  return (picks.find((pick) => pick.recommended) ?? picks[0]).modelId;
}
