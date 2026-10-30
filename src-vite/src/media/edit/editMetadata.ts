import type { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { regionsWriteArgs } from '@/media/metadata/exiftool/write/write-regions';
import { AssetOrientation } from '@/media/metadata/fields/orientation';

export function editMetadataArgs(
  source: string,
  target: string,
  width: number,
  height: number,
  regions: { name: string; area: AreaBox }[],
): string[] {
  if ([source, target].some((path) => /[\r\n]/.test(path)))
    throw new Error('Unsupported line break in filename');
  const regionArgs = regions.length
    ? regionsWriteArgs({
        fullPath: target,
        orientation: AssetOrientation.Horizontal,
        displayWidth: width,
        displayHeight: height,
        regions,
      }).slice(0, -2)
    : [];
  return [
    '-tagsFromFile',
    source,
    '-all:all',
    '-ICC_Profile',
    '-XMP-x:XMPToolkit',
    '-EXIF:Orientation#=1',
    '-XMP-tiff:Orientation#=1',
    `-EXIF:ExifImageWidth=${width}`,
    `-EXIF:ExifImageHeight=${height}`,
    `-XMP-exif:ExifImageWidth=${width}`,
    `-XMP-exif:ExifImageHeight=${height}`,
    `-XMP-tiff:ImageWidth=${width}`,
    `-XMP-tiff:ImageHeight=${height}`,
    '-ThumbnailImage=',
    '-PreviewImage=',
    '-JpgFromRaw=',
    '-XMP-mwg-rs:RegionInfo=',
    '-RegionInfoMP=',
    ...regionArgs,
    '-overwrite_original',
    target,
  ];
}
