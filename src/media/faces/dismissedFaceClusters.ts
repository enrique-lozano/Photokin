import { AppDataKey, AppDataService } from '@/db/api/services/appData.service';
import { RegionsService } from '@/db/api/services/regions.service';

/** Stable identity for an exact group membership, independent of display order. */
export function faceClusterMembershipKey(regionIds: string[]): string {
  return [...new Set(regionIds)].sort().join('|');
}

export async function getDismissedFaceClusterKeys(): Promise<Set<string>> {
  const stored = await AppDataService.get(AppDataKey.DismissedFaceClusters);
  if (!stored) return new Set();

  try {
    const parsed: unknown = JSON.parse(stored);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

export function filterDismissedFaceClusters(
  clusters: Record<string, string[]>,
  dismissedKeys: Set<string>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(clusters).filter(
      ([, regionIds]) => !dismissedKeys.has(faceClusterMembershipKey(regionIds)),
    ),
  );
}

/**
 * Remembers the exact grouping and removes it from the suggestions without
 * deleting any face. A future clustering pass may suggest a materially changed
 * group, but will not recreate this same one.
 */
export async function breakUpSuggestedFaceGroup(regionIds: string[]): Promise<void> {
  const membershipKey = faceClusterMembershipKey(regionIds);
  if (!membershipKey) return;

  const dismissed = await getDismissedFaceClusterKeys();
  dismissed.add(membershipKey);
  await AppDataService.set(AppDataKey.DismissedFaceClusters, JSON.stringify([...dismissed]));
  await RegionsService.clearRegionClusters(regionIds);
}

/** Reverses the memory half of {@link breakUpSuggestedFaceGroup}, for undo. */
export async function forgetBrokenUpFaceGroup(regionIds: string[]): Promise<void> {
  const dismissed = await getDismissedFaceClusterKeys();
  if (!dismissed.delete(faceClusterMembershipKey(regionIds))) return;
  await AppDataService.set(AppDataKey.DismissedFaceClusters, JSON.stringify([...dismissed]));
}
