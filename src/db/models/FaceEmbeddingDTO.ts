/**
 * One face-recognition embedding per detected region. `embedding` is the
 * unit-normalized vector serialized as base64 float32 (see `media/embeddings.ts`).
 */
export interface FaceEmbeddingDTO {
  regionId: string;
  embedding: string;
}
