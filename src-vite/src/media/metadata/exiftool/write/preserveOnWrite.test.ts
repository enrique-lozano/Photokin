import { beforeEach, describe, expect, it, vi } from 'vitest';

const runExiftoolSession = vi.fn();

vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: (...args: unknown[]) => runExiftoolSession(...args),
}));

import { preservedWriteArgs, readPreservedWriteTags } from './preserveOnWrite';

/** Adobe pads the toolkit string; the padding is part of the value we put back. */
const ADOBE_TOOLKIT = 'Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ';

describe('preservedWriteArgs', () => {
  it('pins the previous toolkit and refreshes an existing IPTC digest', () => {
    expect(preservedWriteArgs({ xmpToolkit: ADOBE_TOOLKIT, hasIptcDigest: true })).toEqual([
      `-XMP-x:XMPToolkit=${ADOBE_TOOLKIT}`,
      '-IPTCDigest=new',
    ]);
  });

  it('leaves a file without an IPTC digest without one', () => {
    expect(preservedWriteArgs({ xmpToolkit: ADOBE_TOOLKIT, hasIptcDigest: false })).toEqual([
      `-XMP-x:XMPToolkit=${ADOBE_TOOLKIT}`,
    ]);
  });

  it('lets exiftool stamp its own toolkit on a file that has no XMP yet', () => {
    expect(preservedWriteArgs({ hasIptcDigest: true })).toEqual(['-IPTCDigest=new']);
  });

  it('adds nothing when the file was never probed', () => {
    expect(preservedWriteArgs(undefined)).toEqual([]);
  });
});

describe('readPreservedWriteTags', () => {
  beforeEach(() => {
    runExiftoolSession.mockReset();
  });

  it('asks for both tags of every file in one command', async () => {
    runExiftoolSession.mockResolvedValue('[]');

    await readPreservedWriteTags(['C:/photos/a.jpg', 'C:/photos/b.jpg']);

    expect(runExiftoolSession).toHaveBeenCalledTimes(1);
    expect(runExiftoolSession.mock.calls[0][0]).toEqual([
      'C:/photos/a.jpg',
      'C:/photos/b.jpg',
      '-json',
      '-XMP-x:XMPToolkit',
      '-Photoshop:IPTCDigest',
    ]);
  });

  it('keeps the toolkit padding and flags the files that carry a digest', async () => {
    runExiftoolSession.mockResolvedValue(
      JSON.stringify([
        {
          SourceFile: 'C:/photos/a.jpg',
          XMPToolkit: ADOBE_TOOLKIT,
          IPTCDigest: '24010ffd89e006a58687d4923e9b0d4c',
        },
        { SourceFile: 'C:/photos/b.jpg' },
      ]),
    );

    const preserved = await readPreservedWriteTags(['C:/photos/a.jpg', 'C:/photos/b.jpg']);

    expect(preserved.get('c:/photos/a.jpg')).toEqual({
      xmpToolkit: ADOBE_TOOLKIT,
      hasIptcDigest: true,
    });
    expect(preserved.get('c:/photos/b.jpg')).toEqual({ xmpToolkit: undefined, hasIptcDigest: false });
  });

  it('matches exiftool\u2019s forward slashes against a Windows path', async () => {
    runExiftoolSession.mockResolvedValue(
      JSON.stringify([{ SourceFile: 'C:/Photos/A.jpg', XMPToolkit: ADOBE_TOOLKIT }]),
    );

    const preserved = await readPreservedWriteTags(['C:\\Photos\\A.jpg']);

    expect(preserved.get('c:/photos/a.jpg')?.xmpToolkit).toBe(ADOBE_TOOLKIT);
  });

  it('never spawns for an empty batch', async () => {
    expect((await readPreservedWriteTags([])).size).toBe(0);
    expect(runExiftoolSession).not.toHaveBeenCalled();
  });

  it('degrades to no preservation when the probe fails', async () => {
    runExiftoolSession.mockRejectedValue(new Error('exiftool is not installed'));

    // Preservation is cosmetic: the write it precedes must still go ahead.
    expect((await readPreservedWriteTags(['C:/photos/a.jpg'])).size).toBe(0);
  });
});
