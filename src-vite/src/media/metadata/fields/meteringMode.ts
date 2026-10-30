/**
 * Metering mode used by the camera when the photo was captured.
 *
 * Mirrors the EXIF `MeteringMode` tag values documented by ExifTool:
 * https://exiftool.org/TagNames/EXIF.html
 */
export enum AssetMeteringMode {
  // * Changing stored enum values requires a database migration.

  /**
   * Metering mode was not recorded by the camera.
   */
  Unknown = 0,

  /**
   * Average metering across the whole frame.
   */
  Average = 1,

  /**
   * Center-weighted average metering.
   */
  CenterWeightedAverage = 2,

  /**
   * Spot metering on a small area of the frame.
   */
  Spot = 3,

  /**
   * Spot metering across several discrete areas.
   */
  MultiSpot = 4,

  /**
   * Multi-segment / Pattern / Evaluative metering (vendor-dependent name).
   */
  MultiSegment = 5,

  /**
   * Partial metering, between center-weighted and spot.
   */
  Partial = 6,

  /**
   * Any non-standard metering mode reported by the camera.
   */
  Other = 255,
}

/**
 * Human-readable label for an {@link AssetMeteringMode}, suitable for display
 * in the UI. Returns `null` for missing or unknown values so callers can omit
 * the field entirely instead of rendering a meaningless placeholder.
 */
export function getMeteringModeLabel(mode: AssetMeteringMode | null | undefined): string | null {
  switch (mode) {
    case AssetMeteringMode.Average:
      return 'Average';
    case AssetMeteringMode.CenterWeightedAverage:
      return 'Center-weighted';
    case AssetMeteringMode.Spot:
      return 'Spot';
    case AssetMeteringMode.MultiSpot:
      return 'Multi-spot';
    case AssetMeteringMode.MultiSegment:
      return 'Multi-segment';
    case AssetMeteringMode.Partial:
      return 'Partial';
    default:
      // `Unknown`, `Other`, `null` and `undefined` carry no useful information.
      return null;
  }
}

/**
 * Resolve ExifTool's `MeteringMode` value (either a numeric code or a
 * descriptive string) to an {@link AssetMeteringMode} enum member, returning
 * `null` for unrecognized inputs so callers can decide how to handle them.
 */
export function getMeteringModeValue(value: string | number): AssetMeteringMode | null {
  if (typeof value === 'number') {
    return value in AssetMeteringMode ? (value as AssetMeteringMode) : null;
  }

  switch (value) {
    case 'Unknown':
      return AssetMeteringMode.Unknown;
    case 'Average':
      return AssetMeteringMode.Average;
    case 'Center-weighted average':
    case 'Center Weighted Average':
      return AssetMeteringMode.CenterWeightedAverage;
    case 'Spot':
      return AssetMeteringMode.Spot;
    case 'Multi-spot':
    case 'MultiSpot':
      return AssetMeteringMode.MultiSpot;
    case 'Multi-segment':
    case 'Multi-Segment':
    case 'Pattern':
    case 'Evaluative':
      return AssetMeteringMode.MultiSegment;
    case 'Partial':
      return AssetMeteringMode.Partial;
    case 'Other':
      return AssetMeteringMode.Other;
    default:
      return null;
  }
}
