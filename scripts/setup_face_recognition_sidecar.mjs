import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadFile } from './lib/download.mjs';
import { addDataSeparator, buildPythonSidecar, failSidecarSetup } from './lib/pythonSidecar.mjs';
import { fileExists } from './lib/targetTriple.mjs';

// Our own PyInstaller-built Python tool, bundling the OpenCV YuNet (detection)
// and SFace (recognition) ONNX models inside the executable so it runs offline.

const MODEL_BASE_URL = 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models';
const MODELS = [
  {
    filename: 'face_detection_yunet_2023mar.onnx',
    url: `${MODEL_BASE_URL}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
  },
  {
    filename: 'face_recognition_sface_2021dec.onnx',
    url: `${MODEL_BASE_URL}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
  },
];

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const pythonProjectDir = path.join(scriptsDir, 'face_recognition');
const modelsDir = path.join(pythonProjectDir, 'models');

async function ensureModels() {
  console.log('- ensuring face recognition models are downloaded...');
  await mkdir(modelsDir, { recursive: true });

  for (const model of MODELS) {
    const destination = path.join(modelsDir, model.filename);
    if (await fileExists(destination)) {
      console.log(`- ${model.filename} already present, skipping.`);
      continue;
    }
    console.log(`- downloading ${model.filename}...`);
    await downloadFile(model.url, destination);
  }
}

buildPythonSidecar({
  name: 'face_recognition',
  projectDir: pythonProjectDir,
  targetDir: path.join(rootDir, 'src-tauri', 'resources', 'face_recognition'),
  pyInstallerArgs: ['--collect-all', 'cv2', '--add-data', `${modelsDir}${addDataSeparator}models`],
  prepare: ensureModels,
}).catch((error) => failSidecarSetup('face_recognition', error));
