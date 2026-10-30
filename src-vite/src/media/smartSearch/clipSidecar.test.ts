import type { Child } from '@tauri-apps/plugin-shell';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipImageSession, embedText, stopTextSession } from './clipSidecar';

const { spawnSidecarMock } = vi.hoisted(() => ({ spawnSidecarMock: vi.fn() }));

vi.mock('@/system/commandRunner', () => ({ spawnSidecar: spawnSidecarMock }));
vi.mock('./models', () => ({ getModelDir: vi.fn(async () => 'C:/models/clip') }));

type SpawnCallbacks = {
  onExecutionStarted: (child: Child) => void;
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
};

const embLine = (id: string, embedding: number[]) => `========> EMB: ${JSON.stringify({ id, embedding })}`;
const batchLine = (batchId: number) => `========> BATCH: ${JSON.stringify({ batchId })}`;

/**
 * Drives a `ClipImageSession` against a stand-in process, so tests can emit
 * exactly the stdout/stderr the real sidecar would and assert what the session
 * makes of it.
 */
function _mountSession() {
  let callbacks: SpawnCallbacks | undefined;
  let exitProcess: (() => void) | undefined;
  const writes: string[] = [];

  const child = {
    pid: 42,
    kill: vi.fn(async () => undefined),
    write: vi.fn(async (line: string) => {
      writes.push(line);
      if ((JSON.parse(line) as { type?: string }).type === 'shutdown') exitProcess?.();
    }),
  } as unknown as Child;

  spawnSidecarMock.mockImplementation((_name: string, options: SpawnCallbacks): Promise<unknown> => {
    callbacks = options;
    options.onExecutionStarted(child);
    return new Promise((resolve) => {
      exitProcess = () => resolve({});
    });
  });

  return {
    session: new ClipImageSession('model'),
    child,
    writes,
    emitStdout: (line: string) => callbacks?.onStdout(line),
    emitStderr: (line: string) => callbacks?.onStderr(line),
    exitProcess: () => exitProcess?.(),
    /** Waits for the next request to reach the process and returns its batch id. */
    async nextBatchId(): Promise<number> {
      const expected = writes.length + 1;
      await vi.waitFor(() => expect(writes).toHaveLength(expected));
      return (JSON.parse(writes[expected - 1]) as { batchId: number }).batchId;
    },
  };
}

