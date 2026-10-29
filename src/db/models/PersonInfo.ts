import { TagInClient } from './TagDTO';
import { AreaBox, FaceStatus } from './TagRegionInfoDTO';

/**
 * The people shapes {@link RegionsService} produces: a person is either a named
 * tag, an automatic cluster, or the pile of faces that belongs to neither.
 */
export type PersonKind = 'known' | 'unknown' | 'unsorted';

export type PersonRegion = {
  id: string;
  assetId: string;
  tagId?: string;
  clusterId?: string | null;
  confirmed: boolean;
  faceStatus: FaceStatus;
  area: AreaBox;
  path: string;
};

export type PersonInfo = {
  id: string;
  kind: PersonKind;
  displayName: string;
  totalResults: number;
  tag: TagInClient | undefined;
  unconfirmedResults: number;
  representativeRegion?: PersonRegion;
};
