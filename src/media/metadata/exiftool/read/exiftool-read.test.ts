import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runExiftoolSession } = vi.hoisted(() => ({ runExiftoolSession: vi.fn() }));

vi.mock('@/media/metadata/exiftool/exiftoolSession', () => ({
  runExiftoolSession,
}));

import { buildExiftoolReadArgs, readFromExiftool } from './exiftool-read';

/** Replays a captured exiftool run: stderr progress lines, then the JSON on stdout. */
function _replay(stderr: string[], stdout: string[]) {
  runExiftoolSession.mockImplementation(async (_args: string[], onStderr?: (line: string) => void) => {
    stderr.forEach((line) => onStderr?.(line));
    return stdout.join('\n');
  });
}

// Real `-progress` output: exiftool writes these to stderr, and includes the
// total even when the argument was a directory.
const PROGRESS = ['======== C:/photos/a.jpg [1/2]', '======== C:/photos/b.jpg [2/2]'];

const JSON_LINES = [
  '[{',
  '  "SourceFile": "C:/photos/a.jpg",',
  '  "FileName": "a.jpg"',
  '},',
  '{',
  '  "SourceFile": "C:/photos/b.jpg",',
  '  "FileName": "b.jpg"',
  '}]',
];

describe('readFromExiftool', () => {
  beforeEach(() => {
    runExiftoolSession.mockReset();
  });

  it('sends the read args through the persistent session', async () => {
    _replay(PROGRESS, JSON_LINES);

    await readFromExiftool(['C:/photos/a.jpg', 'C:/photos/b.jpg']);

    expect(runExiftoolSession).toHaveBeenCalledTimes(1);
    expect(runExiftoolSession.mock.calls[0][0]).toEqual(
      buildExiftoolReadArgs(['C:/photos/a.jpg', 'C:/photos/b.jpg']),
    );
  });

  it('reassembles the JSON streamed line by line on stdout', async () => {
    _replay(PROGRESS, JSON_LINES);

    const result = await readFromExiftool(['C:/photos']);

    expect(result).toEqual([
      { SourceFile: 'C:/photos/a.jpg', FileName: 'a.jpg' },
      { SourceFile: 'C:/photos/b.jpg', FileName: 'b.jpg' },
    ]);
  });

  it('reports progress from the stderr counter', async () => {
    _replay(PROGRESS, JSON_LINES);
    const onPhotoParsed = vi.fn();

    await readFromExiftool(['C:/photos'], onPhotoParsed);

    expect(onPhotoParsed.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('reports only the stderr lines exiftool marks as a problem', async () => {
    // The closing summary shares the error stream with the progress counters.
    _replay(
      ['Error: File not found - C:/photos/gone.jpg', ...PROGRESS, '    2 image files read'],
      JSON_LINES,
    );
    const onPhotoParsed = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await readFromExiftool(['C:/photos'], onPhotoParsed);

    expect(onPhotoParsed).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('File not found');

    warn.mockRestore();
    error.mockRestore();
  });

  it('resolves to an empty list when nothing was written to stdout', async () => {
    _replay([], []);

    await expect(readFromExiftool(['C:/photos'])).resolves.toEqual([]);
  });
});
