import { AssetsService } from '@/db/api/services/assets.service';
import { RootAlbumsService } from '@/db/api/services/rootAlbums.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { MetadataStage } from '@/db/models/AssetDTO';
import { ProcessKind, useProcessStore } from '@/stores/processStore';
import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import { createContext, useContext, type ReactNode } from 'react';

const ImportStatusContext = createContext<{
  running: boolean;
  data: { metadata: number; locations: number; scanning: boolean } | null;
} | null>(null);

export function useImportStatus() {
  return useContext(ImportStatusContext);
}

export function ImportStatusProvider({ children }: { children: ReactNode }) {
  const inherited = useImportStatus();
  return inherited ? children : <ImportStatusSource>{children}</ImportStatusSource>;
}

function ImportStatusSource({ children }: { children: ReactNode }) {
  const running = useProcessStore((state) =>
    state.processes.some(
      (process) =>
        process.status === 'running' &&
        (process.kind === ProcessKind.Import || process.kind === ProcessKind.Sync),
    ),
  );
  const { data } = useLiveQuery(async () => {
    const [metadata, locations, roots] = await Promise.all([
      AssetsService.getPendingMetadataCount(MetadataStage.Discovered),
      AssetsService.getPendingMetadataCount(MetadataStage.LocationPending),
      RootAlbumsService.getAll(),
    ]);
    return { metadata, locations, scanning: roots.some((root) => Boolean(root.importPending)) };
  }, ['assets', 'rootAlbums']);

  return <ImportStatusContext.Provider value={{ running, data }}>{children}</ImportStatusContext.Provider>;
}

export function ImportStatus() {
  const { running, data } = useImportStatus() ?? { running: false, data: null };
  if (!data || (!data.scanning && data.metadata === 0 && data.locations === 0)) return null;

  const Icon = running ? IconLoader2 : IconAlertCircle;
  const message = !running
    ? 'Import unfinished'
    : data.scanning
      ? 'Finding photos'
      : data.metadata > 0
        ? `Reading photo details (${data.metadata.toLocaleString()} remaining)`
        : `Finding places (${data.locations.toLocaleString()} remaining)`;

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground" role="status">
      <Icon size={16} className={running ? 'shrink-0 motion-safe:animate-spin' : 'shrink-0'} aria-hidden />
      <span>
        {message}.{' '}
        {data.scanning || data.metadata > 0 ? 'Results and counts are incomplete.' : 'Places are incomplete.'}
      </span>
    </div>
  );
}
