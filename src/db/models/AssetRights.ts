/** Rights / ownership metadata (IPTC/XMP) associated with an asset. */
export interface AssetRights {
  creator: string | null;
  copyright: string | null;
  credit: string | null;
  source: string | null;
}

/** True when at least one rights field carries a value. */
export function hasRightsData(rights: AssetRights | null): rights is AssetRights {
  return rights !== null && Boolean(rights.creator || rights.copyright || rights.credit || rights.source);
}
