import { invoke } from '@tauri-apps/api/core';

/*
  Perceptual hashing (a 64-bit difference-hash / dHash) is computed in the Rust
  backend via the `perceptual_hash` command — see `src-tauri/src/commands/
  hashing.rs`.
*/

/**
 * Computes the 64-bit dHash of an image file by delegating to the Rust backend.
 * Accepts either an original or an already-generated thumbnail. Returns `null`
 * when the file cannot be decoded (HEIC/HEIF/AVIF or corrupt files) so a single
 * bad image never aborts a scan and callers can fall back to a thumbnail.
 */
export async function computePerceptualHash(imagePath: string): Promise<bigint | null> {
  try {
    const hash = await invoke<string>('perceptual_hash', { imagePath });
    return BigInt(hash);
  } catch {
    return null;
  }
}

/** Number of differing bits between two 64-bit perceptual hashes (0..64). */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    diff &= diff - 1n;
    count++;
  }
  return count;
}

/** Maps a Hamming distance (0..64) to a 0..100 similarity percentage. */
export function distanceToMatchPercent(distance: number): number {
  return Math.round((1 - distance / 64) * 100);
}
