import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { composeLocationName } from '@/media/metadata/location/locationDraft';
import { AssetMetadataDTO } from './AssetDTO';
import { AssetLocation } from './AssetLocation';
import { AssetRights } from './AssetRights';
import { CameraTags } from './CameraTags';
import { ModelInit } from './dbEntityWithID.ts';

export class AssetMetadata {
  width: number;
  height: number;
  date: Date;
  duration: number;
  camera: CameraTags;
  /** Software/firmware that produced or last edited the file (EXIF/XMP). */
  software: string | null;
  /** User/XMP title (dc:title). Null when unset. */
  title: string | null;
  description: string | null;
  orientation: AssetOrientation;
  /** XMP star rating, 0–5. Null means the file has no rating tag. */
  rating: number | null;
  location: AssetLocation | null;
  rights: AssetRights | null;
  colorSpace: string | null;
  bitDepth: string | null;
  /** ISO-8601 timestamp of the last time this file's metadata was read from disk. */
  lastScanned: string | null;

  constructor(data: ModelInit<AssetMetadata>) {
    this.width = data.width;
    this.height = data.height;
    this.date = data.date;
    this.duration = data.duration;
    this.camera = data.camera;
    this.software = data.software;
    this.title = data.title;
    this.description = data.description;
    this.orientation = data.orientation;
    this.rating = data.rating;
    this.location = data.location;
    this.rights = data.rights;
    this.colorSpace = data.colorSpace;
    this.bitDepth = data.bitDepth;
    this.lastScanned = data.lastScanned;
  }

  static fromDB(data: AssetMetadataDTO): AssetMetadata {
    return new AssetMetadata({
      width: data.width,
      height: data.height,
      date: new Date(data.date),
      duration: data.duration,
      software: data.software,
      title: data.title,
      description: data.description,
      orientation: data.orientation,
      rating: data.rating,
      camera: {
        Make: data.make,
        Model: data.model,
        Lens: data.lens,
        ISO: data.iso,
        Aperture: data.aperture,
        ExposureCompensation: data.exposure,
        ExposureProgram: data.exposureProgram,
        WhiteBalance: data.whiteBalance,
        Flash: data.flash,
        FocalLength: data.focalLength,
        ShutterSpeed: data.shutterSpeed,
        MeteringMode: data.meteringMode,
      },
      location: AssetMetadata._locationFromDB(data),
      rights: AssetMetadata._rightsFromDB(data),
      colorSpace: data.colorSpace,
      bitDepth: data.bitDepth,
      lastScanned: data.lastScanned,
    });
  }

  toDB(): AssetMetadataDTO {
    return {
      width: this.width,
      height: this.height,
      orientation: this.orientation,
      date: this.date.toISOString(),
      duration: this.duration,
      software: this.software,
      title: this.title,
      description: this.description,
      rating: this.rating,
      make: this.camera.Make,
      model: this.camera.Model,
      lens: this.camera.Lens,
      iso: this.camera.ISO,
      aperture: this.camera.Aperture,
      focalLength: this.camera.FocalLength,
      shutterSpeed: this.camera.ShutterSpeed,
      meteringMode: this.camera.MeteringMode,
      exposure: this.camera.ExposureCompensation,
      exposureProgram: this.camera.ExposureProgram,
      whiteBalance: this.camera.WhiteBalance,
      flash: this.camera.Flash,
      latitude: this.location?.latitude ?? null,
      longitude: this.location?.longitude ?? null,
      altitude: this.location?.altitude ?? null,
      locationSublocation: this.location?.sublocation ?? null,
      locationCity: this.location?.city ?? null,
      locationState: this.location?.state ?? null,
      locationCountry: this.location?.country ?? null,
      locationCountryCode: this.location?.countryCode ?? null,
      locationSource: this.location?.source ?? null,
      creator: this.rights?.creator ?? null,
      copyright: this.rights?.copyright ?? null,
      credit: this.rights?.credit ?? null,
      source: this.rights?.source ?? null,
      colorSpace: this.colorSpace,
      bitDepth: this.bitDepth,
      lastScanned: this.lastScanned,
    };
  }

  getAltText() {
    if (this.description) {
      return this.description;
    }

    return `Image taken on ${this.date.toLocaleString()}`;
  }

  get megapixels(): number {
    return (this.width * this.height) / 1_000_000;
  }

  /** The larger dimension in pixels, which is the same whichever way the photo is rotated. */
  get longestSide(): number {
    return Math.max(this.width, this.height);
  }

  private static _locationFromDB(data: AssetMetadataDTO): AssetLocation | null {
    const location: AssetLocation = {
      source: data.locationSource ?? null,
      // Display label derived from the structured parts; not stored as a column.
      name: composeLocationName({
        sublocation: data.locationSublocation,
        city: data.locationCity,
        state: data.locationState,
        country: data.locationCountry,
      }),
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude,
      sublocation: data.locationSublocation,
      city: data.locationCity,
      state: data.locationState,
      country: data.locationCountry,
      countryCode: data.locationCountryCode,
    };

    const hasData =
      location.latitude !== null ||
      location.longitude !== null ||
      location.altitude !== null ||
      location.sublocation !== null ||
      location.city !== null ||
      location.state !== null ||
      location.country !== null ||
      location.countryCode !== null;

    return hasData ? location : null;
  }

  private static _rightsFromDB(data: AssetMetadataDTO): AssetRights | null {
    const rights: AssetRights = {
      creator: data.creator,
      copyright: data.copyright,
      credit: data.credit,
      source: data.source,
    };

    const hasData =
      rights.creator !== null ||
      rights.copyright !== null ||
      rights.credit !== null ||
      rights.source !== null;

    return hasData ? rights : null;
  }
}
