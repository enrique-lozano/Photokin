import { IconFolder, IconFolderFilled, IconFolderOpen, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { FILE_MOVE_WORDING } from '@/components/bulk-action/BulkActionResult';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import {
  useBulkActionDialog,
  useInertWhen,
  type BulkActionDialogPhaseKind,
} from '@/components/bulk-action/useBulkActionDialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { InputWithIcon } from '@/components/ui/inputWithIcon';
import { Tree } from '@/components/tree/Tree';
import { TreeEntryEl } from '@/components/tree/TreeEntryEl.model';
import { AlbumsService } from '@/db/api/services/albums.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AlbumInClient } from '@/db/models/AlbumDTO';
import { isAlbumHidden } from '@/pages/albums/mapAlbums';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useTreeSelectorMenu } from '@/pages/useTreeSelectorMenu';
import { moveAssetsToAlbum } from '@/system/moveAssets';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { useAppStore } from '@/stores/appState';
import { useMoveToFolderDialog } from './moveToFolderDialogStore';

const trimSlashes = (value: string): string => value.replace(/^[/\\]+|[/\\]+$/g, '');

/** Sorts every node's children alphabetically, depth-first. */
function sortTree(node: TreeEntryEl): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  node.children.forEach(sortTree);
}

/**
 * Builds the album folder tree from the flat album list, mirroring the Albums
 * page hierarchy (nested by `relativePath`) but with a plain node per album so
 * each maps to a real destination id. Root folders start expanded.
 */
function buildAlbumTree(albums: AlbumInClient[]): TreeEntryEl[] {
  const roots = albums.filter((album) => album.isAtTheRootLevel);

  const trees = roots.map((root) => {
    const rootNode: TreeEntryEl = {
      id: root.id,
      name: root.name,
      children: [],
      open: true,
      selected: false,
      startIcon: <IconFolderFilled size={16} />,
      hidden: isAlbumHidden(root, albums),
      openIcon: <IconFolderOpen size={16} />,
    };

    // Path (relative to the root) → node, so children attach to their parent.
    const nodeByPath = new Map<string, TreeEntryEl>([['', rootNode]]);

    albums
      .filter((album) => album.rootAlbumId === root.rootAlbumId && !album.isAtTheRootLevel)
      .map((album) => ({ album, relative: trimSlashes(album.relativePath) }))
      // Shallower folders first so a parent node always exists before its child.
      .sort((a, b) => a.relative.split('/').length - b.relative.split('/').length)
      .forEach(({ album, relative }) => {
        const parts = relative.split('/').filter(Boolean);
        const name = parts.at(-1) ?? album.name;
        const parentPath = parts.slice(0, -1).join('/');

        const node: TreeEntryEl = {
          id: album.id,
          name,
          children: [],
          open: false,
          selected: false,
          startIcon: <IconFolder size={16} />,
          hidden: isAlbumHidden(album, albums),
          openIcon: <IconFolderOpen size={16} />,
        };

        nodeByPath.set(relative, node);
        (nodeByPath.get(parentPath) ?? rootNode).children.push(node);
      });

    sortTree(rootNode);
    return rootNode;
  });

  trees.sort((a, b) => a.name.localeCompare(b.name));
  return trees;
}

/** Id of the first selected node (there is only ever one in single-select). */
function firstSelectedId(entries: TreeEntryEl[] | null): string | null {
  if (!entries) return null;
  for (const entry of entries) {
    if (entry.selected) return entry.id;
    const childId = firstSelectedId(entry.children);
    if (childId) return childId;
  }
  return null;
}

