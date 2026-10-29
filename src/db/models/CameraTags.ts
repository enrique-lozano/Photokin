import type { NumericExiftoolTagName } from '@/media/metadata/exiftool/exiftool-fields';
import { AssetMeteringMode } from '@/media/metadata/fields/meteringMode';
import type { Tags } from 'exiftool-vendored';
import type { Merge } from 'type-fest';

const CAMERA_TAG_NAMES = [
  'Make',
  'Model',
  'Lens',
  'ISO',
  'Aperture',
  'ExposureCompensation',
  'ExposureProgram',
  'WhiteBalance',
  'Flash',
  'FocalLength',
  'ShutterSpeed',
  'MeteringMode',
] as const satisfies readonly (keyof Tags)[];

export type CameraTagName = (typeof CAMERA_TAG_NAMES)[number];

/**
 * Vendored `Tags` mapped to our shape: each field explicitly nullable, and the
 * `number | string` unions resolved by whether the tag is numeric-requested
 * (owned by `EXIFTOOL_NUMERIC_TAGS`). Narrowing inside the mapped type keeps
 * ExifTool's JSDoc on each property.
 */
type RawCameraTags = {
  [K in keyof Pick<Tags, CameraTagName>]-?: K extends NumericExiftoolTagName
    ? Extract<NonNullable<Tags[K]>, number> | null
    : Extract<NonNullable<Tags[K]>, string> | null;
};

/**
 * Camera-related EXIF data used throughout the app. `Merge` redeclares the two
 * fields whose meaning differs from the vendored tag (so ExifTool's docs would
 * be wrong): `ShutterSpeed` (composite string like `'1/250'` -> ms number) and
 * `MeteringMode` (`number | string` -> our enum).
 */
export type CameraTags = Merge<
  RawCameraTags,
  {
    /** Exposure duration in milliseconds */
    ShutterSpeed: number | null;
    /** Light metering mode, resolved from ExifTool's numeric code or label. */
    MeteringMode: AssetMeteringMode | null;
  }
>;

export const EMPTY_CAMERA_TAGS: CameraTags = Object.fromEntries(
  CAMERA_TAG_NAMES.map((name) => [name, null]),
) as CameraTags;
