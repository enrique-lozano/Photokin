import { AssetDTO } from './AssetDTO';
import { AlbumDTO } from './AlbumDTO';
import { RootAlbumDTO } from './RootAlbumDTO';
import { TagDTO } from './TagDTO';
import { TagRegionInfoDTO } from './TagRegionInfoDTO';
import { FileTagDTO } from './FileTagDTO';
import { SmartSearchDTO } from './SmartSearchDTO';
import { FaceEmbeddingDTO } from './FaceEmbeddingDTO';
import { AssetFingerprintDTO } from './AssetFingerprintDTO';

export interface AppData {
  id: string;
  value: string;
}

export interface SqliteDbStructure {
  rootAlbums: RootAlbumDTO;
  albums: AlbumDTO;
  assets: AssetDTO;
  appData: AppData;
  tags: TagDTO;
  tagRegionInfo: TagRegionInfoDTO;
  fileTags: FileTagDTO;
  smartSearch: SmartSearchDTO;
  faceEmbeddings: FaceEmbeddingDTO;
  assetFingerprints: AssetFingerprintDTO;
}
