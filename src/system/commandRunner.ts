import { Child, ChildProcess, Command, SpawnOptions } from '@tauri-apps/plugin-shell';
import { debugCommand, debugLog, isFullCommandLoggingEnabled, warningLog } from '@/system/devLogger';

type SidecarCommandName =
  | 'resources/ffmpeg/ffmpeg'
  | 'resources/ffmpeg/ffprobe'
  | 'resources/face_recognition/face_recognition'
  | 'resources/clip/clip';
type AllowedCommandName = 'exiftool' | SidecarCommandName;

type CommandExecuteOptions = {
  args: string[];
  onStdout?: (line: string, command: CliCommand) => void;
  onStderr?: (line: string, command: CliCommand) => void;
  /**
   * Invoked for non-fatal stream errors emitted while the process is running
   * (e.g. an output line that isn't valid UTF-8). When provided, these are
   * reported here instead of rejecting the command, so the process keeps
   * streaming and the caller can collect them into a summary. Failures to
   * spawn/launch the program still reject.
   */
  onError?: (message: string, command: CliCommand) => void;
};

type CommandSpawnOptions = CommandExecuteOptions & {
  onExecutionStarted?: (child: Child, command: CliCommand) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type SpawnResult = {
  data: { code: number | null; signal: number | null };
  command: CliCommand;
};

type ExecuteResult = {
  data: ChildProcess<string>;
  command: CliCommand;
};

let commandSequence = 0;

export class CommandError extends Error {
  command: CliCommand;

  constructor(msg: string, command: CliCommand) {
    super(msg);

    this.command = command;

    Object.setPrototypeOf(this, CommandError.prototype);
  }
}

export class CliCommand {
  readonly command: Command<string>;
  name: AllowedCommandName;
  argsList: string[];
  isSidecar: boolean;

  private constructor(
    command: Command<string>,
    name: AllowedCommandName,
    argsList: string[],
    isSidecar = false,
  ) {
    this.command = command;
    this.name = name;
    this.argsList = argsList;
    this.isSidecar = isSidecar;
  }

  static create(program: AllowedCommandName, args?: string | string[], options?: SpawnOptions) {
    const argsList = Array.isArray(args) ? args : args ? [args] : [];
    const command = Command.create(program, argsList.length > 0 ? argsList : undefined, options);

    return new CliCommand(command, program, argsList);
  }

  static createSidecar(program: SidecarCommandName, args?: string | string[], options?: SpawnOptions) {
    const argsList = Array.isArray(args) ? args : args ? [args] : [];
    const command = Command.sidecar(program, argsList.length > 0 ? argsList : undefined, options);

    return new CliCommand(command, program, argsList, true);
  }

  /** Try to print the command as it would be executed in any terminal */
  toString() {
    return `${this.isSidecar ? 'sidecar:' : ''}${this.name} ${this.argsList
      .map((a) => (a.includes(' ') ? `'${a}'` : a))
      .join(' ')}`.trim();
  }
}

/** Spawn a command, streaming stdout/stderr through listeners and resolving when it closes. */
export function spawnCommand(commandName: AllowedCommandName, options: CommandSpawnOptions) {
  return _spawn(commandName, options, false);
}

/** Spawn a bundled sidecar binary (e.g. ffmpeg) with the same streaming semantics as {@link spawnCommand}. */
export function spawnSidecar(commandName: SidecarCommandName, options: CommandSpawnOptions) {
  return _spawn(commandName, options, true);
}

/** Run a command to completion, returning its full buffered output. */
export function executeCommand(commandName: AllowedCommandName, options: CommandExecuteOptions) {
  return _execute(commandName, options, false);
}

function _spawn(commandName: AllowedCommandName, options: CommandSpawnOptions, isSidecar: boolean) {
  const { args, onExecutionStarted, onStdout, onStderr, onError, timeoutMs, signal } = options;
  const traceCommand = isFullCommandLoggingEnabled();
  const commandScope = traceCommand ? `command:${++commandSequence}` : '';
  const startedAt = traceCommand ? performance.now() : 0;
  if (traceCommand) debugCommand(commandScope, commandName, args);

  return new Promise<SpawnResult>((resolve, reject) => {
    const command = _createCommand(commandName, args, isSidecar);
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let child: Child | null = null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      signal?.removeEventListener('abort', stop);
    };

    const stop = () => {
      const error = new CommandError('Command stopped', command);
      if (child) {
        void child.kill().catch(() => {});
      }
      rejectOnce(error);
    };

    const resolveOnce = (value: SpawnResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      if (traceCommand) {
        debugLog(commandScope, 'complete', {
          command: commandName,
          code: value.data.code,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      }
      resolve(value);
    };

    const rejectOnce = (error: CommandError) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      if (traceCommand) {
        warningLog(commandScope, 'failed', {
          command: commandName,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      }
      reject(error);
    };

    command.command.on('error', (error) => {
      if (onError) {
        onError(error, command);
        return;
      }

      rejectOnce(new CommandError(error, command));
    });
    command.command.stdout.on('data', (line) => onStdout?.(_decodeLine(line), command));
    command.command.stderr.on('data', (line) => onStderr?.(_decodeLine(line), command));
    command.command.on('close', (data) => resolveOnce({ data, command }));

    if (signal?.aborted) {
      stop();
      return;
    }
    signal?.addEventListener('abort', stop, { once: true });

    command.command
      .spawn()
      .then((childProcess) => {
        child = childProcess;
        if (signal?.aborted) {
          void childProcess.kill().catch(() => {});
          return;
        }
        onExecutionStarted?.(childProcess, command);

        if (typeof timeoutMs === 'number' && timeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            childProcess
              .kill()
              .catch((killError: unknown) => {
                console.warn('Unable to kill timed out command process', killError);
              })
              .finally(() => {
                rejectOnce(
                  new CommandError(`Command timed out after ${timeoutMs}ms and was terminated`, command),
                );
              });
          }, timeoutMs);
        }
      })
      .catch((error) => {
        rejectOnce(new CommandError(error, command));
      });
  });
}

function _execute(commandName: AllowedCommandName, options: CommandExecuteOptions, isSidecar: boolean) {
  const { args, onStdout, onStderr, onError } = options;
  const traceCommand = isFullCommandLoggingEnabled();
  const commandScope = traceCommand ? `command:${++commandSequence}` : '';
  const startedAt = traceCommand ? performance.now() : 0;
  if (traceCommand) debugCommand(commandScope, commandName, args);

  return new Promise<ExecuteResult>((resolve, reject) => {
    const command = _createCommand(commandName, args, isSidecar);

    command.command.on('error', (error) => {
      if (onError) {
        onError(error, command);
        return;
      }

      reject(new CommandError(error, command));
    });
    command.command.stdout.on('data', (line) => onStdout?.(_decodeLine(line), command));
    command.command.stderr.on('data', (line) => onStderr?.(_decodeLine(line), command));

    command.command
      .execute()
      .then((childProcess) => {
        if (traceCommand) {
          debugLog(commandScope, 'complete', {
            command: commandName,
            code: childProcess.code,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
        }
        resolve({ data: childProcess, command });
      })
      .catch((error) => {
        if (traceCommand) {
          warningLog(commandScope, 'failed', {
            command: commandName,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
        }
        reject(new CommandError(error, command));
      });
  });
}

function _createCommand(commandName: AllowedCommandName, args: string[], isSidecar = false): CliCommand {
  return isSidecar
    ? CliCommand.createSidecar(commandName as SidecarCommandName, args)
    : CliCommand.create(commandName, args);
}

function _decodeLine(line: string | Uint8Array): string {
  return typeof line === 'string' ? line : new TextDecoder().decode(line);
}
