// Shared helpers for the TEXT-backed embedding stores (semantic CLIP search and
// face recognition). Vectors are kept unit-normalized so cosine similarity is a
// plain dot product, and serialized as base64 of their little-endian float32
// bytes — compact and decoded straight into a `Float32Array` with no per-number
// parsing on the hot path.

/** L2-normalize a vector (a zero vector is returned unchanged). */
export function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (norm <= Number.EPSILON) return vector;
  return vector.map((value) => value / norm);
}

/** Cosine distance (`1 - dot`) between two normalized vectors, or `Infinity` when lengths differ. */
export function cosineDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Infinity;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return 1 - dot;
}

/** Serialize a vector as base64 of its unit-normalized float32 bytes. */
export function encodeEmbedding(vector: number[]): string {
  const floats = new Float32Array(normalize(vector));
  return _bytesToBase64(new Uint8Array(floats.buffer));
}

/** Decode a base64 float32 embedding back into a `Float32Array`. */
export function decodeEmbedding(encoded: string): Float32Array {
  const bytes = _base64ToBytes(encoded);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
}

function _bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function _base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
