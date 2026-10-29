/** What the clean-up modal knows about one unsorted face. */
export type FaceQuality = {
  id: string;
  /** Detector confidence, 0..1. `null` for faces read from file metadata. */
  detectionScore: number | null;
  /** Face box area in source pixels, or `null` when the photo size is unknown. */
  pixelArea: number | null;
};

export type CleanupCriteria = {
  tooSmall: boolean;
  /** Faces whose side (square root of the box area) is under this are too small. */
  minSidePx: number;
  unsure: boolean;
  /** Faces detected with a confidence under this (0..1) are unsure. */
  minConfidence: number;
};

export type CleanupMatch = {
  tooSmallCount: number;
  unsureCount: number;
  /** Faces matching any enabled criterion, in input order. */
  ids: string[];
};

export function isTooSmall(face: FaceQuality, minSidePx: number): boolean {
  return face.pixelArea !== null && face.pixelArea > 0 && Math.sqrt(face.pixelArea) < minSidePx;
}

export function isUnsure(face: FaceQuality, minConfidence: number): boolean {
  return face.detectionScore !== null && face.detectionScore < minConfidence;
}

/**
 * Per-criterion counts (always computed, so unchecked rows still show what they
 * would catch) and the faces the enabled criteria would ignore together.
 */
export function matchCleanup(faces: readonly FaceQuality[], criteria: CleanupCriteria): CleanupMatch {
  let tooSmallCount = 0;
  let unsureCount = 0;
  const ids: string[] = [];

  for (const face of faces) {
    const small = isTooSmall(face, criteria.minSidePx);
    const unsure = isUnsure(face, criteria.minConfidence);
    if (small) tooSmallCount++;
    if (unsure) unsureCount++;
    if ((criteria.tooSmall && small) || (criteria.unsure && unsure)) ids.push(face.id);
  }

  return { tooSmallCount, unsureCount, ids };
}
