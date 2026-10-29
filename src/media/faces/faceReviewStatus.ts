/**
 * How far along a detected face is in review, as the face surfaces show it: a
 * name the user confirmed, a name the recognizer suggested (never written to
 * the file until confirmed), or a detection nobody has named yet.
 */
export type FaceReviewStatus = 'confirmed' | 'suggested' | 'unnamed';

export function faceReviewStatus(region: { tagId?: string | null; confirmed: boolean }): FaceReviewStatus {
  if (!region.tagId) return 'unnamed';
  return region.confirmed ? 'confirmed' : 'suggested';
}
