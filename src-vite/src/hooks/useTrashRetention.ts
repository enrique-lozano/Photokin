import { useEffect } from 'react';
import { purgeExpiredTrash } from '@/system/trash';

/**
 * Purges Trash items older than the retention window once per app launch. Runs
 * quietly in the background (no toast); only enabled on the main window since
 * the settings window shares the same entry point.
 */
export function useTrashRetention(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void purgeExpiredTrash()
      .then((count) => {
        if (!cancelled && count > 0) {
          console.log(`[trash] purged ${count} expired item(s)`);
        }
      })
      .catch((error) => {
        console.error('[trash] failed to purge expired items', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
