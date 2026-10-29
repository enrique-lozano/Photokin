import { describe, expect, it, vi } from 'vitest';
import { ProcessStoppedError } from '@/system/processCancellation';
import { TaskQueue } from './taskQueue';

describe('Task Queue test', function () {
  it('runs waiting work in arrival order by default', async function () {
    const queue = new TaskQueue({ concurrency: 1 });
    const order: number[] = [];
    let release!: () => void;

    const blocker = queue.add(() => new Promise<void>((resolve) => (release = resolve)));
    const waiting = [1, 2, 3].map((index) =>
      queue.add(async () => {
        order.push(index);
      }),
    );

    release();
    await Promise.all([blocker, ...waiting]);
    expect(order).toEqual([1, 2, 3]);
  });

  // Thumbnails run newest-first because only visible tiles request one: during a
  // fast scroll the freshest request is the tile still on screen.
  it('runs the most recent waiting work first when newestFirst is set', async function () {
    const queue = new TaskQueue({ concurrency: 1, newestFirst: true });
    const order: number[] = [];
    let release!: () => void;

    const blocker = queue.add(() => new Promise<void>((resolve) => (release = resolve)));
    const waiting = [1, 2, 3].map((index) =>
      queue.add(async () => {
        order.push(index);
      }),
    );

    release();
    await Promise.all([blocker, ...waiting]);
    expect(order).toEqual([3, 2, 1]);
  });

  it('caps concurrent work at the configured limit', async function () {
    const queue = new TaskQueue({ concurrency: 2 });
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 5 }, () =>
        queue.add(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });

  it('applies a lower concurrency limit to waiting work', async function () {
    const queue = new TaskQueue({ concurrency: 2 });
    let active = 0;
    let peakAfterLimit = 0;
    let release!: () => void;
    const first = queue.add(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          release = () => {
            active -= 1;
            resolve();
          };
        }),
    );
    queue.setConcurrency(1);
    const rest = Array.from({ length: 3 }, () =>
      queue.add(async () => {
        active += 1;
        peakAfterLimit = Math.max(peakAfterLimit, active);
        active -= 1;
      }),
    );

    release();
    await Promise.all([first, ...rest]);
    expect(peakAfterLimit).toBe(1);
  });

  it('lets waiting work run before a background continuation', async function () {
    const queue = new TaskQueue({ concurrency: 1 });
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = queue.add(() => new Promise<void>((resolve) => (releaseFirst = resolve)));
    const userTask = queue.add(async () => {
      order.push('user');
    });
    const continuation = first.then(() =>
      queue.add(async () => {
        order.push('background');
      }),
    );

    releaseFirst();
    await Promise.all([userTask, continuation]);

    expect(order).toEqual(['user', 'background']);
  });
});

describe('TaskQueue cancellation', () => {
  it('removes an aborted task before it starts', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    let releaseFirst!: () => void;
    const first = queue.add(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const work = vi.fn(async () => 'finished');
    const controller = new AbortController();
    const queued = queue.add(work, { signal: controller.signal });

    controller.abort();

    await expect(queued).rejects.toBeInstanceOf(ProcessStoppedError);
    expect(work).not.toHaveBeenCalled();

    releaseFirst();
    await first;
  });

  it('rejects an already-aborted task without queueing it', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const controller = new AbortController();
    controller.abort();

    await expect(queue.add(async () => undefined, { signal: controller.signal })).rejects.toBeInstanceOf(
      ProcessStoppedError,
    );
    expect(queue.queue).toHaveLength(0);
  });
});
