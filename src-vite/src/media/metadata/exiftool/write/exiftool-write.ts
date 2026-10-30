import {
  isNumericKind,
  WRITABLE_EXIFTOOL_FIELDS,
  type ExiftoolFieldValue,
  type WritableExiftoolFieldName,
} from '../exiftool-fields';
import { runBatchedExiftoolWrites } from './exiftool-batch';

// ----------
// * WRITING (persist editable fields back into the original file)
// ----------

/** Editable metadata fields Photokin can persist back into a file. */
export type EditableFileMetadata = {
  [Name in WritableExiftoolFieldName]?: ExiftoolFieldValue<Name> | null;
};

export function metadataWriteArgs(fields: EditableFileMetadata): string[] {
  const args: string[] = [];

  for (const [name, spec] of WRITABLE_EXIFTOOL_FIELDS) {
    if (!(name in fields)) continue;

    const value = fields[name];
    const suffix = isNumericKind(spec.kind) ? '#' : '';
    for (const tag of spec.writeTags ?? spec.tags)
      args.push(`-${tag}${suffix}=${value == null ? '' : String(value)}`);
  }

  return args;
}

/** Writes one file's editable fields, throwing exiftool's reason if it refused. */
export async function writeMetadataToFile(fullPath: string, fields: EditableFileMetadata): Promise<void> {
  const failure = (await writeMetadataToFiles([{ fullPath, fields }])).get(fullPath);
  if (failure) throw new Error(failure);
}

export interface FileMetadataWrite {
  fullPath: string;
  fields: EditableFileMetadata;
}

/**
 * Force-writes editable metadata into many files with as few exiftool spawns as
 * possible (see {@link runBatchedExiftoolWrites}). Files whose `fields` produce
 * no tag assignments are skipped entirely. Returns `fullPath → error message`
 * for any files exiftool could not write. `onProgress` fires per processed chunk.
 */
export async function writeMetadataToFiles(
  entries: FileMetadataWrite[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const writes = entries
    .map((entry) => ({ fullPath: entry.fullPath, tagArgs: metadataWriteArgs(entry.fields) }))
    .filter((write) => write.tagArgs.length > 0)
    .map((write) => ({
      fullPath: write.fullPath,
      args: [...write.tagArgs, '-overwrite_original', write.fullPath],
    }));

  return runBatchedExiftoolWrites(writes, onProgress);
}
