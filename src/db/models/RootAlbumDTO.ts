/** Root albums are persisted/queried directly, so a dedicated `RootAlbumInClient` model is unnecessary. */
export interface RootAlbumDTO {
  id: string;
  path: string;
  /** SQLite boolean: 1 while initial native discovery must be resumed. */
  importPending: number;
}
