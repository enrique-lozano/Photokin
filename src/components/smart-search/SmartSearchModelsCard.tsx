import { Button } from '@/components/ui/button';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { clearAssetEmbeddings } from '@/media/smartSearch/embeddingStore';
import { startBackgroundIndexing } from '@/media/smartSearch/indexing';
import {
  cancelModelDownload,
  downloadModel,
  observeModelDownloads,
  useModelDownloads,
} from '@/media/smartSearch/modelDownload';
import {
  CLIP_MODELS,
  ClipModel,
  formatMegabytes,
  formatModelSize,
  getModelDir,
  isModelDownloaded,
  groupModels,
  MODEL_LANGUAGES,
} from '@/media/smartSearch/models';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { IconDownload, IconFolder, IconLanguage, IconSparkles, IconX } from '@tabler/icons-react';
import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './smartSearchModels.css';
import { ModelRatings } from './ModelRatings';

/**
 * Lists the available CLIP models, letting the user download them (with a
 * progress bar) and pick the active one. Switching models drops the old
 * embeddings and re-indexes, since vectors from different models aren't
 * comparable. Reusable across onboarding and settings.
 */
export function modelDisplay(model: ClipModel): { name: string; metadata: string } {
  const [name, ...details] = model.label.split(' · ');
  return { name, metadata: [...details, formatModelSize(model)].join(' · ') };
}

