import { Tags, exiftool } from 'exiftool-vendored';
import fs from 'fs';
import path from 'path';

// TODO -> Add your path
const directoryPath = `C:\\Users\\Your User\\Photos\\Test`;

export type ImageWithMetadata = Tags;

export async function readFilesFromDirectory() {
  try {
    console.log(__dirname);
    const files = fs.readdirSync(directoryPath);
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.mp4';
    });

    const imgArray: ImageWithMetadata[] = [];

    console.log(filteredFiles);

    for (const file of filteredFiles) {
      imgArray.push(await exiftool.read(path.join(directoryPath, file)));
    }

    return imgArray;
  } catch (error) {
    console.error('Error reading files from directory:', error);
    throw error;
  }
}
