import type { Child } from '@tauri-apps/plugin-shell';
import { spawnSidecar } from '@/system/commandRunner';
import { getModelDir } from './models';

type EmbeddingLine = { id?: string; embedding: number[] };
type BatchLine = { batchId: number };
const BATCH_TIMEOUT_MS = 5 * 60_000;

function _parseEmbedding(line: string): EmbeddingLine | null {
  const match = line.match(/========> EMB: (.*)/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as EmbeddingLine;
  } catch {
    return null;
  }
}

function _parseBatch(line: string): BatchLine | null {
  const match = line.match(/========> BATCH: (.*)/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as BatchLine;
  } catch {
    return null;
  }
}

interface PendingBatch {
  id: number;
  embeddings: Map<string, number[]>;
  onProgress?: (done: number, total: number) => void;
  resolve: (embeddings: Map<string, number[]>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** One visual-model process shared by every batch in a single indexing run. */
export class ClipImageSession {
  private child: Child | null = null;
  private startPromise: Promise<Child> | null = null;
  private processPromise: Promise<unknown> | null = null;
  private pending: PendingBatch | null = null;
  private queue = Promise.resolve();
  private sequence = 0;
  private stopping = false;

  constructor(
    private readonly modelId: string,
    private readonly signal?: AbortSignal,
  ) {}

  embedImages(
    items: { id: string; path: string }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, number[]>> {
    const result = this.queue.then(() => this._embedImages(items, onProgress));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    if (this.pending) this._finishPending(new Error('CLIP image session closed'));

    const child = this.child;
    if (child) {
      try {
        await child.write(`${JSON.stringify({ type: 'shutdown' })}\n`);
      } catch {
        await child.kill().catch(() => {});
      }
    }
    await this.processPromise?.catch(() => {});
    this.child = null;
    this.startPromise = null;
  }

  private async _embedImages(
    items: { id: string; path: string }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, number[]>> {
    if (items.length === 0) return new Map();
    const child = await this._start();
    const id = ++this.sequence;

    return new Promise<Map<string, number[]>>((resolve, reject) => {
      this.pending = {
        id,
        embeddings: new Map(),
        onProgress,
        resolve,
        reject,
        timeout: this._timeout(),
      };

      child.write(`${JSON.stringify({ batchId: id, items })}\n`).catch((error) => {
        this._finishPending(new Error(String(error)));
        void child.kill().catch(() => {});
      });
    });
  }

  private async _start(): Promise<Child> {
    if (this.child) return this.child;
    if (this.startPromise) return this.startPromise;

    const modelDir = await getModelDir(this.modelId);
    this.stopping = false;
    this.startPromise = new Promise<Child>((resolve, reject) => {
      let started = false;
      this.processPromise = spawnSidecar('resources/clip/clip', {
        args: ['image-session', '--model-dir', modelDir],
        signal: this.signal,
        onExecutionStarted: (child) => {
          started = true;
          this.child = child;
          resolve(child);
        },
        onStdout: (line) => this._handleStdout(line),
        onStderr: (line) => this._handleStderr(line),
      })
        .then(() => {
          this.child = null;
          this.startPromise = null;
          if (!this.stopping) this._finishPending(new Error('CLIP image session exited unexpectedly'));
        })
        .catch((error) => {
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

    for (const line of output.split(/\r?\n/)) {
      const embedding = _parseEmbedding(line);
      if (embedding?.id) pending.embeddings.set(embedding.id, embedding.embedding);

      const batch = _parseBatch(line);
      if (batch?.batchId === pending.id) this._finishPending();
    }
  }

  private _handleStderr(output: string): void {
    const pending = this.pending;
    if (!pending) return;
    this._refreshTimeout(pending);
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/\[(\d+)\/(\d+)\]/);
      if (match) pending.onProgress?.(Number(match[1]), Number(match[2]));
    }
  }

  private _finishPending(error?: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    if (error) pending.reject(error);
    else pending.resolve(pending.embeddings);
  }

  private _timeout(): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this._finishPending(new Error(`CLIP image batch timed out after ${BATCH_TIMEOUT_MS}ms`));
      void this.child?.kill().catch(() => {});
    }, BATCH_TIMEOUT_MS);
  }

  private _refreshTimeout(pending: PendingBatch): void {
    clearTimeout(pending.timeout);
    pending.timeout = this._timeout();
  }
}

/** Encode a text query into the shared CLIP embedding space. */
export async function embedText(modelId: string, query: string): Promise<number[]> {
  const modelDir = await getModelDir(modelId);
  let embedding: number[] | null = null;

  await spawnSidecar('resources/clip/clip', {
    args: ['text', query, '--model-dir', modelDir],
    onStdout: (line) => {
      const parsed = _parseEmbedding(line);
      if (parsed) embedding = parsed.embedding;
    },
  });

  if (!embedding) throw new Error('CLIP text encoding produced no embedding');
  return embedding;
}
