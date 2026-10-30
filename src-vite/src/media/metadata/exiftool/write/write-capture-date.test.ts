import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeExiftoolWithArgs = vi.fn();

// Writes travel through the UTF-8 argfile transport, so that is the seam we mock.
vi.mock('./exiftool-run', () => ({
  executeExiftoolWithArgs: (...args: unknown[]) => executeExiftoolWithArgs(...args),
}));

// The pre-write probe (see preserveOnWrite) finds nothing here, so these
// assertions stay about the date tags alone.
vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: vi.fn().mockResolvedValue('[]'),
}));

import { CaptureDateWriteOptions, writeCaptureDatesToFiles } from './write-capture-date';

function _mockExiftool(code: number, stderrLines: string[] = []) {
  executeExiftoolWithArgs.mockImplementation(async (_args: string[], onStderr?: (line: string) => void) => {
    stderrLines.forEach((line) => onStderr?.(line));
    return { code };
  });
}

const _lastArgs = (): string[] => executeExiftoolWithArgs.mock.calls.at(-1)?.[0] as string[];
const _count = (arg: string) => _lastArgs().filter((value) => value === arg).length;
const _has = (predicate: (arg: string) => boolean) => _lastArgs().some(predicate);

function _options(overrides: Partial<CaptureDateWriteOptions> = {}): CaptureDateWriteOptions {
  return {
    writeTaken: false,
    writeDigitized: false,
    writeModified: false,
    setFileModifyTime: false,
    onlyExistingTags: false,
    ...overrides,
  };
}

