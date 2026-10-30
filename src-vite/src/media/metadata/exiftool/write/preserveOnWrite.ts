import { warningLog } from '@/system/devLogger';
import { runExiftoolSession } from '../exiftoolSession';
import { stripControlCharacters } from './stripControlCharacters';

// ----------
// * COLLATERAL OF A REWRITE (tags exiftool changes even though the edit didn't)
// ----------
//
// Rewriting any tag makes exiftool rebuild the block it lives in, which restamps
// the XMP toolkit and invalidates Photoshop's IPTC digest. Neither is part of the
// edit, so both are read before the write and pinned back through it.

/** Tags read from a file before a write so the write can leave them as it found them. */
export interface PreservedWriteTags {
  /** The XMP toolkit string the file already carries; absent when it has no XMP. */
  xmpToolkit?: string;
  /** Whether the file already carries Photoshop's IPTC digest. */
  hasIptcDigest: boolean;
}

/** Windows hands us either slash direction and any case; exiftool answers in one. */
export function normalizeWritePath(fullPath: string): string {
  return fullPath.replace(/\\/g, '/').toLowerCase();
}

interface ProbeRow {
  SourceFile?: string;
  XMPToolkit?: string;
  IPTCDigest?: string;
}

/**
 * Reads both tags for a whole batch in one command on the shared exiftool session.
 * Preservation is cosmetic, so a failed probe is logged and skipped rather than
 * failing the edit the user actually asked for.
 */
export async function readPreservedWriteTags(fullPaths: string[]): Promise<Map<string, PreservedWriteTags>> {
  const preserved = new Map<string, PreservedWriteTags>();
  if (fullPaths.length === 0) return preserved;

  try {
    const stdout = await runExiftoolSession(
      [...fullPaths, '-json', '-XMP-x:XMPToolkit', '-Photoshop:IPTCDigest'],
      undefined,
      'read-preserved-write-tags',
    );
    if (!stdout.trim()) return preserved;

    for (const row of JSON.parse(stdout) as ProbeRow[]) {
      if (!row.SourceFile) continue;
      preserved.set(normalizeWritePath(row.SourceFile), {
        xmpToolkit: typeof row.XMPToolkit === 'string' ? stripControlCharacters(row.XMPToolkit) : undefined,
        hasIptcDigest: row.IPTCDigest != null,
      });
    }
  } catch (error) {
    warningLog('exiftool', 'preserved-write-tags-failed', { detail: String(error) });
  }

  return preserved;
}

/**
 * Assignments that keep a rewrite from changing metadata the edit never touched:
 *
 * - `XMPToolkit` names whichever tool last wrote the XMP packet, so exiftool
 *   stamps its own version over (say) Adobe's on every write. Assigning the
 *   previous value back keeps that provenance — trailing padding and all, which
 *   survives the argfile verbatim. A file with no XMP yet keeps exiftool's own
 *   value, which is then simply true.
 * - `IPTCDigest` is Photoshop's MD5 of the IPTC block. Rewriting IPTC without
 *   refreshing it leaves every reader warning "IPTCDigest is not current. XMP may
 *   be out of sync"; `new` recomputes it. Only files that already carried the tag
 *   get it, so a file that never had one does not gain it — and because Photokin
 *   writes the IPTC and XMP copies of a field together, declaring them in sync is
 *   accurate. When a write leaves IPTC untouched the digest recomputes unchanged.
 */
export function preservedWriteArgs(preserved: PreservedWriteTags | undefined): string[] {
  if (!preserved) return [];

  const args: string[] = [];
  if (preserved.xmpToolkit) args.push(`-XMP-x:XMPToolkit=${preserved.xmpToolkit}`);
  if (preserved.hasIptcDigest) args.push('-IPTCDigest=new');
  return args;
}
