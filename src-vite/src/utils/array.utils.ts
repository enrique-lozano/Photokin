export function isIn<T>(values: readonly T[], x: unknown): x is T {
  return (values as readonly unknown[]).includes(x);
}

/**
 * Splits `items` into consecutive groups of at most `size`, preserving order.
 * Used to keep batched work (exiftool spawns, HTTP payloads, DB inserts) within
 * a fixed working set instead of processing a whole library at once.
 */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

export const asyncFilter = async <T>(
  arr: T[],
  predicate: (value: T, index: number, array: T[]) => Promise<boolean>,
): Promise<T[]> => {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
};

/**
 * Maps over `items` running at most `concurrency` tasks at a time, preserving
 * input order in the returned results. Unlike `Promise.all(arr.map(...))` this
 * bounds how many tasks run simultaneously (so we don't spawn thousands of
 * file reads / sidecar processes at once) while still keeping the event loop
 * free between awaits so the UI stays responsive.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await task(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
