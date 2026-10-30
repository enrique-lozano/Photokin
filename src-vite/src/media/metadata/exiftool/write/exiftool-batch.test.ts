import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.fn();
const executeExiftoolWithArgs = vi.fn();
const runExiftoolSession = vi.fn();
const shouldPreserveFileModifyTime = vi.fn();

vi.mock('@/system/commandRunner', () => ({
  executeCommand: (...args: unknown[]) => executeCommand(...args),
}));

vi.mock('./exiftool-run', () => ({
  executeExiftoolWithArgs: (...args: unknown[]) => executeExiftoolWithArgs(...args),
}));

// Every write is preceded by a probe for the tags a rewrite would clobber.
vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: (...args: unknown[]) => runExiftoolSession(...args),
}));

vi.mock('./metadataWritePolicy', () => ({
  shouldPreserveFileModifyTime: () => shouldPreserveFileModifyTime(),
}));

import { ExiftoolWriteEntry, runBatchedExiftoolWrites } from './exiftool-batch';

/** Canned exiftool result keyed off the args it was invoked with. */
function _mock(handler: (args: string[]) => { code: number; stderr?: string[] }) {
  executeExiftoolWithArgs.mockImplementation(async (args: string[], onStderr?: (line: string) => void) => {
    const { code, stderr = [] } = handler(args);
    stderr.forEach((line) => onStderr?.(line));
    return { code };
  });
  executeCommand.mockImplementation(
    async (_command: string, options: { args: string[]; onStderr?: (line: string) => void }) => {
      const { code, stderr = [] } = handler(options.args);
      stderr.forEach((line) => options.onStderr?.(line));
      return { data: { code, signal: null, stdout: '', stderr: '' }, command: {} };
    },
  );
}

const _entry = (fullPath: string): ExiftoolWriteEntry => ({
  fullPath,
  args: ['-DateTimeOriginal=2020:01:01 12:00:00', '-overwrite_original', fullPath],
});

const _isSingleCommand = (args: string[]) => args.filter((arg) => arg === '-execute').length === 1;

describe('runBatchedExiftoolWrites', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeExiftoolWithArgs.mockReset();
    runExiftoolSession.mockReset();
    runExiftoolSession.mockResolvedValue('[]');
    shouldPreserveFileModifyTime.mockReset();
    shouldPreserveFileModifyTime.mockReturnValue(false);
  });

  it('packs every command into a single spawn on the happy path', async () => {
    _mock(() => ({ code: 0 }));

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.jpg'), _entry('C:/b.jpg')]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(failures.size).toBe(0);
  });

  it('attributes a per-file Error line without isolating the rest of the batch', async () => {
    _mock(() => ({ code: 1, stderr: ['Error: File is not writable - C:/b.jpg'] }));

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.jpg'), _entry('C:/b.jpg')]);

    // Culprit already pinned, so no isolation re-runs happen.
    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(failures.get('C:/b.jpg')).toBe('Error: File is not writable');
    expect(failures.has('C:/a.jpg')).toBe(false);
  });

  it('isolates an unattributed non-zero exit so only the real culprit fails', async () => {
    // The batch exits non-zero with a bare warning (no path). On isolation only
    // b.jpg keeps failing; a.jpg — swept up in the same chunk — writes cleanly.
    _mock((args) => {
      if (!_isSingleCommand(args)) return { code: 1, stderr: ['Warning: Invalid date/time'] };
      return args.includes('C:/b.jpg') ? { code: 1, stderr: ['Warning: Invalid date/time'] } : { code: 0 };
    });

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.jpg'), _entry('C:/b.jpg')]);

    // 1 batch spawn + 2 isolation spawns.
    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(3);
    expect(failures.has('C:/a.jpg')).toBe(false);
    expect(failures.get('C:/b.jpg')).toContain('Invalid date/time');
  });

  it('blames a solo non-zero exit that names no file', async () => {
    _mock(() => ({ code: 1, stderr: ['Warning: something odd'] }));

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.jpg')]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(failures.get('C:/a.jpg')).toContain('something odd');
  });

  it('falls back to other exiftool output when a failure has no Error or Warning line', async () => {
    executeExiftoolWithArgs.mockResolvedValue({
      code: 1,
      stdout: "Truncated HEIC box\n    0 image files updated\n    1 files weren't updated due to errors\n",
    });

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.heic')]);

    expect(failures.get('C:/a.heic')).toBe('Truncated HEIC box');
  });

  it('says exiftool gave no reason when it printed nothing but the tally', async () => {
    executeExiftoolWithArgs.mockResolvedValue({
      code: 1,
      stdout: "    1 files weren't updated due to errors\n",
    });

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.heic')]);

    expect(failures.get('C:/a.heic')).toBe('exiftool exited with code 1 without saying why');
  });

  it('sends only the entry with a multi-line value through process args', async () => {
    _mock(() => ({ code: 0 }));
    const multiline: ExiftoolWriteEntry = {
      fullPath: 'C:/b.jpg',
      args: ['-Description=first line\nsecond line', '-overwrite_original', 'C:/b.jpg'],
    };

    const failures = await runBatchedExiftoolWrites([_entry('C:/a.jpg'), multiline]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    expect(executeExiftoolWithArgs.mock.calls[0][0]).toContain('C:/a.jpg');
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect((executeCommand.mock.calls[0][1] as { args: string[] }).args).toContain('C:/b.jpg');
    expect(failures.size).toBe(0);
  });

  it('resolves without spawning for an empty input', async () => {
    _mock(() => ({ code: 0 }));

    const failures = await runBatchedExiftoolWrites([]);

    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
    expect(failures.size).toBe(0);
  });
});

