import { stat } from 'node:fs/promises';
import process from 'node:process';

export const SUPPORTED_PLATFORM_LABELS = ['darwin', 'linux', 'win32'];
export const SUPPORTED_ARCH_LABELS = ['x64', 'arm64'];

/**
 * Map a Node platform/arch pair to the Rust target triple Tauri expects as the
 * suffix of an `externalBin` sidecar file (e.g. `x86_64-pc-windows-msvc`).
 */
export function resolveTargetTriple(osName, archName) {
  if (!SUPPORTED_ARCH_LABELS.includes(archName)) {
    throw new Error(
      `Unsupported architecture "${archName}". Supported values: ${SUPPORTED_ARCH_LABELS.join(', ')}`,
    );
  }

  switch (osName) {
    case 'darwin':
    case 'macos':
      return archName === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    case 'linux':
      return archName === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
    case 'win32':
    case 'windows':
      return archName === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    default:
      throw new Error(
        `Unsupported platform "${osName}". Supported values: ${SUPPORTED_PLATFORM_LABELS.join(', ')}`,
      );
  }
}

/** Read platform/arch from CLI args (argv[2]/argv[3]), falling back to the host. */
export function resolvePlatformAndArch(argv = process.argv) {
  const platform = (argv[2] ?? process.platform).toLowerCase();
  const arch = (argv[3] ?? process.arch).toLowerCase();
  return { platform, arch };
}

export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
