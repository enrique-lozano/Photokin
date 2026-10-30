import { Child } from '@tauri-apps/plugin-shell';
import { spawnCommand } from '@/system/commandRunner';
import { debugCommand, debugLog, formatCommand, timingsSince, warningLog } from '@/system/devLogger';

const COMMAND_TIMEOUT_MS = 120_000;

interface PendingCommand {
  id: number;
  stdout: string;
  onStderr?: (line: string) => void;
  operation: string;
  inputCount: number;
  startedAt: number;
  /** Rendered up front (the args are gone by then) to log on completion. */
  command: string | undefined;
  resolve: (stdout: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class ExifToolSession {
  private child: Child | null = null;
  private startPromise: Promise<Child> | null = null;
  private pending: PendingCommand | null = null;
  private sequence = 0;
  private queue = Promise.resolve();
  private stopping = false;
  private generation = 0;

  run(args: string[], onStderr?: (line: string) => void, operation = 'command'): Promise<string> {
    const result = this.queue.then(() => this._runCommand(args, onStderr, operation));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  shutdown(): void {
    this.stopping = true;
    this.generation += 1;
    const child = this.child;
    this.child = null;
    this.startPromise = null;
    if (this.pending) {
      this._finishPending(new Error('ExifTool session closed'));
    }
    void child?.kill().catch(() => {});
  }

  private async _runCommand(
    args: string[],
    onStderr?: (line: string) => void,
    operation = 'command',
  ): Promise<string> {
    const child = await this._start();
    const id = ++this.sequence;
    const inputCount = _inputCount(args);
    // Geocoding runs one tiny command per place, which would drown the log; its
    // batch timing is reported by the caller instead.
    const command = operation === 'geocode' ? undefined : formatCommand('exiftool', args, inputCount);

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._finishPending(new Error(`ExifTool command timed out after ${COMMAND_TIMEOUT_MS}ms`));
        this.shutdown();
      }, COMMAND_TIMEOUT_MS);
      this.pending = {
        id,
        stdout: '',
        onStderr,
        operation,
        inputCount,
        startedAt: performance.now(),
        command,
        resolve,
        reject,
        timeout,
      };

      child.write(`${args.join('\n')}\n-execute${id}\n`).catch((error) => {
        this._finishPending(new Error(String(error)));
        this.shutdown();
      });
    });
  }

  private _start(): Promise<Child> {
    if (this.child) return Promise.resolve(this.child);
    if (this.startPromise) return this.startPromise;

    const generation = ++this.generation;
    this.startPromise = new Promise<Child>((resolve, reject) => {
      let started = false;
      this.stopping = false;
      const processArgs = ['-charset', 'filename=UTF8', '-stay_open', 'True', '-@', '-'];
      debugCommand('exiftool', 'exiftool', processArgs);
      void spawnCommand('exiftool', {
        args: processArgs,
        onExecutionStarted: (child) => {
          if (generation !== this.generation) {
            void child.kill().catch(() => {});
            return;
          }
          started = true;
          this.child = child;
          debugLog('exiftool', 'process-started', { pid: child.pid });
          resolve(child);
        },
        onStdout: (output) => this._handleStdout(output),
        onStderr: (output) => this._handleStderr(output),
      })
        .then(() => {
          if (generation !== this.generation) return;
          this.child = null;
          this.startPromise = null;
          if (this.stopping) {
            debugLog('exiftool', 'process-stopped');
          } else {
            warningLog('exiftool', 'process-exited-unexpectedly');
            this._finishPending(new Error('ExifTool session exited unexpectedly'));
          }
        })
        .catch((error) => {
          if (generation !== this.generation) return;
          this.child = null;
          this.startPromise = null;
          this._finishPending(error instanceof Error ? error : new Error(String(error)));
          if (!started) reject(error);
        });
    });
    return this.startPromise;
  }

  private _handleStdout(output: string): void {
    const pending = this.pending;
    if (!pending) return;
    this._refreshTimeout(pending);
    const ready = `{ready${pending.id}}`;
    const beforeReady = output.includes(ready) ? output.slice(0, output.indexOf(ready)) : output;
    pending.stdout += beforeReady;
    if (output.includes(ready)) this._finishPending();
  }

  private _handleStderr(output: string): void {
    if (!this.pending) return;
    this._refreshTimeout(this.pending);
    for (const line of output.split(/\r?\n/)) {
      if (line) this.pending.onStderr?.(line);
    }
  }

  private _finishPending(error?: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    const timings = {
      files: pending.inputCount,
      ...timingsSince(pending.startedAt, pending.inputCount),
      command: pending.command,
    };

    if (error) {
      warningLog(`exiftool:${pending.id}`, `${pending.operation}-failed`, timings);
      pending.reject(error);
    } else {
      if (pending.command) debugLog(`exiftool:${pending.id}`, pending.operation, timings);
      pending.resolve(pending.stdout);
    }
  }

  private _refreshTimeout(pending: PendingCommand): void {
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      this._finishPending(
        new Error(`ExifTool command timed out after ${COMMAND_TIMEOUT_MS}ms without output`),
      );
      this.shutdown();
    }, COMMAND_TIMEOUT_MS);
  }
}

const session = new ExifToolSession();
let sessionEnabled = true;

export async function runExiftoolSession(
  args: string[],
  onStderr?: (line: string) => void,
  operation = 'command',
): Promise<string> {
  if (!sessionEnabled) throw new Error('ExifTool session is shutting down');
  try {
    return await session.run(args, onStderr, operation);
  } catch (error) {
    if (!sessionEnabled) throw error;
    warningLog('exiftool', 'restarting-session');
    session.shutdown();
    return session.run(args, onStderr, operation);
  }
}

function _inputCount(args: string[]): number {
  return args.findIndex((arg) => arg.startsWith('-'));
}

export function shutdownExiftoolSession(): void {
  sessionEnabled = false;
  session.shutdown();
}
