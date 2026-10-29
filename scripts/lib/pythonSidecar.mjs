import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileExists, resolveTargetTriple } from './targetTriple.mjs';

// Our Python sidecars (face_recognition, clip) are built locally with
// PyInstaller: there is no upstream release to download. PyInstaller can only
// target the host OS, so each build produces the current platform/arch triple —
// binaries for other platforms need a run on that platform (e.g. a CI matrix).

const isWindows = process.platform === 'win32';
export const exeExtension = isWindows ? '.exe' : '';
/** `--add-data` uses `;` on Windows and `:` elsewhere. */
export const addDataSeparator = isWindows ? ';' : ':';

/** Run a command inheriting stdio; throw with a helpful message on failure. */
export function run(command, args, options = {}) {
  const printable = `${command} ${args.join(' ')}`;
  console.log(`\n> ${printable}`);

  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.error) {
    throw new Error(`Failed to run "${printable}": ${result.error.message}`);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Command "${printable}" exited with code ${result.status}`);
  }
}

/**
 * Builds a PyInstaller sidecar into `<targetDir>/<name>-<triple><exe>` and skips
 * the whole build when that binary is already there (`--force` rebuilds).
 *
 * `projectDir` holds `<name>.py` and `requirements.txt`; `pyInstallerArgs` adds
 * the tool-specific flags (bundled models, `--collect-all`, ...). `prepare` runs
 * before the build for anything that has to exist first, such as model files.
 */
export async function buildPythonSidecar({ name, projectDir, targetDir, pyInstallerArgs = [], prepare }) {
  const triple = resolveTargetTriple(process.platform, process.arch);
  const finalBinaryName = `${name}-${triple}${exeExtension}`;
  const finalBinaryPath = path.join(targetDir, finalBinaryName);

  await mkdir(targetDir, { recursive: true });

  if (!process.argv.includes('--force') && (await fileExists(finalBinaryPath))) {
    console.log(`- ${finalBinaryName} already exists, skipping build. (use --force to rebuild)`);
    return;
  }

  console.log(`Building ${name} sidecar for ${triple} into ${targetDir}`);
  console.log('This is a one-time build and may take a few minutes on first run.');

  await prepare?.();

  const venvPython = await _ensureVenv(projectDir);
  const distDir = path.join(projectDir, 'build_dist');
  const workDir = path.join(projectDir, 'build_work');

  console.log('- running PyInstaller...');
  run(
    venvPython,
    [
      '-m',
      'PyInstaller',
      '-F',
      `${name}.py`,
      '--name',
      name,
      ...pyInstallerArgs,
      '--distpath',
      'build_dist',
      '--workpath',
      'build_work',
      '--specpath',
      '.',
      '-y',
      '--clean',
      '--noconfirm',
    ],
    { cwd: projectDir },
  );

  const builtBinary = path.join(distDir, `${name}${exeExtension}`);

  if (!(await fileExists(builtBinary))) {
    throw new Error(`PyInstaller did not produce the expected binary at ${builtBinary}`);
  }

  await cp(builtBinary, finalBinaryPath);

  if (!isWindows) {
    await chmod(finalBinaryPath, 0o755);
  }

  // Clean up intermediate build artifacts; keep the venv for faster rebuilds.
  await rm(distDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
  await rm(path.join(projectDir, `${name}.spec`), { force: true });

  console.log(`\n${name} sidecar built: ${finalBinaryPath}`);
}

/** Creates the project's venv if needed and installs its requirements + PyInstaller. */
async function _ensureVenv(projectDir) {
  const venvDir = path.join(projectDir, 'env');
  const venvPython = isWindows
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  if (!(await fileExists(venvPython))) {
    console.log('- creating Python virtual environment...');
    run(_resolveSystemPython(), ['-m', 'venv', 'env'], { cwd: projectDir });
  }

  console.log('- installing Python dependencies...');
  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: projectDir });
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: projectDir });
  run(venvPython, ['-m', 'pip', 'install', 'pyinstaller'], { cwd: projectDir });

  return venvPython;
}

function _resolveSystemPython() {
  const candidates = isWindows ? ['python', 'python3', 'py'] : ['python3', 'python'];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    'Could not find a Python interpreter on PATH. Install Python 3.8+ (https://www.python.org/downloads/) and retry.',
  );
}

/** Reports the failure and exits non-zero, so `predev`/`prebuild` stop. */
export function failSidecarSetup(name, error) {
  console.error(`\nFailed to set up the ${name} sidecar.`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