/** Args of the last exiftool run, without the per-file `-execute` separator. */
const _lastArgs = (): string[] =>
  (executeExiftoolWithArgs.mock.calls.at(-1)?.[0] as string[]).filter((arg) => arg !== '-execute');

describe('collateral of a rewrite', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeExiftoolWithArgs.mockReset();
    runExiftoolSession.mockReset();
    runExiftoolSession.mockResolvedValue('[]');
    shouldPreserveFileModifyTime.mockReset();
    shouldPreserveFileModifyTime.mockReturnValue(false);
    _mock(() => ({ code: 0 }));
  });

  it('puts back the toolkit and the digest the rewrite would have changed', async () => {
    runExiftoolSession.mockResolvedValue(
      JSON.stringify([{ SourceFile: 'C:/a.jpg', XMPToolkit: 'Adobe XMP Core', IPTCDigest: 'abc' }]),
    );

    await runBatchedExiftoolWrites([_entry('C:/a.jpg')]);

    // Prefixed, so the edit's own assignments and the trailing path stay put.
    expect(_lastArgs()).toEqual([
      '-XMP-x:XMPToolkit=Adobe XMP Core',
      '-IPTCDigest=new',
      '-DateTimeOriginal=2020:01:01 12:00:00',
      '-overwrite_original',
      'C:/a.jpg',
    ]);
  });

  it('keeps the filesystem time only when the setting asks for it', async () => {
    await runBatchedExiftoolWrites([_entry('C:/a.jpg')]);
    expect(_lastArgs()).not.toContain('-P');

    shouldPreserveFileModifyTime.mockReturnValue(true);
    await runBatchedExiftoolWrites([_entry('C:/a.jpg')]);
    expect(_lastArgs()[0]).toBe('-P');
  });

  it('leaves a filesystem-time stamp content-free', async () => {
    shouldPreserveFileModifyTime.mockReturnValue(true);
    runExiftoolSession.mockResolvedValue(
      JSON.stringify([{ SourceFile: 'C:/a.jpg', XMPToolkit: 'Adobe XMP Core', IPTCDigest: 'abc' }]),
    );

    // No `-overwrite_original`: this command must not start rewriting metadata.
    const stamp: ExiftoolWriteEntry = {
      fullPath: 'C:/a.jpg',
      args: ['-FileModifyDate=2020:01:01 12:00:00+00:00', 'C:/a.jpg'],
    };
    await runBatchedExiftoolWrites([stamp]);

    expect(_lastArgs()).toEqual(stamp.args);
    expect(runExiftoolSession).not.toHaveBeenCalled();
  });
});
