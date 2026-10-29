import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPythonSidecar, failSidecarSetup } from './lib/pythonSidecar.mjs';

// Like face_recognition, this is our own PyInstaller-built Python tool. Unlike
// it, the CLIP models are large and multiple, so they are downloaded to the app
// data dir on first use rather than bundled here — this binary only carries ONNX
// Runtime, Pillow and the tokenizer.

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');

buildPythonSidecar({
  name: 'clip',
  projectDir: path.join(scriptsDir, 'clip'),
  targetDir: path.join(rootDir, 'src-tauri', 'resources', 'clip'),
  pyInstallerArgs: ['--collect-all', 'onnxruntime', '--collect-all', 'tokenizers'],
}).catch((error) => failSidecarSetup('clip', error));
