import { AreaBox, AreaBoxInClient } from '@/db/models/TagRegionInfoDTO';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { toDisplayedArea } from '@/media/metadata/fields/orientedArea';
import {
  EXIFTOOL_DATE_TAGS,
  EXIFTOOL_FIELDS,
  EXIFTOOL_SELECTED_TAGS,
  FIELD_COERCERS,
  KEYWORD_SCHEME_BY_TAG,
  type ExiftoolFieldName,
  type ExiftoolFieldValue,
  type ExiftoolRawMetadata,
  type ExiftoolRawValue,
  type ParsedExiftoolRegion,
  type ParsedExiftoolTags,
  type ParsedExiftoolValue,
  type SelectedExiftoolTagNames,
} from '../exiftool-fields';

const SELECTED_TAGS = new Set<string>(EXIFTOOL_SELECTED_TAGS);
const DATE_TAGS = new Set<string>(EXIFTOOL_DATE_TAGS);
const NULLISH_STRINGS = new Set(['undef', 'null', 'undefined']);
const TAG_KEY_SEPARATORS_RE = /[|/\\]/g;

type ParsedRecord = Record<string, ParsedExiftoolValue | undefined>;

// ----------
// * RAW EXIFTOOL JSON -> ALLOWLISTED, TYPED TAGS
// ----------

export function parseRawExiftoolTags(raw: ExiftoolRawMetadata): ParsedExiftoolTags {
  const parsed: Record<string, ParsedExiftoolValue> = {};
  const seen = new Set<string>();

  for (const [rawKey, rawValue] of Object.entries(raw)) {
    if (_isNullish(rawValue)) continue;

    const key = rawKey.split(':').at(-1) ?? rawKey;
    if (!_isSelectedTag(key) || seen.has(key)) continue;

    const value = _parseTagValue(key, rawValue);
    if (value === undefined) continue;

    seen.add(key);
    parsed[key] = value;
  }

  return parsed as ParsedExiftoolTags;
}

