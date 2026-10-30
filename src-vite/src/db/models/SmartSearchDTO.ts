/**
 * One CLIP image embedding per asset. `embedding` is the unit-normalized vector
 * serialized as base64 float32 (see `media/embeddings.ts`).
 */
export interface SmartSearchDTO {
  assetId: string;
  embedding: string;
}
