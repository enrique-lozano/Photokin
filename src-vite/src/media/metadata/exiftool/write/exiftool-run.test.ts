import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeCommand, writeTextFile, remove } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/system/commandRunner', () => ({
  executeCommand: (...args: unknown[]) => executeCommand(...args),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...args: unknown[]) => writeTextFile(...args),
  remove: (...args: unknown[]) => remove(...args),
}));

vi.mock('@tauri-apps/api/path', () => ({
  tempDir: async () => '/tmp',
  join: async (...parts: string[]) => parts.join('/'),
}));

import { executeExiftoolWithArgs } from './exiftool-run';

const SPECIAL = 'æÆøØåÅéÉüÜäÄöÖïÏñÑ';

describe('executeExiftoolWithArgs', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    writeTextFile.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
    executeCommand.mockResolvedValue({ data: { code: 0, signal: null }, command: {} });
  });

  it('passes arguments through a UTF-8 argfile, preserving non-ASCII verbatim', async () => {
    const args = [
      '-XMP-dc:Subject=',
      `-XMP-dc:Subject=${SPECIAL}`,
      '-overwrite_original',
      `C:/photos/${SPECIAL}.jpg`,
    ];

    const { code } = await executeExiftoolWithArgs(args);
    expect(code).toBe(0);

    // The full arg list is written to the temp file, one per line, untouched.
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [argfilePath, contents] = writeTextFile.mock.calls[0] as [string, string];
    expect(contents.split('\n')).toEqual([...args, '']);
    expect(contents).toContain(SPECIAL);
    expect(contents).not.toContain('?');

    // exiftool is invoked against that file with the UTF-8 filename charset, and
    // the mangling-prone values never appear on the command line itself.
    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [program, options] = executeCommand.mock.calls[0] as [string, { args: string[] }];
    expect(program).toBe('exiftool');
    expect(options.args).toEqual(['-charset', 'filename=UTF8', '-@', argfilePath]);
  });

  it('removes the temp argfile after exiftool finishes', async () => {
    await executeExiftoolWithArgs(['-ver']);
    const argfilePath = (writeTextFile.mock.calls[0] as [string, string])[0];
    expect(remove).toHaveBeenCalledWith(argfilePath);
  });

  it('removes the temp argfile even when exiftool fails to run', async () => {
    executeCommand.mockRejectedValue(new Error('spawn failed'));
    await expect(executeExiftoolWithArgs(['-ver'])).rejects.toThrow('spawn failed');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('forwards stderr lines and returns the exit code', async () => {
    executeCommand.mockImplementation(
      async (_program: string, options: { onStderr?: (line: string) => void }) => {
        options.onStderr?.('Warning: something');
        return { data: { code: 1, signal: null }, command: {} };
      },
    );

    const lines: string[] = [];
    const { code } = await executeExiftoolWithArgs(['-ver'], (line) => lines.push(line));

    expect(code).toBe(1);
    expect(lines).toEqual(['Warning: something']);
  });
});
