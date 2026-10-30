import { executeCommand } from '@/system/commandRunner';
import { executeExiftoolWithArgs } from './exiftool-run';
import { shouldPreserveFileModifyTime } from './metadataWritePolicy';
import { normalizeWritePath, preservedWriteArgs, readPreservedWriteTags } from './preserveOnWrite';

/**
 * A single file's exiftool write command, expressed as the argument list that
 * precedes its `-execute` separator. `args` must contain everything the command
 * needs — tag assignments, flags like `-overwrite_original`, and the file path
 * itself (typically last). `fullPath` is used both as the failure key and to
 * match exiftool's per-file error lines back to this entry.
 */
export interface ExiftoolWriteEntry {
  fullPath: string;
  args: string[];
}

/** How an assembled chunk of arguments is handed to exiftool. */
type ExiftoolTransport = typeof executeExiftoolWithArgs;

/**
 * Last resort: arguments straight to the process. Windows decodes argv with the
 * system code page, so anything outside it becomes "?" (the "?????" keywords
 * bug). Only used for values the argfile cannot carry — see {@link _needsArgv}.
 */
const _argvTransport: ExiftoolTransport = async (args, onStderr) => {
  const { data } = await executeCommand('exiftool', { args, onStderr });
  return data;
};

/**
 * The argfile is line-based, so an argument containing a newline (typically a
 * multi-line description) would be read as several arguments and has to fall
 * back to argv.
 */
function _needsArgv(entry: ExiftoolWriteEntry): boolean {
  return entry.args.some((arg) => arg.includes('\n'));
}

/**
 * Conservative cap on the assembled command line so a batch never trips
 * Windows' ~32k `CreateProcess` limit. Commands are grouped into chunks under
 * this budget; each chunk is handled by a single exiftool process.
 */
const BATCH_MAX_CHARS = 24_000;

/**
 * Runs many independent exiftool write commands with as few process spawns as
 * possible. exiftool's startup cost dwarfs the writes themselves (especially on
 * Windows), so commands are packed into chunks and each chunk runs as a single
 * process, using `-execute` to separate the per-file commands.
 *
 * Arguments travel through a UTF-8 argfile so accents and CJK survive Windows
 * (see `executeExiftoolWithArgs`); the few entries that cannot use it are run
 * separately rather than dragging their whole chunk back to argv.
 *
 * Returns a map of `fullPath → error message` for the files exiftool could not
 * write (the rest succeeded). `onProgress` fires after each chunk with the
 * running count of processed entries. An empty input resolves without spawning.
 */
export async function runBatchedExiftoolWrites(
  entries: ExiftoolWriteEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const failures = new Map<string, string>();
  if (entries.length === 0) return failures;

  const commands = await _withPreservedMetadata(entries);

  let processed = 0;
  const report = (count: number) => {
    processed += count;
    onProgress?.(processed, commands.length);
  };

  await _runGroup(
    commands.filter((entry) => !_needsArgv(entry)),
    executeExiftoolWithArgs,
    failures,
    report,
  );
  await _runGroup(commands.filter(_needsArgv), _argvTransport, failures, report);

  return failures;
}

/**
 * Commands that rebuild the file all carry `-overwrite_original`; the only other
 * kind is a bare filesystem-time stamp, which must stay content-free.
 */
function _rewritesFile(entry: ExiftoolWriteEntry): boolean {
  return entry.args.includes('-overwrite_original');
}

/**
 * Prefixes every rewriting command with the flags and assignments that keep it
 * from changing more than the edit asked for: `-P` holds the filesystem
 * modification time when the user opted in, and the probed tags survive the
 * rebuild (see {@link preservedWriteArgs}). Only the prefix moves — the path stays
 * last, where the builders and the failure matching expect it.
 */
async function _withPreservedMetadata(entries: ExiftoolWriteEntry[]): Promise<ExiftoolWriteEntry[]> {
  const rewrites = entries.filter(_rewritesFile);
  if (rewrites.length === 0) return entries;

  const keepFileModifyTime = shouldPreserveFileModifyTime();
  const preserved = await readPreservedWriteTags(rewrites.map((entry) => entry.fullPath));

  return entries.map((entry) => {
    if (!_rewritesFile(entry)) return entry;

    const prefix = [
      ...(keepFileModifyTime ? ['-P'] : []),
      ...preservedWriteArgs(preserved.get(normalizeWritePath(entry.fullPath))),
    ];
    return prefix.length === 0 ? entry : { ...entry, args: [...prefix, ...entry.args] };
  });
}

