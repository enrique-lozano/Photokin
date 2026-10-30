import { DbEntityWithID, ModelInit } from './dbEntityWithID.ts';

/** Biological sex stored for a person (a tag that has face regions). Stored as text in `tags.sex`. */
export enum PersonSex {
  // * Changing stored enum values requires a database migration.
  Female = 'female',
  Male = 'male',
  Other = 'other',
}

export interface TagDTO {
  id: string;
  parentId: string | null;
  name: string;
  /**
   * Optional user-defined color (any CSS color string, usually a hex value).
   * Only root tags use it: nested tags inherit their root's color.
   */
  color: string | null;
  /** Person metadata. Only populated for tags that represent a person. */
  sex?: PersonSex | null;
  /** Year (or ISO date string) the person was born. */
  dateBirth?: string | null;
  /** Year (or ISO date string) the person died, when applicable. */
  dateDead?: string | null;
  /** Brief free-text bio shown in the person "about" strip. */
  description?: string | null;
  /**
   * Whether the tag/person is favorited (stored as 0/1). Favorited tags are
   * surfaced as larger cards at the top of the tags/people overview pages.
   */
  isFavorite?: 0 | 1;
  /** Whether this named person/tag is hidden from normal listings. */
  isHidden?: 0 | 1;
  /** App-local portrait preference; null keeps automatic face selection. */
  profileRegionId?: string | null;
}

export class TagInClient extends DbEntityWithID implements TagDTO {
  parentId: string | null;
  name: string;
  /** The root tag's color (inherited), or `null` when the root has none. */
  color: string | null;
  /** Id of the top-level ancestor (the tag itself for a root); seeds the fallback color. */
  rootId: string;
  sex: PersonSex | null;
  dateBirth: string | null;
  dateDead: string | null;
  description: string | null;
  isFavorite: 0 | 1;
  isHidden: 0 | 1;
  profileRegionId: string | null;
  fullPath: string;
  depth: number;

  constructor(data: ModelInit<TagInClient>) {
    super(data.id);
    this.parentId = data.parentId;
    this.name = data.name;
    this.color = data.color;
    this.rootId = data.rootId;
    this.sex = data.sex;
    this.dateBirth = data.dateBirth;
    this.dateDead = data.dateDead;
    this.description = data.description;
    this.isFavorite = data.isFavorite;
    this.isHidden = data.isHidden;
    this.profileRegionId = data.profileRegionId;
    this.fullPath = data.fullPath;
    this.depth = data.depth;
  }

  static fromDB(
    data: Partial<TagDTO> &
      Pick<TagDTO, 'id' | 'parentId' | 'name'> &
      Pick<TagInClient, 'fullPath' | 'depth' | 'rootId'>,
  ): TagInClient {
    return new TagInClient({
      id: data.id,
      parentId: data.parentId,
      name: data.name,
      color: data.color ?? null,
      rootId: data.rootId,
      sex: data.sex ?? null,
      dateBirth: data.dateBirth ?? null,
      dateDead: data.dateDead ?? null,
      description: data.description ?? null,
      isFavorite: data.isFavorite ?? 0,
      isHidden: data.isHidden ?? 0,
      profileRegionId: data.profileRegionId ?? null,
      fullPath: data.fullPath,
      depth: data.depth,
    });
  }

  toDB(): TagDTO {
    return {
      id: this.id,
      parentId: this.parentId,
      name: this.name,
      color: this.color,
      sex: this.sex,
      dateBirth: this.dateBirth,
      dateDead: this.dateDead,
      description: this.description,
      isFavorite: this.isFavorite,
      isHidden: this.isHidden,
      profileRegionId: this.profileRegionId,
    };
  }
}
