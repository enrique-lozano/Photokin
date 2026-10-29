import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeExiftoolWithArgs = vi.fn();

// Writes go through the UTF-8 argfile transport (never raw argv), so that is the
// seam we mock and assert the exiftool arguments on.
vi.mock('./exiftool-run', () => ({
  executeExiftoolWithArgs: (...args: unknown[]) => executeExiftoolWithArgs(...args),
}));

// The pre-write probe (see preserveOnWrite) finds nothing here, so these
// assertions stay about the field mapping alone.
vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: vi.fn().mockResolvedValue('[]'),
}));

import { EXIFTOOL_SELECTED_TAGS, WRITABLE_EXIFTOOL_FIELDS } from '../exiftool-fields';
import { writeMetadataToFile, writeMetadataToFiles } from './exiftool-write';

function _mockExiftool(code: number, stderrLines: string[] = []) {
  executeExiftoolWithArgs.mockImplementation(async (_args: string[], onStderr?: (line: string) => void) => {
    stderrLines.forEach((line) => onStderr?.(line));
    return { code };
  });
}

/** Args of the last exiftool run, without the per-file `-execute` separator. */
const _lastArgs = (): string[] =>
  (executeExiftoolWithArgs.mock.calls.at(-1)?.[0] as string[]).filter((arg) => arg !== '-execute');

describe('writeMetadataToFile', () => {
  beforeEach(() => {
    executeExiftoolWithArgs.mockReset();
    _mockExiftool(0);
  });

  it('maps each editable field onto the tags we read back and overwrites in place', async () => {
    await writeMetadataToFile('C:/photos/a.jpg', {
      orientation: 6,
      title: 'Sunset',
      description: 'A caption',
      rating: 4,
      make: 'Canon',
      model: 'EOS 40D',
    });

    expect(_lastArgs()).toEqual([
      '-Orientation#=6',
      '-Title=Sunset',
      '-ImageDescription=A caption',
      '-Description=A caption',
      '-Rating#=4',
      '-Make=Canon',
      '-Model=EOS 40D',
      '-overwrite_original',
      'C:/photos/a.jpg',
    ]);
  });

  it('clears a tag with an empty assignment when the value is null', async () => {
    await writeMetadataToFile('C:/photos/a.jpg', { title: null, rating: null });
    expect(_lastArgs()).toEqual(['-Title=', '-Rating#=', '-overwrite_original', 'C:/photos/a.jpg']);
  });

  it('only writes fields that are present', async () => {
    await writeMetadataToFile('C:/photos/a.jpg', { rating: 5 });
    expect(_lastArgs()).toEqual(['-Rating#=5', '-overwrite_original', 'C:/photos/a.jpg']);
  });

  it('writes every tag it reads a field from, with no group prefixes', async () => {
    for (const [field, spec] of WRITABLE_EXIFTOOL_FIELDS) {
      await writeMetadataToFile('C:/photos/a.jpg', { [field]: 'x' });
      const assignments = _lastArgs().filter((arg) => arg.startsWith('-') && arg.includes('='));

      expect(assignments).toHaveLength((spec.writeTags ?? spec.tags).length);
      expect(assignments.every((arg) => !arg.includes(':'))).toBe(true);
      for (const tag of spec.writeTags ?? spec.tags) {
        expect(assignments.some((arg) => arg.startsWith(`-${tag}`))).toBe(true);
        expect(EXIFTOOL_SELECTED_TAGS).toContain(tag);
      }
    }
  });

  it('does not spawn exiftool when there is nothing to write', async () => {
    await writeMetadataToFile('C:/photos/a.jpg', {});
    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
  });

  it('writes capture values to writable tags rather than composite display tags', async () => {
    await writeMetadataToFile('C:/photos/a.jpg', {
      lens: 'RF 50mm',
      aperture: 7.1,
      shutterSpeed: '0.0015625',
      iso: 160,
    });
    expect(_lastArgs()).toContain('-LensModel=RF 50mm');
    expect(_lastArgs()).toContain('-Lens=RF 50mm');
    expect(_lastArgs()).toContain('-FNumber#=7.1');
    expect(_lastArgs()).toContain('-ExposureTime=0.0015625');
    expect(_lastArgs()).toContain('-ISO#=160');
    expect(_lastArgs().some((arg) => arg.startsWith('-ShutterSpeed='))).toBe(false);
  });

  it("throws exiftool's reason when it exits non-zero", async () => {
    _mockExiftool(1, ['Error: file is not writable']);
    await expect(writeMetadataToFile('C:/photos/a.jpg', { rating: 3 })).rejects.toThrow(
      /Error: file is not writable/,
    );
  });
});

const _count = (arg: string) =>
  (executeExiftoolWithArgs.mock.calls.at(-1)?.[0] as string[]).filter((value) => value === arg).length;

describe('writeMetadataToFiles', () => {
  beforeEach(() => {
    executeExiftoolWithArgs.mockReset();
    _mockExiftool(0);
  });

  it('writes many files in a single exiftool process, separated by -execute', async () => {
    const failures = await writeMetadataToFiles([
      { fullPath: 'C:/photos/a.jpg', fields: { rating: 5 } },
      { fullPath: 'C:/photos/b.jpg', fields: { title: 'Hi' } },
    ]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(_count('-execute')).toBe(2);
    expect(_count('-overwrite_original')).toBe(2);
    expect(_lastArgs()).toContain('-Rating#=5');
    expect(_lastArgs()).toContain('-Title=Hi');
    expect(_lastArgs()).toContain('C:/photos/a.jpg');
    expect(_lastArgs()).toContain('C:/photos/b.jpg');
    expect(failures.size).toBe(0);
  });

  it('skips files whose fields produce no tag assignments', async () => {
    const failures = await writeMetadataToFiles([{ fullPath: 'C:/photos/a.jpg', fields: {} }]);
    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
    expect(failures.size).toBe(0);
  });

  it('attributes exiftool errors back to the offending file by path', async () => {
    _mockExiftool(1, ['Error: File is not writable - C:/photos/b.jpg']);

    const failures = await writeMetadataToFiles([
      { fullPath: 'C:/photos/a.jpg', fields: { rating: 5 } },
      { fullPath: 'C:/photos/b.jpg', fields: { rating: 5 } },
    ]);

    expect(failures.get('C:/photos/b.jpg')).toBe('Error: File is not writable');
    expect(failures.has('C:/photos/a.jpg')).toBe(false);
  });
});