/** Packs one transport's entries into chunks that stay under the length budget. */
async function _runGroup(
  entries: ExiftoolWriteEntry[],
  transport: ExiftoolTransport,
  failures: Map<string, string>,
  report: (count: number) => void,
): Promise<void> {
  const executeCost = '-execute'.length + 1;
  let chunk: ExiftoolWriteEntry[] = [];
  let chunkChars = 0;

  const flush = async () => {
    if (chunk.length === 0) return;
    await _runChunk(
      chunk.flatMap((entry) => [...entry.args, '-execute']),
      chunk,
      failures,
      transport,
    );
    report(chunk.length);
    chunk = [];
    chunkChars = 0;
  };

  for (const entry of entries) {
    const cost = entry.args.reduce((sum, arg) => sum + arg.length + 1, executeCost);
    if (chunk.length > 0 && chunkChars + cost > BATCH_MAX_CHARS) await flush();
    chunk.push(entry);
    chunkChars += cost;
  }
  await flush();
}

/** Runs one chunk of `-execute`-separated commands and records failures. */
async function _runChunk(
  args: string[],
  entries: ExiftoolWriteEntry[],
  failures: Map<string, string>,
  transport: ExiftoolTransport,
): Promise<void> {
  const stderr: string[] = [];
  const { code, stdout } = await transport(args, (line) => stderr.push(line));

  _collectFailures(stderr, entries, failures);

  // Clean exit, or the culprit is already pinned to a specific file: done.
  if (code === 0 || entries.some((entry) => failures.has(entry.fullPath))) return;

  // Non-zero exit with nothing attributed. Inside a batch, exiftool doesn't
  // always name the offending file (e.g. a bare `Warning:` from one bad value),
  // and blaming the whole chunk would fail files that actually wrote fine. A
  // single entry is unambiguous; otherwise re-run each in isolation to pin the
  // real culprit (rare fallback, and re-stamping the same dates is idempotent).
  if (entries.length === 1) {
    failures.set(entries[0].fullPath, _unattributedMessage(stderr, stdout, code));
    return;
  }
  for (const entry of entries) {
    await _runChunk([...entry.args, '-execute'], [entry], failures, transport);
  }
}

/**
 * Best-effort message for a non-zero exit that named no file. Prefers exiftool's
 * own Error/Warning lines, then whatever else it printed, and only falls back to
 * the bare exit code when it said nothing at all. exiftool's closing tally
 * ("1 files weren't updated due to errors") is dropped: it restates the failure
 * without giving a reason.
 */
function _unattributedMessage(stderr: string[], stdout: string | undefined, code: number | null): string {
  const output = [...stderr, ...(stdout ?? '').split(/\r?\n/)]
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+ (image )?files? /i.test(line));
  const flagged = output.filter((line) => /^(error|warning)/i.test(line));
  if (flagged.length > 0) return flagged.join(' ');
  if (output.length > 0) return output.slice(-2).join(' ');
  return `exiftool exited with code ${code} without saying why`;
}

/** Maps exiftool `Error: <message> - <path>` lines back to their entries. */
function _collectFailures(
  stderr: string[],
  entries: ExiftoolWriteEntry[],
  failures: Map<string, string>,
): void {
  for (const line of stderr) {
    const trimmed = line.trim();
    if (!/^Error:/i.test(trimmed)) continue;

    const sepIndex = trimmed.lastIndexOf(' - ');
    if (sepIndex === -1) continue;

    const path = trimmed.slice(sepIndex + 3).trim();
    const message = trimmed.slice(0, sepIndex).trim();
    const entry = entries.find((candidate) => _samePath(candidate.fullPath, path));
    if (entry) failures.set(entry.fullPath, message);
  }
}

/** Loose path comparison tolerant of slash direction and case (Windows). */
function _samePath(a: string, b: string): boolean {
  return normalizeWritePath(a) === normalizeWritePath(b);
}
