import { useEffect, useState } from 'react';

/**
 * Mirrors a value in local state so a control keeps what the user just picked.
 * Needed where the source is a selection snapshot that is not refreshed after
 * an edit, which would otherwise make the control snap back to the old value.
 * Re-syncs whenever the source value itself changes.
 */
export function useOptimisticValue<T>(value: T): [T, (next: T) => void] {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return [local, setLocal];
}
