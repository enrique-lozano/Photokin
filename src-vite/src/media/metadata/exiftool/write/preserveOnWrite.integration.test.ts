import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { preservedWriteArgs } from './preserveOnWrite';
import { keywordsWriteArgs } from './write-keywords';

const runExiftool = useExiftoolTestSession();
const DEMO_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../../../../demo');
// Carries both an Adobe XMP packet and a Photoshop IPTC digest, which is exactly
// the combination a rewrite damages.
const source = path.join(DEMO_DIR, 'images/IMG_5910.jpg');

/** Mirrors production's transport: arguments through a UTF-8 argfile, never argv. */
async function _runViaArgfile(args: string[], workDir: string): Promise<void> {
  const argfile = path.join(workDir, `args-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(argfile, `${args.join('\n')}\n`, 'utf8');
  try {
    await runExiftool(['-charset', 'filename=UTF8', '-@', argfile]);
  } finally {
    rmSync(argfile, { force: true });
  }
}

async function _read(file: string, tags: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await runExiftool(['-json', ...tags, file]);
  return (JSON.parse(stdout) as Record<string, unknown>[])[0];
}

/** The same two tags {@link readPreservedWriteTags} asks exiftool for. */
const _probe = (file: string) => _read(file, ['-XMP-x:XMPToolkit', '-Photoshop:IPTCDigest']);

const _digests = (file: string) =>
  _read(file, ['-Photoshop:IPTCDigest', '-File:CurrentIPTCDigest', '-XMP-x:XMPToolkit']);

describe.skipIf(!existsSync(source))('preserving a rewrite on a real demo image', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'photokin-preserve-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  /** Writes one keyword, with or without the preservation prefix. */
  async function _writeKeyword(name: string, preserve: boolean): Promise<string> {
    const dest = path.join(workDir, `${name}.jpg`);
    copyFileSync(source, dest);

    const probed = await _probe(dest);
    const prefix = preserve
      ? preservedWriteArgs({
          xmpToolkit: probed.XMPToolkit as string,
          hasIptcDigest: probed.IPTCDigest != null,
        })
      : [];

    await _runViaArgfile([...prefix, ...keywordsWriteArgs({ fullPath: dest, tagPaths: ['probe'] })], workDir);
    return dest;
  }

  it('leaves the toolkit and the IPTC digest as it found them', async () => {
    const before = await _digests(source);
    const dest = await _writeKeyword('preserved', true);
    const after = await _digests(dest);

    // Padding and all: the XMP packet still names the tool that created it.
    expect(after.XMPToolkit).toBe(before.XMPToolkit);
    // Rewriting IPTC changes its digest, so the stored one must follow along —
    // otherwise readers warn "IPTCDigest is not current. XMP may be out of sync".
    expect(after.IPTCDigest).toBe(after.CurrentIPTCDigest);
  }, 10_000);

  it('is the reason those two survive (same write, no prefix)', async () => {
    const before = await _digests(source);
    const dest = await _writeKeyword('bare', false);
    const after = await _digests(dest);

    expect(after.XMPToolkit).not.toBe(before.XMPToolkit);
    expect(after.IPTCDigest).not.toBe(after.CurrentIPTCDigest);
  }, 10_000);

  it('holds the filesystem modification time with -P', async () => {
    const dest = path.join(workDir, 'mtime.jpg');
    copyFileSync(source, dest);
    const stamp = new Date('2019-05-04T03:02:01Z');
    utimesSync(dest, stamp, stamp);

    await _runViaArgfile(['-P', ...keywordsWriteArgs({ fullPath: dest, tagPaths: ['probe'] })], workDir);

    expect(statSync(dest).mtime.getTime()).toBe(stamp.getTime());
  }, 10_000);
});
