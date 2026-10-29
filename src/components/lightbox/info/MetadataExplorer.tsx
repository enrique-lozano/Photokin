import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { loadFullMetadata, type MetadataSnapshot } from '@/media/metadata/exiftool/read/metadataExplorer';
import { useAppStore } from '@/stores/appState';
import { IconCopy, IconDownload, IconRefresh } from '@tabler/icons-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useState } from 'react';
import { MetadataRows } from './MetadataRows';

export function MetadataExplorer({
  asset,
  onCount,
}: {
  asset: AssetInClient;
  onCount: (count: number) => void;
}) {
  const revision = useAppStore((state) => state.assetRevisions[asset.id]);
  const [snapshot, setSnapshot] = useState<MetadataSnapshot | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError('');
    onCount(0);
    loadFullMetadata(asset.fullPath, revision, request > 0)
      .then((result) => {
        if (!cancelled) {
          setSnapshot(result);
          onCount(result.rows.length);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [asset.fullPath, revision, request, onCount]);

  async function copy(value: string) {
    try {
      await writeText(value);
      toast.success('Metadata copied');
    } catch {
      toast.error('Could not copy metadata');
    }
  }
  async function exportJson() {
    if (!snapshot) return;
    try {
      const path = await save({
        defaultPath: `${asset.filename}.metadata.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (path) {
        await writeTextFile(path, JSON.stringify(snapshot.raw, null, 2));
        toast.success('Metadata exported');
      }
    } catch (cause) {
      toast.error('Could not export metadata', { description: String(cause) });
    }
  }
  if (error)
    return (
      <div role="alert" className="info-surface">
        <p>{error}</p>
        <Button onClick={() => setRequest((value) => value + 1)}>Retry</Button>
      </div>
    );
  if (!snapshot)
    return (
      <div aria-label="Loading metadata" role="status" className="metadata-loading">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-20 w-full" />
        ))}
      </div>
    );
  const groups = [...new Set(snapshot.rows.map((row) => row.group))];
  const rows = snapshot.rows.filter((row) =>
    `${row.tag} ${row.value} ${row.group}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="metadata-toolbar">
        <Input
          aria-label="Search tags"
          placeholder={`Search ${snapshot.rows.length} tags...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="Copy all metadata"
          title="Copy all metadata"
          onClick={() => void copy(JSON.stringify(snapshot.raw, null, 2))}
        >
          <IconCopy size={16} />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Export metadata as JSON"
          title="Export metadata as JSON"
          onClick={() => void exportJson()}
        >
          <IconDownload size={16} />
        </Button>
      </div>
      <div className="info-surface metadata-groups">
        {groups
          .filter((group) => rows.some((row) => row.group === group))
          .map((group) => (
            // Remounts when search starts/clears so matching groups open, like before.
            <Collapsible
              key={`${asset.id}-${group}-${!!query}`}
              className="metadata-group"
              defaultOpen={!!query || group === 'EXIF'}
            >
              <CollapsibleTrigger className="metadata-group__trigger">
                {group}
                <Badge variant="secondary" className="ml-auto">
                  {rows.filter((row) => row.group === group).length}
                </Badge>
                <CollapsibleChevron />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <MetadataRows
                  showEmpty
                  rows={rows
                    .filter((row) => row.group === group)
                    .map((row) => ({
                      label: row.tag,
                      value: row.value,
                      actions: (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Copy ${row.tag}`}
                          title={`Copy ${row.tag}`}
                          onClick={() => void copy(row.value)}
                        >
                          <IconCopy size={16} />
                        </Button>
                      ),
                    }))}
                />
              </CollapsiblePanel>
            </Collapsible>
          ))}
        {!rows.length && <p className="text-muted-foreground px-3.5 py-3 text-xs">No matching metadata</p>}
      </div>
      <div className="info-row text-muted-foreground text-xs metadata-loaded">
        <span>
          ExifTool {snapshot.version} · {new Date(snapshot.loadedAt).toLocaleTimeString()}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setRequest((value) => value + 1)}>
          <IconRefresh size={16} />
          Reload
        </Button>
      </div>
    </>
  );
}
