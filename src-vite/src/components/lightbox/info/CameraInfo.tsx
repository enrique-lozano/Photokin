import { CameraTags } from '@/db/models/CameraTags';
import { formatAperture } from '@/media/metadata/fields/aperture';
import { formatFocalLength } from '@/media/metadata/fields/focalLength';
import { AssetMeteringMode } from '@/media/metadata/fields/meteringMode';
import { formatShutterSpeed } from '@/media/metadata/fields/shutterSpeed';
import { roundTo } from '@/utils/numberFormatter';
import {
  IconAperture,
  IconBolt,
  IconBoltOff,
  IconBorderOuter,
  IconBulb,
  IconCloud,
  IconFocus,
  IconFocus2,
  IconFocusCentered,
  IconGridDots,
  IconLamp,
  IconLayoutGrid,
  IconPhotoSensor,
  IconStopwatch,
  IconSun,
  IconSunOff,
  IconSunset,
  IconTemperature,
  IconZoomIn,
  type Icon,
} from '@tabler/icons-react';

/** Shown when a core capture setting is not present in the file's metadata. */
const MISSING_VALUE = '—';

interface CameraChip {
  icon: Icon;
  /** Short value shown under the icon, e.g. `26 mm`, `f/11`, `100`. */
  value: string;
  /** Full caption, used as the tooltip, e.g. `Focal length`. */
  label: string;
  /** One-line caption shown under the value, e.g. `F. Length`. */
  shortLabel: string;
  /** True when the value is missing and a placeholder is shown instead. */
  empty: boolean;
}

export function formatExposureCompensation(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    // Non-numeric ExifTool string: surface it verbatim rather than dropping it.
    return typeof value === 'string' ? value : null;
  }
  // Thirds of a stop arrive as repeating decimals (0.33333…); one decimal is how
  // cameras label them.
  const rounded = roundTo(numeric, 1);
  if (rounded === 0) {
    return '0 EV';
  }
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} EV`;
}

function makeChip(icon: Icon, label: string, value: string | null, shortLabel: string = label): CameraChip {
  return { icon, label, shortLabel, value: value ?? MISSING_VALUE, empty: value === null };
}

/**
 * The canonical exposure readout: focal length, shutter, aperture and ISO. These
 * four settings are always rendered as a fixed block (with a placeholder for
 * missing values) so they fill a single tidy row, matching how DAM tools keep
 * the core capture settings visible. Exposure compensation — secondary and often
 * unset — lives in the details list below instead. Longer names use a one-line
 * abbreviation (full text in the tooltip) so the caption never wraps.
 */
export function buildCaptureChips(camera: CameraTags): CameraChip[] {
  const focalLength = formatFocalLength(camera.FocalLength);
  return [
    makeChip(
      IconZoomIn,
      'Focal length',
      focalLength && Number.isFinite(Number(focalLength)) ? `${focalLength} mm` : focalLength,
      'F. Length',
    ),
    makeChip(IconStopwatch, 'Shutter speed', formatShutterSpeed(camera.ShutterSpeed), 'Sh. Speed'),
    makeChip(IconAperture, 'Aperture', formatAperture(camera.Aperture)),
    makeChip(IconPhotoSensor, 'ISO', camera.ISO !== null ? String(Math.round(camera.ISO)) : null),
  ];
}

/**
 * Combines make and model into a display name, dropping a redundant maker prefix
 * so `Canon` + `Canon EOS 600D` reads as `Canon EOS 600D` rather than doubling
 * the brand.
 */
export function formatCameraName(make: string | null, model: string | null): string {
  const trimmedMake = make?.trim() ?? '';
  const trimmedModel = model?.trim() ?? '';

  if (!trimmedModel) return trimmedMake;
  if (!trimmedMake) return trimmedModel;

  return trimmedModel.toLowerCase().startsWith(trimmedMake.toLowerCase())
    ? trimmedModel
    : `${trimmedMake} ${trimmedModel}`;
}

/** Picks a flash icon from ExifTool's flash description, or nothing if unknown. */
export function flashIcon(flash: string | null): Icon | undefined {
  if (!flash) return undefined;

  const description = flash.toLowerCase();
  const fired = description.includes('fired') && !description.includes('did not fire');

  return fired ? IconBolt : IconBoltOff;
}

/**
 * Picks a white-balance icon for preset values (daylight, cloudy, shade…);
 * ambiguous values like "Manual"/"Custom" return nothing so no misleading icon is shown.
 */
export function whiteBalanceIcon(whiteBalance: string | null): Icon | undefined {
  if (!whiteBalance) return undefined;

  const value = whiteBalance.toLowerCase();

  if (value.includes('auto')) return IconTemperature;
  if (value.includes('cloud')) return IconCloud;
  if (value.includes('shade')) return IconSunOff;
  if (value.includes('twilight')) return IconSunset;
  if (value.includes('daylight') || value.includes('sunny') || value.includes('sun')) return IconSun;
  if (value.includes('tungsten') || value.includes('incandescent')) return IconBulb;
  if (value.includes('fluorescent')) return IconLamp;
  if (value.includes('flash')) return IconBolt;

  return undefined;
}

/** Hints at how a metering mode samples the frame; none for modes without a clear metaphor. */
export function meteringModeIcon(mode: AssetMeteringMode | null): Icon | undefined {
  switch (mode) {
    case AssetMeteringMode.Average:
      return IconBorderOuter;
    case AssetMeteringMode.CenterWeightedAverage:
      return IconFocusCentered;
    case AssetMeteringMode.Spot:
      return IconFocus;
    case AssetMeteringMode.MultiSpot:
      return IconGridDots;
    case AssetMeteringMode.MultiSegment:
      return IconLayoutGrid;
    case AssetMeteringMode.Partial:
      return IconFocus2;
    default:
      return undefined;
  }
}

/** True when the asset carries any camera/EXIF data worth showing. */
export function hasAnyCameraData(camera: CameraTags): boolean {
  return Boolean(
    camera.Make ||
    camera.Model ||
    camera.Lens ||
    camera.FocalLength !== null ||
    camera.ShutterSpeed !== null ||
    camera.Aperture !== null ||
    camera.ISO !== null ||
    (camera.ExposureCompensation !== null && camera.ExposureCompensation !== '') ||
    camera.ExposureProgram ||
    camera.WhiteBalance ||
    camera.Flash ||
    camera.MeteringMode !== null,
  );
}
