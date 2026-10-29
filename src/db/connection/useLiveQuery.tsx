import { useEffect, useRef, useState } from 'react';
import { getTableObservable } from '../api/tableObservables';
import { SqliteDbStructure } from '../models/SqliteDbStructure';

interface UseLiveQueryOptions<T> {
  /** Array of external dependencies. Lie deps argument in useEffect() but defaults to empty array. */
  extDependencies?: unknown[];

  /** Cleanup function */
  cleanup?: () => void;

  initialData?: T | null;
}

/**
 * Runs `queryFn` once on mount (and whenever `extDependencies` or `tables`
 * change) and re-runs it every time any of the given `tables` is written to,
 * keeping `data` in sync with the database. In practice it's a `useEffect` that fetches and
 * then subscribes to the tables' update observables.
 *
 * Best suited for collection/aggregate queries, where any row change should
 * refresh the result.
 */
export function useLiveQuery<T>(
  queryFn: () => Promise<T>,
  tables: (keyof SqliteDbStructure)[],
  options: UseLiveQueryOptions<T> = {},
) {
  const { extDependencies: dependencies = [], cleanup, initialData = null } = options;
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const tablesKey = tables.join(',');

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let refetchQueued = false;

    const fetchData = async (isInitial: boolean) => {
      // A query can outlive the gap between two invalidations, and running them in
      // parallel piles up on the single connection: re-run once at the end instead.
      if (running) {
        refetchQueued = true;
        return;
      }
      running = true;

      try {
        // Only flash the loading state on mount / dependency changes. Table
        // invalidations keep the previous rows visible so progressive imports
        // do not blank the grid between batches.
        if (isInitial) {
          setLoading(true);
        }
        const result = await queryFnRef.current();
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err as Error);
      } finally {
        if (!cancelled && isInitial) {
          setLoading(false);
        }
        running = false;
        if (refetchQueued && !cancelled) {
          refetchQueued = false;
          void fetchData(false);
        }
      }
    };

    void fetchData(true);

    const subscriptions = tables.map((tableName) =>
      getTableObservable(tableName).subscribe(() => {
        void fetchData(false);
      }),
    );

    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      if (cleanup) {
        cleanup();
      }
    };
    // `tablesKey` stands in for the `tables` array so inline `['assets']` literals
    // do not re-subscribe every render. `queryFn` is always the latest via the ref.
  }, [tablesKey, ...(dependencies ?? [])]);

  return { data, error, loading };
}
