/**
 * Enum representing the various orientations an asset (such as an image) can have.
 */
export enum AssetOrientation {
  // * Changing stored enum values requires a database migration.

  /**
   * Image is in its normal horizontal orientation.
   */
  Horizontal = 1,

  /**
   * Image is mirrored horizontally.
   */
  MirrorHorizontal = 2,

  /**
   * Image is rotated 180 degrees.
   */
  Rotate180 = 3,

  /**
   * Image is mirrored vertically.
   */
  MirrorVertical = 4,

  /**
   * Image is mirrored horizontally and then rotated 270 degrees clockwise.
   */
  MirrorHorizontalRotate270CW = 5,

  /**
   * Image is rotated 90 degrees clockwise.
   */
  Rotate90CW = 6,

  /**
   * Image is mirrored horizontally and then rotated 90 degrees clockwise.
   */
  MirrorHorizontalRotate90CW = 7,

  /**
   * Image is rotated 270 degrees clockwise.
   */
  Rotate270CW = 8,
}

/**
 * Turns stored raster dimensions into displayed ones by swapping the sides for
 * the orientations that transpose the frame (everything above
 * {@link AssetOrientation.MirrorVertical}).
 */
export function orientedDimensions(
  width: number,
  height: number,
  orientation: AssetOrientation,
): { width: number; height: number } {
  return orientation > AssetOrientation.MirrorVertical ? { width: height, height: width } : { width, height };
}

export type OrientationRotationDirection = 'left' | 'right';

/**
 * Composes a quarter-turn with an EXIF orientation. Mirrored orientations need
 * their own cycle so repeated rotations preserve the reflection correctly.
 */
export function rotateOrientation(
  orientation: AssetOrientation,
  direction: OrientationRotationDirection,
): AssetOrientation {
  const rightTurns: Record<AssetOrientation, AssetOrientation> = {
    [AssetOrientation.Horizontal]: AssetOrientation.Rotate90CW,
    [AssetOrientation.MirrorHorizontal]: AssetOrientation.MirrorHorizontalRotate90CW,
    [AssetOrientation.Rotate180]: AssetOrientation.Rotate270CW,
    [AssetOrientation.MirrorVertical]: AssetOrientation.MirrorHorizontalRotate270CW,
    [AssetOrientation.MirrorHorizontalRotate270CW]: AssetOrientation.MirrorHorizontal,
    [AssetOrientation.Rotate90CW]: AssetOrientation.Rotate180,
    [AssetOrientation.MirrorHorizontalRotate90CW]: AssetOrientation.MirrorVertical,
    [AssetOrientation.Rotate270CW]: AssetOrientation.Horizontal,
  };

  if (direction === 'right') return rightTurns[orientation];

  const leftTurns = Object.fromEntries(
    Object.entries(rightTurns).map(([from, to]) => [to, Number(from)]),
  ) as Record<AssetOrientation, AssetOrientation>;
  return leftTurns[orientation];
}

/**
 * Human-readable label for an {@link AssetOrientation}, suitable for display in
 * the technical metadata section. Returns `null` for missing values so callers
 * can omit the field rather than render a placeholder.
 */
export function getOrientationLabel(orientation: AssetOrientation | null | undefined): string | null {
  switch (orientation) {
    case AssetOrientation.Horizontal:
      return 'Normal';
    case AssetOrientation.MirrorHorizontal:
      return 'Mirror horizontal';
    case AssetOrientation.Rotate180:
      return 'Rotate 180°';
    case AssetOrientation.MirrorVertical:
      return 'Mirror vertical';
    case AssetOrientation.MirrorHorizontalRotate270CW:
      return 'Mirror horizontal + 270° CW';
    case AssetOrientation.Rotate90CW:
      return 'Rotate 90° CW';
    case AssetOrientation.MirrorHorizontalRotate90CW:
      return 'Mirror horizontal + 90° CW';
    case AssetOrientation.Rotate270CW:
      return 'Rotate 270° CW';
    default:
      return null;
  }
}

export function getOrientationValue(orientation: string | number): AssetOrientation | null {
  if (typeof orientation === 'number') {
    return Number.isInteger(orientation) && orientation in AssetOrientation ? orientation : null;
  }

  switch (orientation) {
    case 'Horizontal':
      return AssetOrientation.Horizontal;
    case 'Mirror horizontal':
      return AssetOrientation.MirrorHorizontal;
    case 'Rotate 180':
      return AssetOrientation.Rotate180;
    case 'Mirror vertical':
      return AssetOrientation.MirrorVertical;
    case 'Mirror horizontal and rotate 270 CW':
      return AssetOrientation.MirrorHorizontalRotate270CW;
    case 'Rotate 90 CW':
      return AssetOrientation.Rotate90CW;
    case 'Mirror horizontal and rotate 90 CW':
      return AssetOrientation.MirrorHorizontalRotate90CW;
    case 'Rotate 270 CW':
      return AssetOrientation.Rotate270CW;
    default:
      return null; // Handle unknown cases
  }
}
