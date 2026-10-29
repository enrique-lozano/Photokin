import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { downloadFile } from './lib/download.mjs';
import { fileExists, resolvePlatformAndArch, resolveTargetTriple } from './lib/targetTriple.mjs';

const RELEASE_BASE_URL = 'https://github.com/enrique-lozano/Photokin/releases/download/ffmpeg-sidecars';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFilePath);
const rootDir = path.resolve(scriptsDir, '..');
const targetDir = path.join(rootDir, 'src-tauri', 'resources', 'ffmpeg');

const { platform, arch } = resolvePlatformAndArch();

async function main() {
  const triple = resolveTargetTriple(platform, arch);
  const extension = triple.includes('windows') ? '.exe' : '';
  const files = [`ffmpeg-${triple}${extension}`, `ffprobe-${triple}${extension}`];

  await mkdir(targetDir, { recursive: true });

  console.log(`Downloading FFmpeg sidecars for ${platform}/${arch} (${triple}) into ${targetDir}`);

  for (const filename of files) {
    const destinationPath = path.join(targetDir, filename);

    if (await fileExists(destinationPath)) {
      console.log(`- ${filename} already exists, skipping.`);
      continue;
    }

    console.log(`- downloading ${filename}...`);
    await downloadFile(`${RELEASE_BASE_URL}/${filename}`, destinationPath);

    if (process.platform !== 'win32') {
      await chmod(destinationPath, 0o755);
    }

    console.log(`- ${filename} downloaded.`);
  }

  console.log('FFmpeg sidecar download complete.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
