import { runExiftoolSession } from '../exiftoolSession';

export interface ExplorerRow {
  group: string;
  tag: string;
  value: string;
}
export interface MetadataSnapshot {
  raw: Record<string, unknown>;
  rows: ExplorerRow[];
  loadedAt: number;
  version: string;
}
const cache = new Map<string, { revision: number | undefined; promise: Promise<MetadataSnapshot> }>();
const groupOrder = ['Composite', 'EXIF', 'File', 'XMP', 'IPTC'];

export function metadataRows(raw: Record<string, unknown>): ExplorerRow[] {
  return Object.entries(raw)
    .filter(([key]) => key !== 'SourceFile')
    .map(([key, value]) => {
      const separator = key.indexOf(':');
      return {
        group: separator < 0 ? 'File' : key.slice(0, separator),
        tag: separator < 0 ? key : key.slice(separator + 1),
        value: typeof value === 'string' ? value : (JSON.stringify(value) ?? ''),
      };
    })
    .sort((a, b) => {
      const aIndex = groupOrder.indexOf(a.group);
      const bIndex = groupOrder.indexOf(b.group);
      return (aIndex < 0 ? groupOrder.length : aIndex) - (bIndex < 0 ? groupOrder.length : bIndex);
    });
}

export function loadFullMetadata(path: string, revision?: number, reload = false): Promise<MetadataSnapshot> {
  const previous = cache.get(path);
  if (!reload && previous && previous.revision === revision) return previous.promise;
  const promise = (async () => {
    const output = await runExiftoolSession(
      // No `--`: in the stay_open stream it would turn `-execute` into a file name and hang.
      ['-json', '-G0', '-struct', path],
      undefined,
      'metadata-explorer',
    );
    const parsed: unknown = JSON.parse(output);
    const raw: unknown = Array.isArray(parsed) ? parsed[0] : null;
    if (!raw || typeof raw !== 'object') throw new Error('ExifTool returned no metadata');
    const record = raw as Record<string, unknown>;
    if (record['ExifTool:Error']) throw new Error(String(record['ExifTool:Error']));
    return {
      raw: record,
      rows: metadataRows(record),
      loadedAt: Date.now(),
      version: String(record['ExifTool:ExifToolVersion'] ?? 'unknown'),
    };
  })();
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  cache.set(path, { revision, promise });
  void promise.catch(() => {
    if (cache.get(path)?.promise === promise) cache.delete(path);
  });
  return promise;
}
