import { useEditTagsDialog } from '@/components/edit-tags/editTagsDialogStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import type { TagInClient } from '@/db/models/TagDTO';
import type { TagRegionInfoInClient } from '@/db/models/TagRegionInfoDTO';
import { TreeColorDot } from '@/components/tree/TreeColorDot';
import { IconTag, IconTagOff, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { PeopleSection } from './PeopleSection';

export function TagsSegment({
  asset,
  tags,
  faces,
  disabled,
  onFaceHover,
}: {
  asset: AssetInClient;
  tags: TagInClient[];
  faces: TagRegionInfoInClient[];
  disabled: boolean;
  onFaceHover?: (id: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function change(addTagIds: string[], removeTagIds: string[]) {
    const result = await AssetsService.updateAssetsTags({ assetIds: [asset.id], addTagIds, removeTagIds });
    if (result.fileFailures.size) throw new Error([...result.fileFailures.values()].join('; '));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        className="lightbox-info-content"
        role="tabpanel"
        id="info-panel-tags"
        aria-labelledby="info-tab-tags"
      >
        <section className="info-surface tags-card">
          <div className="info-row">
            <h5 className="text-xs font-semibold uppercase text-muted-foreground">Keywords</h5>
            <Badge variant="secondary">{tags.length}</Badge>
          </div>
          {tags.length ? (
            <div className="tag-chips">
              {tags.map((tag) => {
                const parent = tag.fullPath.split('/').slice(0, -1).join(' › ');
                return (
                  <Badge
                    variant="outline"
                    className="h-auto min-h-6 max-w-full gap-1.5 whitespace-normal py-0.5 pr-1 [overflow-wrap:anywhere]"
                    key={tag.id}
                    title={tag.fullPath}
                  >
                    <TreeColorDot seed={tag.rootId} color={tag.color} />
                    <span className="min-w-0">
                      {parent && <span className="text-muted-foreground text-xs">{parent} › </span>}
                      {tag.name}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label={`Remove ${tag.name}`}
                      title={`Remove ${tag.name}`}
                      disabled={disabled || busy}
                      onClick={() => void run(() => change([], [tag.id]))}
                    >
                      <IconX size={14} />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No keywords yet</p>
          )}
          {error && (
            <p role="alert" className="text-destructive-text">
              {error}
            </p>
          )}
        </section>
        {faces.length ? (
          <PeopleSection
            img={asset}
            faceRegions={faces}
            isOpen
            standalone
            onToggle={() => {}}
            canEditMetadata={!disabled}
            onFaceHover={onFaceHover}
          />
        ) : (
          <section className="info-surface tags-card">
            <div className="info-row">
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">People</h5>
              <Badge variant="secondary">0</Badge>
            </div>
            <p className="text-muted-foreground text-xs">No people in this photo</p>
          </section>
        )}
      </div>
      <footer className="info-pinned-footer">
        <Button
          variant="ghost"
          disabled={disabled || busy || !tags.length}
          onClick={() =>
            void run(async () => {
              const ids = tags.map((tag) => tag.id);
              await change([], ids);
              toast.success('Tags cleared', {
                action: {
                  label: 'Undo',
                  onClick: () => {
                    void run(() => change(ids, []));
                  },
                },
              });
            })
          }
        >
          <IconTagOff size={16} />
          Clear tags
        </Button>
        <Button disabled={disabled || busy} onClick={() => useEditTagsDialog.getState().openDialog([asset])}>
          <IconTag size={16} />
          Edit tags...
        </Button>
      </footer>
    </>
  );
}