/** Trust ExifTool's JSON values, only converting allowlisted date strings. */
function _parseTagValue(tagName: string, value: ExiftoolRawValue): ParsedExiftoolValue | undefined {
  if (_isNullish(value)) return undefined;

  if (Array.isArray(value)) {
    const items = value
      .map((item) => _parseTagValue(tagName, item))
      .filter((item): item is ParsedExiftoolValue => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  return typeof value === 'string' && DATE_TAGS.has(tagName) ? (_parseExifDate(value) ?? value) : value;
}

function _isNullish(value: unknown): boolean {
  return value == null || (typeof value === 'string' && NULLISH_STRINGS.has(value.trim()));
}

function _isSelectedTag(value: string): value is SelectedExiftoolTagNames {
  return SELECTED_TAGS.has(value);
}

function _parseExifDate(value: string): Date | undefined {
  const normalized = value.trim().replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  if (!normalized) return undefined;

  const date = new Date(/(?:[+-]\d{2}:\d{2}|z)$/i.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ----------
// * FIELD READERS (priority order + per-kind coercion)
// ----------

/** First present raw value, without allocating or reading lower-priority tags. */
export function readRawField(
  parsed: ParsedExiftoolTags,
  field: ExiftoolFieldName,
): ParsedExiftoolValue | undefined {
  const record = parsed as ParsedRecord;
  for (const tag of EXIFTOOL_FIELDS[field].tags) {
    const value = record[tag];
    if (value != null) return value;
  }
}

/**
 * Every candidate coerced to the field's declared kind, aligned with the field's
 * tag list: index `i` holds the value of tag `i`, or `null` when that tag is
 * absent or cannot be coerced. Callers that must read two fields from the *same*
 * tag (e.g. width and height) can pair the results by index.
 */
export function readFieldByTag<Name extends ExiftoolFieldName>(
  parsed: ParsedExiftoolTags,
  field: Name,
): (ExiftoolFieldValue<Name> | null)[] {
  const record = parsed as ParsedRecord;
  const coerce = FIELD_COERCERS[EXIFTOOL_FIELDS[field].kind];

  return EXIFTOOL_FIELDS[field].tags.map((tag) => {
    const value = record[tag];
    if (value == null) return null;
    return (coerce(value) ?? null) as ExiftoolFieldValue<Name> | null;
  });
}

/** First successfully coerced value, without evaluating lower-priority tags. */
export function readField<Name extends ExiftoolFieldName>(
  parsed: ParsedExiftoolTags,
  field: Name,
): ExiftoolFieldValue<Name> | null {
  const record = parsed as ParsedRecord;
  const coerce = FIELD_COERCERS[EXIFTOOL_FIELDS[field].kind];

  for (const tag of EXIFTOOL_FIELDS[field].tags) {
    const value = record[tag];
    if (value == null) continue;

    const coerced = coerce(value);
    if (coerced != null) return coerced as ExiftoolFieldValue<Name>;
  }

  return null;
}

// ----------
// * KEYWORDS (leaf-deduplicated tag paths)
// ----------

/**
 * Keyword/subject tags gathered from every read scheme, normalized to
 * `/`-separated paths and deduplicated by their leaf so the same tag under
 * different schemes is only counted once. When several schemes carry the same
 * leaf, the richest (deepest) path wins, with the scheme priority — the order of
 * `EXIFTOOL_FIELDS.keywords.tags` — as the tiebreak. This keeps a hierarchical
 * tag (e.g. `People/Alejandro`) even when a flat scheme also lists its leaf.
 */
export function readTagSetFromParsedTags(parsed: ParsedExiftoolTags): Set<string> {
  const record = parsed as ParsedRecord;
  const bestPathByLeaf = new Map<string, string>();

  for (const tag of EXIFTOOL_FIELDS.keywords.tags) {
    const raw = record[tag];
    if (raw == null) continue;

    for (const entry of _expandKeywordEntries(tag, raw)) {
      const normalized = entry.replaceAll(TAG_KEY_SEPARATORS_RE, '/').trim();
      const leaf = normalized.split('/').at(-1);
      if (!leaf) continue;

      const current = bestPathByLeaf.get(leaf);
      if (!current || _segmentCount(normalized) > _segmentCount(current)) {
        bestPathByLeaf.set(leaf, normalized);
      }
    }
  }

  return new Set(bestPathByLeaf.values());
}

const _segmentCount = (path: string): number => path.split('/').length;

/**
 * Splits one scheme's raw value into individual keyword strings. `joined`
 * schemes (XPKeywords) hold every keyword in a single delimited string; the
 * rest are already ExifTool lists (or a lone string).
 */
function _expandKeywordEntries(tag: string, raw: ParsedExiftoolValue): string[] {
  const scheme = KEYWORD_SCHEME_BY_TAG.get(tag);
  const items = (Array.isArray(raw) ? raw : [raw]).filter((item): item is string => typeof item === 'string');

  if (scheme?.container === 'joined' && scheme.itemSeparator) {
    return items.flatMap((item) => item.split(scheme.itemSeparator!));
  }
  return items;
}

// ----------
// * FACE REGIONS (RegionInfo struct -> client-oriented boxes)
// ----------

interface ExifRegionArea {
  X: number;
  Y: number;
  W: number;
  H: number;
}

interface ExifRegion {
  Name: string;
  Area: ExifRegionArea;
}

export function readRegionsFromParsedTags(
  parsed: ParsedExiftoolTags,
  orientation: AssetOrientation,
): ParsedExiftoolRegion[] {
  const regionInfo = readRawField(parsed, 'regions');
  if (!_isRegionInfo(regionInfo)) return [];

  return regionInfo.RegionList.map((region) => ({
    tagName: region.Name,
    area: _toClientArea(region.Area, orientation),
  }));
}

function _toClientArea(area: ExifRegionArea, orientation: AssetOrientation): AreaBox {
  return new AreaBoxInClient(toDisplayedArea({ x: area.X, y: area.Y, w: area.W, h: area.H }, orientation));
}

function _isRegionInfo(value: unknown): value is { RegionList: ExifRegion[] } {
  return _isObject(value) && Array.isArray(value.RegionList) && value.RegionList.every(_isRegion);
}

function _isRegion(value: unknown): value is ExifRegion {
  return _isObject(value) && typeof value.Name === 'string' && _isRegionArea(value.Area);
}

function _isRegionArea(value: unknown): value is ExifRegionArea {
  return (
    _isObject(value) &&
    ['X', 'Y', 'W', 'H'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
  );
}

function _isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
