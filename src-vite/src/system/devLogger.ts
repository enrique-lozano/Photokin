type LogValue = string | number | boolean | null | undefined;
type LogDetails = Record<string, LogValue>;

function _message(scope: string, event: string, details?: LogDetails): string {
  const suffix = details
    ? Object.entries(details)
        .filter((entry): entry is [string, Exclude<LogValue, undefined>] => entry[1] !== undefined)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
    : '';
  return `[${scope}] ${event}${suffix ? ` ${suffix}` : ''}`;
}

export function createTraceId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID().slice(0, 8)}`;
}

export function debugLog(scope: string, event: string, details?: LogDetails): void {
  if (import.meta.env.DEV) console.debug(_message(scope, event, details));
}

/**
 * A copyable but privacy-safe rendering of a command, to embed in a log line.
 * Set `localStorage["photokin:debug:commands"] = "full"` for every non-input arg.
 */
export function formatCommand(executable: string, args: string[], inputCount = 0): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  const full = isFullCommandLoggingEnabled();

  const safeArgs = args.slice(inputCount).map(_redactArg);
  const shownArgs = full ? safeArgs : safeArgs.slice(0, 8);

  return [
    executable,
    inputCount > 0 ? `<${inputCount} media files>` : '',
    ...shownArgs.map(_quoteArg),
    !full && safeArgs.length > shownArgs.length ? '…' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function debugCommand(scope: string, executable: string, args: string[], inputCount = 0): void {
  const command = formatCommand(executable, args, inputCount);
  if (command) debugLog(scope, 'command', { command });
}

export function isFullCommandLoggingEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('photokin:debug:commands') === 'full';
  } catch {
    return false;
  }
}

/** Time spent since a `performance.now()` reading, plus its per-file cost. */
export function timingsSince(startedAt: number, files: number) {
  const elapsedMs = Math.round(performance.now() - startedAt);
  return {
    elapsedMs,
    averageMsPerFile: files > 0 ? Number((elapsedMs / files).toFixed(2)) : undefined,
  };
}

export function warningLog(scope: string, event: string, details?: LogDetails): void {
  console.warn(_message(scope, event, details));
}

export function errorLog(scope: string, event: string, error: unknown, details?: LogDetails): void {
  console.error(_message(scope, event, details), error);
}

function _redactArg(arg: string): string {
  if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(arg) || (!arg.startsWith('-') && /[\\/]/.test(arg))) {
    return '<path>';
  }
  if (/geolocation=/i.test(arg)) return arg.replace(/=.*/, '=<redacted>');
  if (arg.startsWith('-') && arg.includes('=')) return arg.replace(/=.*/, '=<redacted>');
  return arg;
}

function _quoteArg(arg: string): string {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}
