import { discardFacesWithReceipt } from './faceMutations';

/**
 * Discards (deletes) the given face regions and surfaces an "Undo" toast that
 * restores them verbatim. Discarding is a fast, high-frequency review action, so
 * a reversible toast is preferred over an upfront confirmation dialog.
 */
export async function discardFacesWithUndo(regionIds: string[]): Promise<void> {
  await discardFacesWithReceipt(regionIds);
}