describe('writeCaptureDatesToFiles', () => {
  const DATE = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));
  const VALUE = '2020:01:01 12:00:00';

  beforeEach(() => {
    executeExiftoolWithArgs.mockReset();
    _mockExiftool(0);
  });

  it('stamps many files in a single exiftool process, separated by -execute', async () => {
    await writeCaptureDatesToFiles(
      [
        { fullPath: 'C:/photos/a.jpg', date: DATE },
        { fullPath: 'C:/photos/b.jpg', date: DATE },
      ],
      _options({ writeTaken: true, writeDigitized: true }),
    );

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(_count('-execute')).toBe(2);
    expect(_count('-overwrite_original')).toBe(2);
    expect(_count('-m')).toBe(2);
    expect(_lastArgs()).toContain('C:/photos/a.jpg');
    expect(_lastArgs()).toContain('C:/photos/b.jpg');
    expect(_lastArgs()).toContain(`-DateTimeOriginal=${VALUE}`);
    expect(_lastArgs()).toContain(`-CreateDate=${VALUE}`);
  });

  it('writes only the taken tags (and clears their fragments) for a taken-only run', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ writeTaken: true }),
    );

    expect(_lastArgs()).toContain(`-DateTimeOriginal=${VALUE}`);
    // Group-less DateCreated writes the IPTC date and updates XMP-photoshop only if present.
    expect(_lastArgs()).toContain(`-DateCreated=${VALUE}`);
    // IPTC time tags are pinned to UTC so exiftool doesn't append the local offset.
    expect(_lastArgs()).toContain(`-IPTC:TimeCreated=${VALUE}+00:00`);
    expect(_lastArgs()).toContain('-SubSecTimeOriginal=');
    expect(_lastArgs()).toContain('-OffsetTimeOriginal=');
    expect(_lastArgs()).toContain('-overwrite_original');
    // We never force-create an XMP copy, and IPTC:DateCreated is covered by group-less DateCreated.
    expect(_has((arg) => arg.startsWith('-XMP-'))).toBe(false);
    expect(_has((arg) => arg.startsWith('-IPTC:DateCreated='))).toBe(false);
    // Digitized and modified fields stay untouched.
    expect(_has((arg) => arg.startsWith('-CreateDate='))).toBe(false);
    expect(_has((arg) => arg.startsWith('-IPTC:DigitalCreationDate='))).toBe(false);
    expect(_has((arg) => arg.startsWith('-ModifyDate='))).toBe(false);
  });

  it('writes only the digitized tags (and clears their fragments) for a digitized-only run', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ writeDigitized: true }),
    );

    expect(_lastArgs()).toContain(`-CreateDate=${VALUE}`);
    expect(_lastArgs()).toContain(`-IPTC:DigitalCreationDate=${VALUE}`);
    expect(_lastArgs()).toContain(`-IPTC:DigitalCreationTime=${VALUE}+00:00`);
    expect(_lastArgs()).toContain('-SubSecTimeDigitized=');
    expect(_lastArgs()).toContain('-OffsetTimeDigitized=');
    // Group-less CreateDate updates XMP-xmp:CreateDate only if present; never forced.
    expect(_has((arg) => arg.startsWith('-XMP-'))).toBe(false);
    // Taken and modified fields stay untouched.
    expect(_has((arg) => arg.startsWith('-DateTimeOriginal='))).toBe(false);
    expect(_has((arg) => arg.startsWith('-ModifyDate='))).toBe(false);
  });

  it('writes the embedded modified tags for a modified run', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ writeModified: true }),
    );

    expect(_lastArgs()).toContain(`-ModifyDate=${VALUE}`);
    // MetadataDate is XMP-only, so it's written explicitly by design.
    expect(_lastArgs()).toContain(`-XMP-xmp:MetadataDate=${VALUE}`);
    expect(_lastArgs()).toContain('-SubSecTime=');
    expect(_lastArgs()).toContain('-OffsetTime=');
    expect(_lastArgs()).toContain('-overwrite_original');
    // Group-less ModifyDate updates XMP-xmp:ModifyDate only if present; never forced.
    expect(_has((arg) => arg.startsWith('-XMP-xmp:ModifyDate='))).toBe(false);
    // Embedded-only: no filesystem timestamp unless explicitly requested.
    expect(_has((arg) => arg.startsWith('-FileModifyDate='))).toBe(false);
  });

  it('only touches the filesystem modify time (no content rewrite) for a file-time-only run', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ setFileModifyTime: true }),
    );

    expect(_lastArgs()).toContain(`-FileModifyDate=${VALUE}+00:00`);
    expect(_lastArgs()).not.toContain('-overwrite_original');
    // No embedded dates at all when we're not writing metadata.
    expect(_has((arg) => arg.startsWith('-DateTimeOriginal='))).toBe(false);
    expect(_has((arg) => arg.startsWith('-ModifyDate='))).toBe(false);
  });

  it('passes -wm w when only-existing tags is requested', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ writeTaken: true, onlyExistingTags: true }),
    );

    const args = _lastArgs();
    const wmIndex = args.indexOf('-wm');
    expect(wmIndex).toBeGreaterThanOrEqual(0);
    expect(args[wmIndex + 1]).toBe('w');
  });

  it('uses video date tags, mapping both taken and digitized onto the creation date', async () => {
    await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/clips/a.mp4', date: DATE }],
      _options({ writeDigitized: true, writeModified: true }),
    );

    // Video has a single creation date, so a digitized-only request still stamps it.
    expect(_lastArgs()).toContain(`-QuickTime:CreateDate=${VALUE}`);
    expect(_lastArgs()).toContain(`-TrackCreateDate=${VALUE}`);
    expect(_lastArgs()).toContain(`-QuickTime:ModifyDate=${VALUE}`);
    expect(_has((arg) => arg.startsWith('-IPTC:'))).toBe(false);
    expect(_has((arg) => arg.startsWith('-DateTimeOriginal='))).toBe(false);
  });

  it('does not spawn exiftool when there is nothing to write', async () => {
    const failures = await writeCaptureDatesToFiles(
      [{ fullPath: 'C:/photos/a.jpg', date: DATE }],
      _options({ onlyExistingTags: true }),
    );

    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
    expect(failures.size).toBe(0);
  });

  it('attributes exiftool errors back to the offending file by path', async () => {
    _mockExiftool(1, ['Error: File is not writable - C:/photos/b.jpg']);

    const failures = await writeCaptureDatesToFiles(
      [
        { fullPath: 'C:/photos/a.jpg', date: DATE },
        { fullPath: 'C:/photos/b.jpg', date: DATE },
      ],
      _options({ writeTaken: true }),
    );

    expect(failures.get('C:/photos/b.jpg')).toBe('Error: File is not writable');
    expect(failures.has('C:/photos/a.jpg')).toBe(false);
  });
});
