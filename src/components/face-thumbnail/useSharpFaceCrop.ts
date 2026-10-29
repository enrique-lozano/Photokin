import { TaskQueue } from '@/utils/taskQueue/taskQueue';
import { useEffect, useState } from 'react';

/**
 * Originals are read and decoded whole — tens of megabytes each — so all the
 * face surfaces share one narrow lane. Newest first, so scrolling serves the
 * rows the user is on rather than the ones they have already passed.
 */
const sharpFaceQueue = new TaskQueue({ concurrency: 2, newestFirst: true });

/** Preload distance, so a row is usually ready by the time it scrolls in. */
const PRELOAD_MARGIN = '120px';

function _load(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    const settle = (finish: () => void) => {
      image.onload = null;
      image.onerror = null;
      finish();
    };

    image.onload = () => settle(resolve);
    image.onerror = () => settle(() => reject(new Error(`Could not load "${src}"`)));
    signal.addEventListener(
      'abort',
      () =>
        settle(() => {
          // Drops the request: a face scrolled past must not keep the lane busy.
          image.src = '';
          reject(new Error('Sharp face crop abandoned'));
        }),
      { once: true },
    );

    image.src = src;
  });
}

/**
 * The sharp source once it is decoded and can paint in one go, or `null` while
 * it cannot. Nothing is read until `node` comes on screen, and then it queues
 * behind the other faces — so a grid of thousands never turns into thousands of
 * full-size reads, and a face scrolled past releases its place.
 */
export function useSharpFaceCrop(node: Element | null, src: string | null): string | null {
  const [decoded, setDecoded] = useState<string | null>(null);

  useEffect(() => {
    setDecoded(null);
    if (!node || !src) return;

    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        observer.disconnect();
        sharpFaceQueue
          .add(() => _load(src, controller.signal), { signal: controller.signal })
          .then(() => setDecoded(src))
          // Abandoned or unreadable: the thumbnail crop stays, which is the point of it.
          .catch(() => {});
      },
      { rootMargin: PRELOAD_MARGIN },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [node, src]);

  return decoded;
}
