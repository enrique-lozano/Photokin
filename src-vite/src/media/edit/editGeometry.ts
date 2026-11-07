import type { AreaBox } from '@/db/models/TagRegionInfoDTO';

export interface ImageEdit {
  turns: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: [number, number, number, number];
  width: number;
  height: number;
  format: 'jpg' | 'png' | 'webp';
  quality: number;
  jpegSubsampling: '444' | '422' | '420';
  optimizeJpeg: boolean;
  /** Move JPEG blocks instead of re-encoding; the saved crop snaps to the JPEG block grid. */
  lossless: boolean;
  /** Copy EXIF, GPS, keywords and other embedded details to the saved photo. */
  keepMetadata: boolean;
}

export function transformedSize(width: number, height: number, turns: number) {
  return turns % 2 ? { width: height, height: width } : { width, height };
}

export function pixelCrop(edit: ImageEdit, width: number, height: number) {
  const size = transformedSize(width, height, edit.turns);
  const [left, top, cropWidth, cropHeight] = edit.crop;
  const x = Math.round(left * size.width);
  const y = Math.round(top * size.height);
  const right = Math.round((left + cropWidth) * size.width);
  const bottom = Math.round((top + cropHeight) * size.height);
  return { x, y, width: right - x, height: bottom - y, size };
}

export function orientRegion(
  area: AreaBox,
  edit: Pick<ImageEdit, 'turns' | 'flipHorizontal' | 'flipVertical'>,
): AreaBox {
  let result = { ...area };
  for (let turn = 0; turn < edit.turns; turn++) {
    result = { x: 1 - result.y, y: result.x, w: result.h, h: result.w };
  }
  if (edit.flipHorizontal) result.x = 1 - result.x;
  if (edit.flipVertical) result.y = 1 - result.y;
  return result;
}

export function transformRegion(
  area: AreaBox,
  edit: ImageEdit,
  width: number,
  height: number,
): AreaBox | null {
  const oriented = orientRegion(area, edit);
  const crop = pixelCrop(edit, width, height);
  const left = Math.max(oriented.x - oriented.w / 2, crop.x / crop.size.width);
  const top = Math.max(oriented.y - oriented.h / 2, crop.y / crop.size.height);
  const right = Math.min(oriented.x + oriented.w / 2, (crop.x + crop.width) / crop.size.width);
  const bottom = Math.min(oriented.y + oriented.h / 2, (crop.y + crop.height) / crop.size.height);
  if (right <= left || bottom <= top || (right - left) * (bottom - top) < oriented.w * oriented.h * 0.5)
    return null;
  return {
    x: (((left + right) / 2) * crop.size.width - crop.x) / crop.width,
    y: (((top + bottom) / 2) * crop.size.height - crop.y) / crop.height,
    w: ((right - left) * crop.size.width) / crop.width,
    h: ((bottom - top) * crop.size.height) / crop.height,
  };
}

export function initialEdit(width: number, height: number, format: ImageEdit['format']): ImageEdit {
  return {
    turns: 0,
    flipHorizontal: false,
    flipVertical: false,
    crop: [0, 0, 1, 1],
    width,
    height,
    format,
    quality: 92,
    jpegSubsampling: '444',
    optimizeJpeg: true,
    lossless: false,
    keepMetadata: true,
  };
}

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The edit with its crop replaced by the area a lossless save really kept. */
export function withAppliedArea(edit: ImageEdit, area: PixelArea, width: number, height: number): ImageEdit {
  const size = transformedSize(width, height, edit.turns);
  return {
    ...edit,
    crop: [area.x / size.width, area.y / size.height, area.width / size.width, area.height / size.height],
    width: area.width,
    height: area.height,
  };
}

export function reframeCrop(
  edit: ImageEdit,
  next: Pick<ImageEdit, 'turns' | 'flipHorizontal' | 'flipVertical'>,
): ImageEdit['crop'] {
  const [left, top, width, height] = edit.crop;
  const area = { x: left + width / 2, y: top + height / 2, w: width, h: height };
  if (edit.flipHorizontal) area.x = 1 - area.x;
  if (edit.flipVertical) area.y = 1 - area.y;
  const source = orientRegion(area, {
    turns: (4 - edit.turns) % 4,
    flipHorizontal: false,
    flipVertical: false,
  });
  const result = orientRegion(source, next);
  return [Math.max(0, result.x - result.w / 2), Math.max(0, result.y - result.h / 2), result.w, result.h];
}
