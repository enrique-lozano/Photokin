import { MetadataMode } from '@/common/metadataOptions';
import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { CAPTURE_FIELDS, captureDraft, parseCaptureDraft } from './captureDraft';

export function EditCaptureDialog({ asset, onClose }: { asset: AssetInClient; onClose: () => void }) {
  const original = captureDraft(asset.metadata.camera);
  const [draft, setDraft] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mode = useSettingsStore((state) => state.metadataMode);
  const changedKeys = CAPTURE_FIELDS.filter(([key]) => draft[key] !== original[key]).map(([key]) => key);
  const overwrite = mode === MetadataMode.Full && changedKeys.some((key) => original[key] !== '');
  let validation = '';
  try {
    parseCaptureDraft(draft);
  } catch (cause) {
    validation = String(cause instanceof Error ? cause.message : cause);
  }

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const parsed = parseCaptureDraft(draft);
      const patch = Object.fromEntries(changedKeys.map((key) => [key, parsed[key]]));
      await AssetsService.updateAssetEditableFields(asset.id, patch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function fields(start: number, end: number) {
    return (
      <div className="capture-editor__fields">
        {CAPTURE_FIELDS.slice(start, end).map(([key, label]) => (
          <label key={key} className={key === 'lens' ? 'capture-editor__wide' : ''}>
            <span>{label}</span>
            <Input
              value={draft[key]}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="capture-editor"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit capture</DialogTitle>
          <DialogDescription>Camera and shot settings saved with the photo</DialogDescription>
        </DialogHeader>
        <DialogBody className="capture-editor__body">
          <aside>
            <AssetThumbnail asset={asset} />
            <p>{asset.filename}</p>
          </aside>
          <div className="capture-editor__form">
            <div className="info-row">
              <span className="font-semibold">Capture details</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  setDraft(Object.fromEntries(CAPTURE_FIELDS.map(([key]) => [key, ''])) as typeof draft)
                }
              >
                <IconTrash size={16} />
                Clear capture data
              </Button>
            </div>
            <section className="info-surface">
              <h5 className="mb-3.5 text-sm font-semibold">Camera</h5>
              {fields(0, 3)}
            </section>
            <section className="info-surface">
              <h5 className="mb-3.5 text-sm font-semibold">Shot settings</h5>
              {fields(3, 7)}
            </section>
            <Collapsible className="info-surface">
              <CollapsibleTrigger className="capture-editor__more">
                More settings
                <CollapsibleChevron className="ml-auto" />
              </CollapsibleTrigger>
              <CollapsiblePanel>{fields(7, 12)}</CollapsiblePanel>
            </Collapsible>
            {overwrite && (
              <p className="text-warning" role="status">
                Existing capture values will be replaced when metadata is written to the file.
              </p>
            )}
            {mode === MetadataMode.ReadOnly && (
              <p className="text-muted-foreground text-xs">
                Changes stay in your library. The original file is unchanged.
              </p>
            )}
            {(validation || error) && (
              <p role="alert" className="text-destructive-text">
                {validation || error}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-muted-foreground text-xs">
            {changedKeys.length ? 1 : 0} of 1 files changed
          </span>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!changedKeys.length || !!validation || busy}
            isLoading={busy}
            onClick={() => void apply()}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
