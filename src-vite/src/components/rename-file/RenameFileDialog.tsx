import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Input } from '@/components/ui/input';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { useAppStore } from '@/stores/appState';
import { IconPencil } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { isValidFilename, renameAssetFile } from './renameAssetFile';
import { useRenameFileDialog } from './renameFileDialogStore';

/** The selection keeps asset snapshots, so swap in the renamed one. */
async function _refreshSelected(assetId: string): Promise<void> {
  const fresh = await AssetsService.getByUUID(assetId);
  const { selectedImages, setSelectedImages } = useAppStore.getState();
  setSelectedImages(selectedImages.map((image) => (image.id === assetId ? fresh : image)));
}

function RenameFileForm({ asset, onClose }: { asset: AssetInClient; onClose: () => void }) {
  const [draft, setDraft] = useState(asset.filename);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filename = draft.trim();
  const canRename = isValidFilename(filename) && filename !== asset.filename;

  const handleRename = async () => {
    if (!canRename || isRenaming) return;

    setIsRenaming(true);
    try {
      if (await renameAssetFile(asset, filename)) {
        onClose();
        await _refreshSelected(asset.id);
      }
    } finally {
      setIsRenaming(false);
    }
  };

  // Selecting only the name leaves the extension safe from a quick overtype.
  const selectBaseName = (input: HTMLInputElement) => {
    const extensionStart = asset.filename.lastIndexOf('.');
    input.setSelectionRange(0, extensionStart > 0 ? extensionStart : asset.filename.length);
  };

  return (
    <ConfirmationDialog
      open
      onOpenChange={(open) => !open && onClose()}
      icon={<IconPencil size={24} />}
      title="Rename file"
      description="This renames the file on disk and keeps its tags, faces and edits."
      confirmLabel="Rename"
      onConfirm={() => void handleRename()}
      confirmDisabled={!canRename}
      isConfirming={isRenaming}
      keepOpenOnConfirm
      initialFocusRef={inputRef}
      content={
        <Input
          ref={inputRef}
          value={draft}
          aria-label="File name"
          disabled={isRenaming}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => selectBaseName(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleRename();
          }}
        />
      }
    />
  );
}

/** Asks for a new name for the single photo or video that was selected. */
export function RenameFileDialog() {
  const open = useRenameFileDialog((state) => state.open);
  const asset = useRenameFileDialog((state) => state.assets[0]);
  const close = useRenameFileDialog((state) => state.close);

  return open && asset ? <RenameFileForm key={asset.id} asset={asset} onClose={close} /> : null;
}
