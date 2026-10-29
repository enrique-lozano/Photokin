import type { EditableAssetFields } from '@/db/api/services/assets/assetEdits';
import type { CameraTags } from '@/db/models/CameraTags';
import { getMeteringModeValue } from '@/media/metadata/fields/meteringMode';

export const CAPTURE_FIELDS = [
  ['make', 'Make'],
  ['model', 'Model'],
  ['lens', 'Lens'],
  ['focalLength', 'Focal length (mm)'],
  ['shutterSpeed', 'Shutter (s)'],
  ['aperture', 'Aperture (f/)'],
  ['iso', 'ISO'],
  ['exposureProgram', 'Exposure program'],
  ['exposureCompensation', 'Exposure compensation (EV)'],
  ['meteringMode', 'Metering mode'],
  ['whiteBalance', 'White balance'],
  ['flash', 'Flash'],
] as const;
export type CaptureKey = (typeof CAPTURE_FIELDS)[number][0];
export type CaptureDraft = Record<CaptureKey, string>;

export function captureDraft(camera: CameraTags): CaptureDraft {
  const values = [
    camera.Make,
    camera.Model,
    camera.Lens,
    camera.FocalLength,
    camera.ShutterSpeed == null ? null : camera.ShutterSpeed / 1000,
    camera.Aperture,
    camera.ISO,
    camera.ExposureProgram,
    camera.ExposureCompensation,
    camera.MeteringMode,
    camera.WhiteBalance,
    camera.Flash,
  ];
  const draft = Object.fromEntries(
    CAPTURE_FIELDS.map(([key], index) => [key, String(values[index] ?? '')]),
  ) as CaptureDraft;
  draft.focalLength = draft.focalLength.replace(/\s*mm$/i, '').trim();
  return draft;
}

export function parseCaptureDraft(draft: CaptureDraft): EditableAssetFields {
  const result: EditableAssetFields = {};
  for (const [key, label] of CAPTURE_FIELDS) {
    const text = draft[key].trim();
    if (['iso', 'aperture', 'focalLength', 'shutterSpeed', 'exposureCompensation'].includes(key)) {
      const fraction =
        (key === 'shutterSpeed' || key === 'exposureCompensation') &&
        /^[+-]?\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(text)
          ? text.split('/').map(Number)
          : null;
      const value = fraction ? fraction[0] / fraction[1] : Number(text);
      if (
        text &&
        (!Number.isFinite(value) ||
          (key !== 'exposureCompensation' && value <= 0) ||
          (key === 'iso' && !Number.isInteger(value)))
      ) {
        throw new Error(`${label} must be ${key === 'iso' ? 'a positive integer' : 'a valid number'}`);
      }
      if (key === 'iso' || key === 'aperture') result[key] = text ? value : null;
      if (key === 'shutterSpeed') result.shutterSpeed = text ? value * 1000 : null;
      if (key === 'focalLength' || key === 'exposureCompensation') result[key] = text ? String(value) : null;
    } else if (key === 'meteringMode') {
      const mode = text ? getMeteringModeValue(text) : null;
      if (text && mode === null) throw new Error('Choose a valid metering mode');
      result.meteringMode = mode;
    } else {
      result[key as Exclude<CaptureKey, 'iso' | 'aperture' | 'shutterSpeed' | 'meteringMode'>] = text || null;
    }
  }
  return result;
}