describe('ClipImageSession', () => {
  beforeEach(() => {
    spawnSidecarMock.mockReset();
  });

  it('returns each image its own embedding, ignoring unparseable output', async () => {
    const harness = _mountSession();

    const embeddings = harness.session.embedImages([
      { id: 'a', path: 'a.webp' },
      { id: 'b', path: 'b.webp' },
    ]);
    const batchId = await harness.nextBatchId();

    harness.emitStdout('Loading visual model…');
    harness.emitStdout('========> EMB: {not json');
    harness.emitStdout(embLine('a', [0.1, -0.2]));
    // A single chunk can carry several records, including the batch terminator.
    harness.emitStdout(`${embLine('b', [0.3, 0.4])}\n${batchLine(batchId)}`);

    await expect(embeddings).resolves.toEqual(
      new Map([
        ['a', [0.1, -0.2]],
        ['b', [0.3, 0.4]],
      ]),
    );
  });

  it('stays pending until the terminator for its own batch arrives', async () => {
    const harness = _mountSession();

    const embeddings = harness.session.embedImages([{ id: 'a', path: 'a.webp' }]);
    const batchId = await harness.nextBatchId();
    let settled = false;
    void embeddings.then(() => {
      settled = true;
    });

    harness.emitStdout(embLine('a', [1, 0]));
    harness.emitStdout(batchLine(batchId + 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    harness.emitStdout(batchLine(batchId));
    await expect(embeddings).resolves.toEqual(new Map([['a', [1, 0]]]));
  });

  it('reports per-image progress from the sidecar stderr counter', async () => {
    const harness = _mountSession();
    const onProgress = vi.fn();

    const embeddings = harness.session.embedImages([{ id: 'a', path: 'a.webp' }], onProgress);
    const batchId = await harness.nextBatchId();

    harness.emitStderr('clip: encoding images [3/10]');
    expect(onProgress).toHaveBeenCalledWith(3, 10);

    harness.emitStdout(batchLine(batchId));
    await embeddings;
  });

  it('rejects the in-flight batch when the process dies', async () => {
    const harness = _mountSession();

    const embeddings = harness.session.embedImages([{ id: 'a', path: 'a.webp' }]);
    await harness.nextBatchId();
    harness.exitProcess();

    await expect(embeddings).rejects.toThrow('CLIP image session exited unexpectedly');
  });

  it('never starts a process for an empty batch', async () => {
    const harness = _mountSession();

    await expect(harness.session.embedImages([])).resolves.toEqual(new Map());
    expect(spawnSidecarMock).not.toHaveBeenCalled();
  });

  it('reuses one process across image batches and shuts it down', async () => {
    const harness = _mountSession();

    const first = harness.session.embedImages([{ id: 'a', path: 'a.webp' }]);
    harness.emitStdout(`${embLine('a', [1, 0])}\n${batchLine(await harness.nextBatchId())}`);
    await first;

    const second = harness.session.embedImages([{ id: 'b', path: 'b.webp' }]);
    harness.emitStdout(`${embLine('b', [0, 1])}\n${batchLine(await harness.nextBatchId())}`);
    await second;

    await harness.session.shutdown();

    expect(spawnSidecarMock).toHaveBeenCalledTimes(1);
    expect(harness.writes).toHaveLength(3);
    expect(JSON.parse(harness.writes[2])).toEqual({ type: 'shutdown' });
  });
});

describe('embedText', () => {
  /** Stand-in text session that answers each query with its own length. */
  function _mountTextProcess() {
    const exits: Array<() => void> = [];
    const writes: string[] = [];
    let answer = true;

    spawnSidecarMock.mockImplementation((_name: string, options: SpawnCallbacks): Promise<unknown> => {
      const done = new Promise((resolve) => exits.push(() => resolve({})));
      const child = {
        pid: 7,
        kill: vi.fn(async () => undefined),
        write: vi.fn(async (line: string) => {
          writes.push(line);
          const request = JSON.parse(line) as { type?: string; id?: string; text?: string };
          if (request.type === 'shutdown') exits.at(-1)?.();
          else if (answer) options.onStdout(embLine(request.id!, [request.text!.length]));
        }),
      } as unknown as Child;
      options.onExecutionStarted(child);
      return done;
    });

    return {
      writes,
      exitProcess: () => exits.at(-1)?.(),
      stopAnswering: () => (answer = false),
    };
  }

  beforeEach(async () => {
    spawnSidecarMock.mockReset();
    _mountTextProcess();
    await stopTextSession();
    spawnSidecarMock.mockReset();
  });

  it('loads the text model once and reuses it for later queries', async () => {
    _mountTextProcess();

    await expect(embedText('model', 'beach')).resolves.toEqual([5]);
    await expect(embedText('model', 'dog')).resolves.toEqual([3]);

    expect(spawnSidecarMock).toHaveBeenCalledTimes(1);
    expect(spawnSidecarMock).toHaveBeenCalledWith(
      'resources/clip/clip',
      expect.objectContaining({ args: ['text-session', '--model-dir', 'C:/models/clip'] }),
    );
  });

  it('starts the model again after the session exits on its own', async () => {
    const process = _mountTextProcess();
    await embedText('model', 'beach');

    process.exitProcess();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(embedText('model', 'dog')).resolves.toEqual([3]);

    expect(spawnSidecarMock).toHaveBeenCalledTimes(2);
  });

  it('closes the old model when another one becomes active', async () => {
    const process = _mountTextProcess();
    await embedText('model', 'beach');
    await embedText('other-model', 'beach');

    expect(spawnSidecarMock).toHaveBeenCalledTimes(2);
    expect(process.writes.map((line) => JSON.parse(line) as { type?: string })).toContainEqual({
      type: 'shutdown',
    });
  });

  it('fails a slow query without restarting the loading model', async () => {
    vi.useFakeTimers();
    try {
      const process = _mountTextProcess();
      process.stopAnswering();
      const query = embedText('model', 'beach');
      const failure = expect(query).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(45_000);
      await failure;

      expect(spawnSidecarMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