function photosLabel(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

function MoveToFolderContent({
  assets,
  onClose,
  onRunningChange,
  onPhaseChange,
}: {
  assets: AssetInClient[];
  onClose: () => void;
  onRunningChange: (running: boolean) => void;
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void;
}) {
  const { data: albums } = useLiveQuery(() => AlbumsService.getAll(), ['albums']);
  const albumById = useMemo(() => new Map((albums ?? []).map((album) => [album.id, album])), [albums]);

  const [tree, setTree] = useState<TreeEntryEl[] | null>(null);
  useEffect(() => {
    if (albums) setTree(buildAlbumTree(albums));
  }, [albums]);

  const { preparedTreeData, searchFilter, setSearchFilter } = useTreeSelectorMenu(tree, setTree);

  const selectedId = useMemo(() => firstSelectedId(tree), [tree]);
  const destination = selectedId ? (albumById.get(selectedId) ?? null) : null;

  // Photos already sitting in the destination folder have nothing to move.
  const movableCount = destination ? assets.filter((asset) => asset.album.id !== destination.id).length : 0;

  const bulkAction = useBulkActionDialog(onRunningChange, onPhaseChange);
  const isMoving = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isMoving);

  const handleMove = async () => {
    if (!destination || movableCount === 0) return;

    const destinationSnapshot = destination;
    await bulkAction.run({
      label: 'Moving photos',
      summary: (outcome) => `Moved ${photosLabel(outcome.total)} to “${destinationSnapshot.name}”`,
      action: async (onProgress): Promise<BulkOutcome> => {
        const result = await moveAssetsToAlbum(
          assets.map((asset) => ({
            id: asset.id,
            filename: asset.filename,
            fullPath: asset.fullPath,
            albumId: asset.album.id,
          })),
          destinationSnapshot,
          onProgress,
        );
        useAppStore.getState().setSelectedImages([]);
        return {
          total: result.movedIds.length,
          fileCount: assets.length,
          skipped: result.skipped.map((entry) => ({
            id: entry.id,
            label: entry.filename,
            reason: entry.reason,
          })),
          fileFailures: result.failures.map((entry) => ({
            id: entry.id,
            label: entry.filename,
            reason: entry.reason,
          })),
        };
      },
    });
  };

  if (bulkAction.phase.kind === 'result') {
    return (
      <BulkActionResultStep
        summary={bulkAction.phase.summary}
        outcome={bulkAction.phase.outcome}
        wording={FILE_MOVE_WORDING}
        isUndoing={bulkAction.isUndoing}
        onUndo={() => void bulkAction.undo(onClose)}
        onDone={onClose}
      />
    );
  }

  return (
    <>
      <DialogBody
        ref={editorRef}
        className={`flex flex-col gap-3 overflow-hidden ${
          isMoving ? 'pointer-events-none select-none opacity-60' : ''
        }`}
        aria-busy={isMoving}
      >
        <InputWithIcon
          startIcon={<IconSearch />}
          type="text"
          placeholder="Search folders"
          aria-label="Search folders"
          value={searchFilter ?? ''}
          onChange={(event) => setSearchFilter(event.target.value)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-1">
          {!preparedTreeData ? (
            <p className="p-4 text-sm text-muted-foreground">Loading folders…</p>
          ) : preparedTreeData.length === 0 ? (
            <EmptyState
              size="panel"
              icon={IconFolder}
              title="No folders yet"
              description="Add a folder from the Albums page first, then you can move photos into it."
            />
          ) : (
            <Tree entries={preparedTreeData} filter={searchFilter} itemHeightPx={32} />
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        {bulkAction.phase.kind === 'running' ? (
          <BulkActionProgress label={bulkAction.phase.label} progress={bulkAction.phase.progress} />
        ) : (
          <>
            <span
              className="mr-auto min-w-0 max-w-[60%] truncate text-xs text-muted-foreground"
              title={destination?.fullPath}
            >
              {destination ? `Destination: ${destination.fullPath}` : 'Select a destination folder'}
            </span>
            <Button type="button" variant="outline" onClick={onClose} disabled={isMoving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleMove()}
              disabled={!destination || movableCount === 0 || isMoving}
            >
              Move {photosLabel(movableCount || assets.length)}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

/** Global host: mounted once in the app shell, driven by {@link useMoveToFolderDialog}. */
export function MoveToFolderDialog() {
  const open = useMoveToFolderDialog((state) => state.open);
  const assets = useMoveToFolderDialog((state) => state.assets);
  const close = useMoveToFolderDialog((state) => state.close);

  // Keep the last assets during the close animation so the body doesn't blank out.
  const [rendered, setRendered] = useState(assets);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<BulkActionDialogPhaseKind>('edit');
  useEffect(() => {
    if (open) {
      setRendered(assets);
    } else {
      setIsRunning(false);
      setPhase('edit');
    }
  }, [open, assets]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !isRunning && close()}>
      <DialogContent
        className={`${phase === 'result' ? '' : 'h-[min(82vh,42rem)]'} w-[min(94vw,38rem)]`}
        hideCloseButton={isRunning}
      >
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>
            {phase === 'running'
              ? 'Moving files on disk and updating the library.'
              : phase === 'result'
                ? 'Review which files moved, were skipped, or failed.'
                : `Move ${photosLabel(rendered.length)} into a folder in your library. The files are moved on disk.`}
          </DialogDescription>
        </DialogHeader>
        {open && rendered.length > 0 && (
          <MoveToFolderContent
            assets={rendered}
            onClose={close}
            onRunningChange={setIsRunning}
            onPhaseChange={setPhase}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
