import { ExifTool, Tags } from 'exiftool-vendored';

export interface WindowAPI {
  readFilesFromDir: () => Promise<Tags[]>;
  exiftoolInstance: ExifTool;
}
