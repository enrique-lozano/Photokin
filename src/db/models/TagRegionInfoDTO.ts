import { DbEntityWithID, ModelInit, WithOptionalID } from './dbEntityWithID.ts';

export interface AreaBox {
  /** x coordinate of the center of the box (x,y) */
  x: number;
  /** y coordinate of the center of the box (x,y) */
  y: number;
  h: number;
  w: number;
}

export class AreaBoxInClient implements AreaBox {
  x: number;
  y: number;
  h: number;
  w: number;

  left: number;
  right: number;
  top: number;
  bottom: number;

  constructor(data: AreaBox) {
    this.x = data.x;
    this.y = data.y;
    this.w = data.w;
    this.h = data.h;

    this.left = this.x - this.w / 2;
    this.right = this.x + this.w / 2;
    this.top = this.y - this.h / 2;
    this.bottom = this.y + this.h / 2;
  }

  splitBy(relTo: { w: number; h: number }): AreaBox {
    return {
      x: this.x / relTo.w,
      y: this.y / relTo.h,
      h: this.h / relTo.h,
      w: this.w / relTo.w,
    };
  }

  toDB(): AreaBox {
    return {
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
    };
  }
}

export interface TagRegionInfoDTO extends AreaBox {
  id: string;

  assetId: string;

  /** If it is not defined, it will mean that we cannot identify well what is in this region. */
  tagId?: string;
  clusterId?: string | null;

  /**
   * Wheter the information is already confirmed and in the file metadata.
   * If confirmed, the tagId should be defined.
   *
   * Since SQLite do not have a boolean type, we use 0 and 1 here
   *  */
  confirmed: 0 | 1;
  faceStatus: FaceStatus;
  /** Detector confidence from 0 to 1. Null when the scan that found this face did not record one. */
  detectionScore?: number | null;
}

/**
 * Where a detected face is in review. Stored as text in `tagRegionInfo.faceStatus`
 * (guarded by a database `CHECK`).
 */
export enum FaceStatus {
  // * Changing stored enum values requires a database migration.

  /** Awaiting review: unnamed, or carrying a recognizer suggestion the user has not confirmed. */
  Pending = 'pending',
  /** The user confirmed who this is. */
  Confirmed = 'confirmed',
  /** A real face the user chose to leave unnamed ("hidden"). Excluded from matching and review. */
  Unknown = 'unknown',
  /** Not a face. The box is kept so future scans do not detect it again. */
  Rejected = 'rejected',
}

export class TagRegionInfoInClient
  extends DbEntityWithID
  implements Pick<TagRegionInfoDTO, 'assetId' | 'tagId' | 'clusterId'>
{
  assetId: string;
  tagId?: string;
  clusterId?: string | null;
  faceStatus: FaceStatus;

  /**
   * Wheter the information is already confirmed and in the file metadata.
   * If confirmed, the tagId should be defined
   *  */
  confirmed: boolean;
  detectionScore: number | null;

  areaInfo: AreaBoxInClient;

  constructor(data: Omit<ModelInit<TagRegionInfoInClient>, 'id'> & { id?: string }) {
    super(data.id);

    this.assetId = data.assetId;
    this.tagId = data.tagId;
    this.clusterId = data.clusterId;
    this.confirmed = data.confirmed;
    this.faceStatus = data.faceStatus;
    this.detectionScore = data.detectionScore;
    this.areaInfo = data.areaInfo;
  }

  static fromDB(data: WithOptionalID<TagRegionInfoDTO>): TagRegionInfoInClient {
    return new TagRegionInfoInClient({
      id: data.id ?? undefined,
      assetId: data.assetId,
      tagId: data.tagId,
      clusterId: data.clusterId,
      confirmed: data.confirmed === 1,
      faceStatus: data.faceStatus,
      detectionScore: data.detectionScore ?? null,
      areaInfo: new AreaBoxInClient(data),
    });
  }

  toDB(): TagRegionInfoDTO {
    return {
      id: this.id, // from DbEntityWithID
      assetId: this.assetId,
      tagId: this.tagId,
      clusterId: this.clusterId,
      confirmed: this.confirmed ? 1 : 0, // convert boolean to 0 | 1
      faceStatus: this.faceStatus,
      detectionScore: this.detectionScore,
      x: this.areaInfo.x,
      y: this.areaInfo.y,
      w: this.areaInfo.w,
      h: this.areaInfo.h,
    };
  }
}
