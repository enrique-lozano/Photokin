import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';

/** How well a model understands search queries beyond English. */
export type ModelLanguages = 'english' | 'major' | 'many';

export const MODEL_LANGUAGES: Record<ModelLanguages, { label: string; description: string }> = {
  english: { label: 'English', description: 'Works best with searches written in English.' },
  major: {
    label: 'Major languages',
    description: 'Also understands widely spoken languages such as Spanish, French, German or Portuguese.',
  },
  many: {
    label: 'Many languages',
    description: 'Understands dozens of languages, including Asian and less widely spoken ones.',
  },
};

export type ClipModel = {
  /** HuggingFace repo id (the ONNX CLIP repo, appended to the download base URL). */
  id: string;
  label: string;
  /** Embedding dimensionality (informational; search matches by vector length). */
  dim: number;
  /** Approximate download size in MB, for the UI. */
  sizeMb: number;
  languages: ModelLanguages;
  /** Relative guidance within this catalog (1-4), derived from Immich's CLIP
   * benchmark: speed from CPU time per image, accuracy from search recall in
   * the languages the model is labelled for. */
  speed: 1 | 2 | 3 | 4;
  accuracy: 1 | 2 | 3 | 4;
  recommended?: boolean;
  /**
   * How to tell a match from noise for this model. SigLIP models were trained
   * with a scale and bias that turn the similarity into a match probability
   * (values read from the original checkpoints). Plain CLIP models have none,
   * so they get a similarity floor measured on labelled queries
   * (`scripts/clip/calibrate.py`).
   */
  match: { scale: number; bias: number } | { minSimilarity: number };
};

// A small curated set of CLIP models spanning English, major-language and
// many-language options. All are single-file immich-app ONNX repos that share
// the same layout (see MODEL_FILES); repos whose weights are split into
// external-data files can't be fetched by the downloader. Ordered from
// lightest to heaviest; the first one is the default.
// prettier-ignore
export const CLIP_MODELS: ClipModel[] = [
  { id: 'ViT-B-32__laion2b-s34b-b79k', label: 'CLIP ViT-B/32 (LAION) · fast', dim: 512, sizeMb: 580, languages: 'english', speed: 4, accuracy: 1, match: { minSimilarity: 0.236 } },
  { id: 'ViT-B-16-SigLIP__webli', label: 'SigLIP ViT-B/16 · balanced', dim: 768, sizeMb: 780, languages: 'english', speed: 3, accuracy: 2, match: { scale: 117.33, bias: -12.932 } },
  { id: 'ViT-B-16-SigLIP-384__webli', label: 'SigLIP ViT-B/16 384px · sharper', dim: 768, sizeMb: 780, languages: 'english', speed: 2, accuracy: 3, match: { scale: 117.78, bias: -12.933 } },
  { id: 'XLM-Roberta-Base-ViT-B-32__laion5b_s13b_b90k', label: 'XLM-RoBERTa CLIP ViT-B/32 · fast', dim: 512, sizeMb: 1400, languages: 'many', speed: 4, accuracy: 2, match: { minSimilarity: 0.191 } },
  { id: 'ViT-B-16-SigLIP-i18n-256__webli', label: 'SigLIP i18n ViT-B/16 · balanced', dim: 768, sizeMb: 1410, languages: 'many', speed: 3, accuracy: 2, match: { scale: 111.0, bias: -12.885 } },
  { id: 'ViT-B-16-SigLIP2__webli', label: 'SigLIP2 ViT-B/16 · higher quality', dim: 768, sizeMb: 1430, languages: 'major', speed: 3, accuracy: 4, recommended: true, match: { scale: 112.67, bias: -16.772 } },
  { id: 'ViT-B-32-SigLIP2-256__webli', label: 'SigLIP2 ViT-B/32 · fast', dim: 768, sizeMb: 1440, languages: 'major', speed: 4, accuracy: 2, match: { scale: 111.83, bias: -16.767 } },
  { id: 'nllb-clip-base-siglip__mrl', label: 'NLLB-CLIP base · widest language coverage', dim: 768, sizeMb: 1940, languages: 'many', speed: 1, accuracy: 3, recommended: true, match: { scale: 88.12, bias: -9.809 } },
];

export const DEFAULT_CLIP_MODEL_ID = CLIP_MODELS[0].id;

/** In-progress downloads sit with the downloaded models, where they'll end up. */
export function groupModels(
  activeModel: string,
  downloaded: Readonly<Record<string, boolean>>,
  progress: Readonly<Record<string, number>>,
): { label: string; models: ClipModel[] }[] {
  const groups = ['In use', 'Downloaded', 'Not downloaded'].map((label) => ({
    label,
    models: [] as ClipModel[],
  }));
  for (const model of CLIP_MODELS) {
    const isDownloading = progress[model.id] !== undefined && progress[model.id] < 1;
    const groupIndex = isDownloading
      ? 1
      : model.id === activeModel && downloaded[model.id]
        ? 0
        : downloaded[model.id]
          ? 1
          : 2;
    groups[groupIndex].models.push(model);
  }
  return groups;
}
export function formatMegabytes(megabytes: number): string {
  return megabytes >= 1000 ? `${Number((megabytes / 1000).toFixed(1))} GB` : `${Math.round(megabytes)} MB`;
}

export function formatModelSize(model: ClipModel): string {
  return `~${formatMegabytes(model.sizeMb)}`;
}

/** Files (relative to the repo) required for CPU inference. */
export const MODEL_FILES = [
  'visual/model.onnx',
  'visual/preprocess_cfg.json',
  'textual/model.onnx',
  'textual/tokenizer.json',
  'textual/tokenizer_config.json',
];

export const getModelsBasePath = async () => join(await appLocalDataDir(), 'clip-models');
export const getModelDir = async (modelId: string) => join(await getModelsBasePath(), modelId);

/** True once every required file for `modelId` is present on disk. */
export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const dir = await getModelDir(modelId);
  if (!(await exists(dir))) return false;
  for (const file of MODEL_FILES) {
    if (!(await exists(await join(dir, file)))) return false;
  }
  return true;
}

/** True if at least one curated CLIP model is fully downloaded. */
export async function hasAnyDownloadedModel(): Promise<boolean> {
  const results = await Promise.all(CLIP_MODELS.map((model) => isModelDownloaded(model.id)));
  return results.some(Boolean);
}
