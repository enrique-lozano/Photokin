import { useEffect, useState, type ReactNode } from 'react';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { MetadataMode, WriteBackTiming } from '@/common/metadataOptions';
import { useSettingsStore } from '@/stores/settingsStore';
import { IdentityAutosave } from './identityAutosave';

const queues = new Map<string, IdentityAutosave>();

export function IdentityCard({
  asset,
  active,
  disabled,
  children,
}: {
  asset: AssetInClient;
  active: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  const [autosave] = useState(() => {
    let queue = queues.get(asset.id);
    if (!queue) {
      queue = new IdentityAutosave(
        { title: asset.metadata.title ?? '', description: asset.metadata.description ?? '' },
        async (value) => {
          try {
            await AssetsService.updateAssetEditableFields(asset.id, value);
          } catch (cause) {
            toast.error('Could not save title and description', { description: String(cause) });
            throw cause;
          }
        },
      );
      queues.set(asset.id, queue);
    }
    return queue;
  });
  const [state, setState] = useState(autosave.state);
  const mode = useSettingsStore((settings) => settings.metadataMode);
  const timing = useSettingsStore((settings) => settings.writeBackTiming);
  const showPhotoDescription = useSettingsStore((settings) => settings.showPhotoDescription);
  useEffect(() => autosave.subscribe(setState), [autosave]);
  useEffect(() => {
    if (!active) autosave.flush();
  }, [active, autosave]);
  useEffect(
    () =>
      autosave.refresh({ title: asset.metadata.title ?? '', description: asset.metadata.description ?? '' }),
    [asset.metadata.title, asset.metadata.description, autosave],
  );

  return (
    <section className="info-surface identity-card">
      <Input
        aria-label="Title"
        placeholder="Add a title"
        className="identity-card__title focus-visible:ring-0 focus-visible:ring-offset-0"
        value={state.draft.title}
        disabled={disabled}
        onChange={(event) => autosave.edit('title', event.target.value)}
        onBlur={() => autosave.flush()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            autosave.flush();
          }
          if (event.key === 'Escape') {
            event.stopPropagation();
            autosave.revert('title');
          }
        }}
      />
      {showPhotoDescription && (
        <Textarea
          aria-label="Description"
          placeholder="Add a description..."
          autoResize
          className="focus-visible:ring-0 focus-visible:ring-offset-0"
          value={state.draft.description}
          disabled={disabled}
          onChange={(event) => autosave.edit('description', event.target.value)}
          onBlur={() => autosave.flush()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              autosave.revert('description');
            }
          }}
        />
      )}
      <div className="identity-card__keywords">{children}</div>
      {state.status !== 'idle' && (
        <div className="identity-card__status" role="status">
          {state.status === 'saving'
            ? 'Saving...'
            : state.status === 'error'
              ? state.error
              : mode === MetadataMode.ReadOnly
                ? 'Saved in library'
                : timing === WriteBackTiming.DeferredOnSync
                  ? 'Saved in library · file write queued'
                  : 'Saved to file'}
          {state.status === 'error' && (
            <Button variant="ghost" size="sm" onClick={() => autosave.flush()}>
              Retry
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
