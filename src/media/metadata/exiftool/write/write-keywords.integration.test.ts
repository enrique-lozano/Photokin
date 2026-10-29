import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { keywordsWriteArgs } from './write-keywords';

const runExiftool = useExiftoolTestSession();
const DEMO_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../../../demo');
const SOURCE_CANDIDATES = ['exif-samples/jpg/gps/DSCN0010.jpg', 'images/IMG_5910.jpg'];
const source = SOURCE_CANDIDATES.map((relative) => path.join(DEMO_DIR, relative)).find(existsSync);

/** The exact string from the bug report that Windows argv turned into "?????". */
const SPECIAL = 'æÆøØåÅéÉüÜäÄöÖïÏñÑ';

/**
 * Runs exiftool exactly the way production does — arguments handed over through a
 * UTF-8 argfile (`-@`) instead of argv, so non-ASCII survives on Windows. This
 * mirrors `executeExiftoolWithArgs` (which can't run here because it depends on
 * Tauri APIs), and is the whole point of the test: passing `args` on the command
 * line directly would reproduce the "?????" corruption on Windows.
 */
async function _runViaArgfile(args: string[], workDir: string): Promise<void> {
  const argfile = path.join(workDir, `args-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(argfile, `${args.join('\n')}\n`, 'utf8');
  try {
    await runExiftool(['-charset', 'filename=UTF8', '-@', argfile]);
  } finally {
    rmSync(argfile, { force: true });
  }
}

async function _readKeywords(file: string): Promise<Record<string, unknown>> {
  const { stdout } = await runExiftool([
    '-json',
    '-charset',
    'filename=UTF8',
    '-XMP-dc:Subject',
    '-IPTC:Keywords',
    '-EXIF:XPKeywords',
    '-XMP-lr:HierarchicalSubject',
    file,
  ]);
  return (JSON.parse(stdout) as Record<string, unknown>[])[0];
}

const _asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

describe.skipIf(!source)('keyword write on a real demo image', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'photokin-keywords-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it('round-trips non-ASCII keywords through the UTF-8 argfile without corruption', async () => {
    const dest = path.join(workDir, 'keywords.jpg');
    copyFileSync(source as string, dest);

    await _runViaArgfile(
      keywordsWriteArgs({ fullPath: dest, tagPaths: [`People/${SPECIAL}`, 'plain'] }),
      workDir,
    );

    const written = await _readKeywords(dest);

    // The special characters survive in every scheme — no "?" replacement.
    expect(_asArray(written.Subject)).toEqual(expect.arrayContaining([SPECIAL, 'plain']));
    expect(_asArray(written.Keywords)).toEqual(expect.arrayContaining([SPECIAL, 'plain']));
    expect(_asArray(written.HierarchicalSubject)).toContain(`People|${SPECIAL}`);
    expect(String(written.XPKeywords)).toContain(SPECIAL);

    expect(JSON.stringify(written)).not.toContain('?');
  }, 10_000);

  it('clears every scheme when the tag set is empty', async () => {
    const dest = path.join(workDir, 'keywords-clear.jpg');
    copyFileSync(source as string, dest);

    await _runViaArgfile(keywordsWriteArgs({ fullPath: dest, tagPaths: [SPECIAL] }), workDir);
    await _runViaArgfile(keywordsWriteArgs({ fullPath: dest, tagPaths: [] }), workDir);

    const cleared = await _readKeywords(dest);
    expect(cleared.Subject).toBeUndefined();
    expect(cleared.Keywords).toBeUndefined();
    expect(cleared.HierarchicalSubject).toBeUndefined();
    expect(cleared.XPKeywords).toBeUndefined();
  }, 10_000);
});