export function SmartSearchModelsCard({
  selectionPath,
}: {
  /** Render a settings row summarizing the active model, linking to the full selector. */
  selectionPath?: string;
}) {
  const activeModel = useSmartSearchSettingsStore((state) => state.activeModel);
  const setActiveModel = useSmartSearchSettingsStore((state) => state.setActiveModel);

  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const progress = useModelDownloads((state) => state.progress);
  const downloadRevision = useModelDownloads((state) => state.revision);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activatingModelId, setActivatingModelId] = useState<string | null>(null);

  const isBusy = (modelId: string) => progress[modelId] !== undefined && progress[modelId] < 1;

  const refreshDownloaded = useCallback(async () => {
    try {
      const entries = await Promise.all(
        CLIP_MODELS.map(async (model) => [model.id, await isModelDownloaded(model.id)] as const),
      );
      setDownloaded(Object.fromEntries(entries));
      setLoadError(null);
    } catch (error) {
      setLoadError(`Could not read downloaded models: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDownloaded();
  }, [refreshDownloaded, downloadRevision]);

  useEffect(() => {
    void observeModelDownloads().catch((error) => {
      toast.error(`Could not observe model downloads: ${String(error)}`);
    });
  }, []);

  const handleDownload = async (model: ClipModel) => {
    if (isBusy(model.id)) return;
    try {
      const result = await downloadModel(model.id);
      if (result.status !== 'completed') {
        return;
      }
      setDownloaded((current) => ({ ...current, [model.id]: true }));
      toast.success(`Model "${model.label}" downloaded`);
      if (model.id === activeModel) startBackgroundIndexing();
    } catch (error) {
      toast.error(`Could not download the model: ${String(error)}`);
    }
  };

  const handleCancelDownload = async (model: ClipModel) => {
    try {
      await cancelModelDownload(model.id);
    } catch (error) {
      toast.error(`Could not cancel the download: ${String(error)}`);
    }
  };

  const handleActivate = async (model: ClipModel) => {
    if (model.id === activeModel) return;
    setActivatingModelId(model.id);
    try {
      await clearAssetEmbeddings();
      setActiveModel(model.id);
      if (downloaded[model.id]) startBackgroundIndexing();
    } catch (error) {
      toast.error(`Could not switch search models: ${String(error)}`);
    } finally {
      setActivatingModelId(null);
    }
  };

  const handleOpenFolder = async (model: ClipModel) => {
    try {
      await openPath(await getModelDir(model.id));
    } catch (error) {
      toast.error(`Could not open the model folder: ${String(error)}`);
    }
  };

  const renderDownloadProgress = (model: ClipModel) => {
    if (!isBusy(model.id)) return null;
    const fraction = progress[model.id];
    const percent = Math.round(fraction * 100);
    return (
      <div className="model-resource__progress-wrap">
        <div
          className="model-resource__progress"
          role="progressbar"
          aria-label={`Downloading ${modelDisplay(model).name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="model-resource__progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="model-resource__progress-label">
          <span>
            Downloading · {formatMegabytes(fraction * model.sizeMb)} of {formatModelSize(model)}
          </span>
          <span>{percent}%</span>
        </div>
      </div>
    );
  };

  const renderModel = (model: ClipModel, featured = false) => {
    const isActive = model.id === activeModel;
    const isDownloaded = downloaded[model.id];
    const isDownloading = isBusy(model.id);
    const isSwitching = activatingModelId === model.id;
    const display = modelDisplay(model);

    return (
      <article
        key={model.id}
        className={featured ? 'model-resource model-resource--active' : 'model-resource'}
      >
        <div className="model-resource__row">
          <div className="model-resource__icon" aria-hidden="true">
            <IconSparkles size={18} />
          </div>

          <div className="model-resource__info">
            <h4 className="model-resource__name">
              <span className="model-resource__name-text">{display.name}</span>
              {model.recommended && <Badge variant="info">Recommended</Badge>}
              {model.languages !== 'english' && (
                <IconLanguage
                  size={15}
                  className="model-resource__language"
                  aria-label={MODEL_LANGUAGES[model.languages].label}
                />
              )}
            </h4>
            <p className="model-resource__meta">
              <span title={MODEL_LANGUAGES[model.languages].description}>
                {MODEL_LANGUAGES[model.languages].label}
              </span>{' '}
              · {formatModelSize(model)}
              {isDownloaded && !isActive && <span> · Downloaded</span>}
              {isActive && !isDownloaded && (
                <span className="text-warning"> · Selected, download required</span>
              )}
            </p>
          </div>

          <ModelRatings model={model} />
          <div className="model-resource__actions">
            {isDownloaded && (
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => void handleOpenFolder(model)}
                title="Open model folder"
                aria-label={`Open folder for ${display.name}`}
              >
                <IconFolder size={16} />
              </Button>
            )}

            {isDownloading ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleCancelDownload(model)}
                title="Cancel download"
                aria-label={`Cancel downloading ${display.name}`}
              >
                <IconX size={16} />
              </Button>
            ) : !isDownloaded ? (
              <Button size="sm" onClick={() => void handleDownload(model)}>
                <IconDownload size={16} />
                Download
              </Button>
            ) : (
              !isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={isSwitching}
                  disabled={activatingModelId !== null}
                  onClick={() => void handleActivate(model)}
                >
                  {isSwitching ? 'Switching' : 'Use model'}
                </Button>
              )
            )}
          </div>
        </div>

        {renderDownloadProgress(model)}
      </article>
    );
  };

  const selectedModel = CLIP_MODELS.find((model) => model.id === activeModel) ?? CLIP_MODELS[0];
  const groups = groupModels(activeModel, downloaded, progress);

  if (selectionPath) {
    const display = modelDisplay(selectedModel);
    const isReady = downloaded[selectedModel.id];
    const isDownloading = isBusy(selectedModel.id);

    return (
      <div>
        <SettingsRow
          icon={<IconSparkles size={18} />}
          label={display.name}
          description={
            isLoading
              ? 'Checking downloaded models…'
              : (loadError ??
                `Finds photos by what’s in them. ${MODEL_LANGUAGES[selectedModel.languages].label} · Runs on this device.`)
          }
          role={loadError ? 'alert' : undefined}
        >
          {loadError ? (
            <Button size="sm" variant="outline" onClick={() => void refreshDownloaded()}>
              Retry
            </Button>
          ) : isDownloading ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void handleCancelDownload(selectedModel)}
              title="Cancel download"
              aria-label={`Cancel downloading ${display.name}`}
            >
              <IconX size={16} />
            </Button>
          ) : (
            !isReady &&
            !isLoading && (
              <Button size="sm" onClick={() => void handleDownload(selectedModel)}>
                <IconDownload size={16} />
                Download
              </Button>
            )
          )}
          <Button asChild size="sm" variant="outline">
            <Link to={selectionPath} aria-label={`Change search model, currently ${display.name}`}>
              Change
            </Link>
          </Button>
        </SettingsRow>
        {isDownloading && (
          <div className="model-overview__download">{renderDownloadProgress(selectedModel)}</div>
        )}
      </div>
    );
  }

  return (
    <div className="model-manager">
      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking downloaded models…
        </p>
      ) : loadError ? (
        <div role="alert">
          <p className="text-sm text-destructive-text">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void refreshDownloaded()}>
            Retry
          </Button>
        </div>
      ) : (
        groups.map(
          (group) =>
            group.models.length > 0 && (
              <section key={group.label} className="model-manager__section" aria-label={group.label}>
                <h3 className="model-manager__label">{group.label}</h3>
                <div className="model-resource-list">
                  {group.models.map((model) => renderModel(model, model.id === activeModel))}
                </div>
              </section>
            ),
        )
      )}
    </div>
  );
}
