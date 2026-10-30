// Runs `tauri dev` on a separate library profile, so testing never touches your
// own library. The database, thumbnails and Trash live in
// `<app data>/profiles/<name>/`; downloaded search models are shared.
//
//   pnpm dev:demo            open the "demo" library (kept between runs)
//   pnpm dev:demo --reset    start the "demo" library from scratch
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { identifier } = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));

/** Same folder as Tauri's `appLocalDataDir()`. */
function _appLocalDataDir() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA, identifier);
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', identifier);
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), identifier);
}

export function profileDir(profile) {
  return join(_appLocalDataDir(), 'profiles', profile);
}

export async function resetProfile(profile) {
  await rm(profileDir(profile), { recursive: true, force: true });
}

/** Starts `pnpm tauri dev` on `profile`. Extra `env` is passed to the app. */
export function startApp(profile, { env = {}, stdio = 'inherit' } = {}) {
  return spawn('pnpm', ['tauri', 'dev'], {
    cwd: ROOT,
    stdio,
    shell: true,
    env: { ...process.env, ...env, VITE_PHOTOKIN_PROFILE: profile },
  });
}

/** Stops the app started by {@link startApp}, including cargo and Vite. */
export function stopApp(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const profile = 'demo';
  if (process.argv.includes('--reset')) await resetProfile(profile);
  console.log(`Library profile "${profile}": ${profileDir(profile)}\n`);
  startApp(profile).on('exit', (code) => process.exit(code ?? 0));
}
