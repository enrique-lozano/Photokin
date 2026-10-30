import { executeCommand } from '@/system/commandRunner';
import { join, tempDir } from '@tauri-apps/api/path';
import { remove, writeTextFile } from '@tauri-apps/plugin-fs';

function _uniqueArgfileName(): string {
  return `photokin-exiftool-${Date.now()}-${Math.random().toString(36).slice(2)}.args`;
}

function _argfileArgv(argfilePath: string): string[] {
  return ['-charset', 'filename=UTF8', '-@', argfilePath];
}

/**
 * Writes `args` to a UTF-8 `-@` file, runs `fn` against it, then always deletes
 * the temp file. One argument per line; a trailing newline is ignored by exiftool.
 */
async function _withArgfile<T>(args: string[], fn: (argfilePath: string) => Promise<T>): Promise<T> {
  const argfilePath = await join(await tempDir(), _uniqueArgfileName());
  await writeTextFile(argfilePath, args.length > 0 ? `${args.join('\n')}\n` : '');

  try {
    return await fn(argfilePath);
  } finally {
    await remove(argfilePath).catch(() => {});
  }
}

/**
 * Runs exiftool with its arguments supplied through a UTF-8 argument file
 * (`-@ FILE`) rather than as process arguments.
 *
 * WHY: on Windows, exiftool's executable decodes command-line arguments using
 * the system code page, so any character outside it (accents, æ/ø/å, CJK, …) is
 * silently replaced by "?" before `-charset` can be applied — corrupting tag
 * values (the "?????" keywords bug) and non-ASCII file names. Reading the
 * arguments from a UTF-8 file bypasses argv completely (ExifTool FAQ 18), so
 * every string round-trips correctly on all platforms; `-charset filename=UTF8`
 * makes exiftool read the (UTF-8) paths in that file correctly too. The same
 * file also dodges Windows' ~32k command-line length limit, so a large library
 * can be read or written in a single process.
 *
 * `args` is the full argument list that would otherwise be passed on the command
 * line (tag assignments, flags, `-execute` separators and file paths). Because
 * the argfile is line-based, each argument must be free of newlines — safe for
 * keywords, which are single-line by construction. The temp file is always
 * removed, even when exiftool fails.
 */
export async function executeExiftoolWithArgs(args: string[], onStderr?: (line: string) => void) {
  return _withArgfile(args, async (argfilePath) => {
    const { data } = await executeCommand('exiftool', {
      args: _argfileArgv(argfilePath),
      onStderr,
    });
    return data;
  });
}
