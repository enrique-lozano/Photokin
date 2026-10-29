import { ProcessStoppedError } from '@/system/processCancellation';

type QueuedTask = {
  run: () => Promise<void>;
  signal?: AbortSignal;
  onAbort?: () => void;
};

/**
 * A queue for managing the execution of asynchronous tasks with a specified concurrency level.
 */
export class TaskQueue {
  queue: QueuedTask[];

  /** The number of task that are allowed to run at the same time in this queue instance */
  concurrency: number;

  /** The number of task that are currently running in this queue instance */
  running: number;

  /** Run the most recently added task first instead of in arrival order */
  private newestFirst: boolean;

  constructor(options: { concurrency: number; newestFirst?: boolean }) {
    this.concurrency = options.concurrency;
    this.queue = [];
    this.running = 0;
    this.newestFirst = options.newestFirst ?? false;
  }

  setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this._processQueue();
  }

  async add<T>(task: () => Promise<T>, options?: { signal?: AbortSignal }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) {
        reject(new ProcessStoppedError());
        return;
      }

      const taskWithResolve = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this._processQueue();
        }
      };

      const queued: QueuedTask = { run: taskWithResolve, signal };
      if (signal) {
        queued.onAbort = () => {
          const index = this.queue.indexOf(queued);
          if (index < 0) return;
          this.queue.splice(index, 1);
          reject(new ProcessStoppedError());
        };
        signal.addEventListener('abort', queued.onAbort, { once: true });
      }

      this.queue.push(queued);
      this._processQueue();
    });
  }

  /**
   * Processes the next task in the queue if the number of
   * running tasks is below the concurrency limit.
   *  */
  private _processQueue(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.newestFirst ? this.queue.pop() : this.queue.shift();
      if (task) {
        if (task.onAbort) task.signal?.removeEventListener('abort', task.onAbort);
        this.running++;
        void task.run();
      }
    }
  }
}

export const appTaskQueue = new TaskQueue({ concurrency: 1 });
