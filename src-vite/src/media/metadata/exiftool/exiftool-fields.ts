import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { Tags } from 'exiftool-vendored';
import type { JsonValue, Simplify } from 'type-fest';

// ----------
// * USE THIS FILE TO DECLARE THE METADATA FIELDS PHOTOKIN READS AND WRITES
// ----------

/** Numeric kinds are read with `-Tag#` (disables PrintConv to reveal the machine value, not a
 * guaranteed number); dates are parsed strings; structs are nested objects. */
export type ExiftoolFieldKind =
  | 'string'
  | 'number'
  | 'positiveInteger'
  | 'positiveNumber'
  | 'rating'
  | 'date'
  | 'struct';

export const NUMERIC_KINDS = ['number', 'positiveInteger', 'positiveNumber', 'rating'] as const;
type NumericKind = (typeof NUMERIC_KINDS)[number];

export function isNumericKind(kind: ExiftoolFieldKind): kind is NumericKind {
  return (NUMERIC_KINDS as readonly ExiftoolFieldKind[]).includes(kind);
}

export interface ExiftoolFieldSpec {
  /**
   * Tag names in read-priority order, first present wins (except the fields
   * marked MERGED below, which use all of them). Group prefixes are omitted on
   * purpose: the parser strips groups on read and a groupless assignment writes
   * every tag of that name, which is what keeps reads and writes symmetric.
   */
  readonly tags: readonly (keyof Tags)[];
  readonly kind: ExiftoolFieldKind;
  /** Enables writes; writeTags overrides read aliases for canonical assignments. */
  readonly writable?: true;
  readonly writeTags?: readonly (keyof Tags)[];
}

/**
 * Single source of truth: the read allowlist, the numeric/date buckets, the read
 * priorities and the write args are all derived from this object.
 */
export const EXIFTOOL_FIELDS = {
  // Path and identity for DB row and album resolution.
  sourceFile: { tags: ['SourceFile'], kind: 'string' },
  fileName: { tags: ['FileName'], kind: 'string' },
  directory: { tags: ['Directory'], kind: 'string' },

  captureDate: { tags: ['DateTimeOriginal', 'CreateDate', 'GPSDateTime'], kind: 'date' },

  // Orientation and dimensions.
  orientation: { tags: ['Orientation'], kind: 'number', writable: true },
  rotation: { tags: ['Rotation'], kind: 'number' },
  width: { tags: ['ImageWidth', 'ExifImageWidth'], kind: 'positiveInteger' },
  height: { tags: ['ImageHeight', 'ExifImageHeight'], kind: 'positiveInteger' },
  duration: {
    tags: ['Duration', 'MediaDuration', 'TrackDuration', 'SelectionDuration', 'PreviewDuration'],
    kind: 'positiveNumber',
  },

  // Title and description.
  title: { tags: ['Title'], kind: 'string', writable: true },
  description: { tags: ['ImageDescription', 'Description'], kind: 'string', writable: true },
  rating: { tags: ['Rating'], kind: 'rating', writable: true },

  // Camera and shot data.
  make: { tags: ['Make'], kind: 'string', writable: true },
  model: { tags: ['Model'], kind: 'string', writable: true },
  lens: { tags: ['LensModel', 'Lens'], kind: 'string', writable: true },
  iso: { tags: ['ISO'], kind: 'number', writable: true },
  // Aperture and ShutterSpeed are read-only Composite tags derived from these.
  aperture: { tags: ['FNumber', 'Aperture'], kind: 'number', writable: true, writeTags: ['FNumber'] },
  shutterSpeed: {
    tags: ['ExposureTime', 'ShutterSpeed'],
    kind: 'string',
    writable: true,
    writeTags: ['ExposureTime'],
  },
  meteringMode: { tags: ['MeteringMode'], kind: 'number', writable: true },
  exposureCompensation: { tags: ['ExposureCompensation'], kind: 'string', writable: true },
  exposureProgram: { tags: ['ExposureProgram'], kind: 'string', writable: true },
  whiteBalance: { tags: ['WhiteBalance'], kind: 'string', writable: true },
  flash: { tags: ['Flash'], kind: 'string', writable: true },
  focalLength: { tags: ['FocalLength'], kind: 'string', writable: true },

  software: { tags: ['Software'], kind: 'string' },
  colorSpace: { tags: ['ColorSpace'], kind: 'string' },
  bitsPerSample: { tags: ['BitsPerSample'], kind: 'string' },

  // Raw decimal degrees / metres, not the DMS string.
  latitude: { tags: ['GPSLatitude'], kind: 'number' },
  longitude: { tags: ['GPSLongitude'], kind: 'number' },
  altitude: { tags: ['GPSAltitude'], kind: 'number' },
  altitudeRef: { tags: ['GPSAltitudeRef'], kind: 'number' },
  // Structured embedded place text. Read from the canonical IPTC/XMP tags and
  // written back to the same names to keep reads and writes symmetric.
  sublocation: { tags: ['Location'], kind: 'string' },
  city: { tags: ['City'], kind: 'string' },
  state: { tags: ['State', 'Province-State'], kind: 'string' },
  country: { tags: ['Country', 'Country-PrimaryLocationName'], kind: 'string' },
  // ISO 3166-1 country code. The IPTC/IIM tag is usually alpha-3 while XMP is
  // alpha-2; the pipeline normalizes both to alpha-2. Canonical, language-neutral
  // key used to group Places by country regardless of the name's language.
  countryCode: { tags: ['CountryCode', 'Country-PrimaryLocationCode'], kind: 'string' },
  // Reverse-geocoded from GPS via ExifTool's offline geonames DB (`-api
  // geolocation`, see EXIFTOOL_GEOLOCATION_ARGS). Read-only: derived for
  // display/indexing when the file carries no embedded place text; never written
  // back as if it were an original tag.
  geolocationCity: { tags: ['GeolocationCity'], kind: 'string' },
  geolocationState: { tags: ['GeolocationRegion'], kind: 'string' },
  geolocationCountry: { tags: ['GeolocationCountry'], kind: 'string' },
  // Alpha-2 by definition (ExifTool's geonames DB), so a safe GPS-only fallback
  // for the country code when the file embeds none.
  geolocationCountryCode: { tags: ['GeolocationCountryCode'], kind: 'string' },

  // Rights / ownership.
  creator: { tags: ['Creator', 'Artist'], kind: 'string' },
  copyright: { tags: ['Copyright', 'Rights'], kind: 'string' },
  credit: { tags: ['Credit'], kind: 'string' },
  source: { tags: ['Source'], kind: 'string' },

  // MERGED: keywords from every scheme are merged and deduplicated by leaf (see
  // readTagSetFromParsedTags). The order is the read priority used as a tiebreak
  // when the same leaf appears under several schemes. ACDSee `Categories` is
  // written but never read (its XML is redundant with the higher-priority
  // schemes), so it is not listed here. Per-scheme write formats live in
  // KEYWORD_SCHEMES below.
  keywords: {
    tags: [
      'HierarchicalSubject',
      'LastKeywordXMP',
      'Keywords',
      'CatalogSets',
      'TagsList',
      'Subject',
      'XPKeywords',
    ],
    kind: 'string',
  },

  regions: { tags: ['RegionInfo'], kind: 'struct' },
} as const satisfies Record<string, ExiftoolFieldSpec>;

export type ExiftoolFieldName = keyof typeof EXIFTOOL_FIELDS;
type AnyFieldSpec = (typeof EXIFTOOL_FIELDS)[ExiftoolFieldName];

type TagNamesOf<Spec> = Spec extends { readonly tags: readonly (infer TagName)[] } ? TagName : never;
type TagNamesOfKind<Kind extends ExiftoolFieldKind> = TagNamesOf<Extract<AnyFieldSpec, { kind: Kind }>>;

export type SelectedExiftoolTagNames = TagNamesOf<AnyFieldSpec>;
export type DateExiftoolTagName = TagNamesOfKind<'date'>;
export type NumericExiftoolTagName = TagNamesOfKind<NumericKind>;

export type WritableExiftoolFieldName = {
  [Name in ExiftoolFieldName]: (typeof EXIFTOOL_FIELDS)[Name] extends { readonly writable: true }
    ? Name
    : never;
}[ExiftoolFieldName];

/** The TS value each `kind` produces once read. Add a row when adding a kind. */
interface ExiftoolKindValue {
  string: string;
  number: number;
  positiveInteger: number;
  positiveNumber: number;
  rating: number;
  date: Date;
  struct: unknown;
}

/** What a field's declared `kind` coerces to once read. */
export type ExiftoolFieldValue<Name extends ExiftoolFieldName> =
  ExiftoolKindValue[(typeof EXIFTOOL_FIELDS)[Name]['kind']];

function _tagsOfKinds<Kind extends ExiftoolFieldKind>(
  kinds: readonly Kind[],
): readonly TagNamesOfKind<Kind>[] {
  const specs = Object.values(EXIFTOOL_FIELDS) as readonly ExiftoolFieldSpec[];
  const tags = specs.filter((spec) => kinds.includes(spec.kind as Kind)).flatMap((spec) => spec.tags);
  return [...new Set(tags)] as TagNamesOfKind<Kind>[];
}

/** Coerced to a `Date` by the parser. Filesystem dates are read natively, not here. */
export const EXIFTOOL_DATE_TAGS = _tagsOfKinds(['date'] as const);
export const EXIFTOOL_NUMERIC_TAGS = _tagsOfKinds(NUMERIC_KINDS);
export const EXIFTOOL_DEFAULT_TAGS: readonly SelectedExiftoolTagNames[] = _tagsOfKinds([
  'string',
  'struct',
] as const);

/**
 * Options for ExifTool's offline reverse geocoder. `-PPLX` (geonames "section of
 * populated place") drops neighbourhoods such as Madrid's Embajadores or Delicias,
 * so a photo resolves to its municipality instead of a "city" per barrio.
 */
export const EXIFTOOL_GEOLOCATION_ARGS = ['-api', 'GeolocFeature=-PPLX'] as const;

/** Full read allowlist: every declared tag, each listed exactly once. */
export const EXIFTOOL_SELECTED_TAGS: readonly SelectedExiftoolTagNames[] = [
  ...new Set<SelectedExiftoolTagNames>([
    ...EXIFTOOL_DEFAULT_TAGS,
    ...EXIFTOOL_DATE_TAGS,
    ...EXIFTOOL_NUMERIC_TAGS,
  ]),
];

export const WRITABLE_EXIFTOOL_FIELDS = Object.entries(EXIFTOOL_FIELDS).filter(
  ([, spec]) => 'writable' in spec,
) as readonly [WritableExiftoolFieldName, ExiftoolFieldSpec][];

// ----------
// * KEYWORD SCHEMES (per-scheme read/write formats)
// ----------

/**
 * ExifTool never converts between keyword schemes, so Photokin round-trips each
 * one explicitly. On read the schemes are merged into a single deduplicated tag
 * set (see `readTagSetFromParsedTags`); on write each is serialized from an
 * asset's tag paths in its own shape (see `write/write-keywords.ts`). The order
 * mirrors `EXIFTOOL_FIELDS.keywords.tags` and sets the read tiebreak.
 */
export interface KeywordScheme {
  /** Groupless ExifTool tag name (also the key values are looked up under on read). */
  readonly tag: Extract<keyof Tags, string>;
  /** Group prefix used on write so the value lands in exactly this scheme's tag. */
  readonly writeGroup: string;
  /**
   * Storage shape of the tag:
   * - `list` — one ExifTool List item per keyword
   * - `joined` — a single string joining keywords with `itemSeparator`
   * - `xml` — ACDSee's nested `<Categories>` document
   */
  readonly container: 'list' | 'joined' | 'xml';
  /** Segment separator when hierarchy is kept; `null` writes the leaf name only. */
  readonly pathSeparator: '|' | '/' | null;
  /** Item separator for `joined` containers (e.g. `;` for XPKeywords). */
  readonly itemSeparator?: string;
  /** Merged into the tag set on read. */
  readonly read: boolean;
  /** Written to files on save. */
  readonly write: boolean;
}

/** Every keyword scheme Photokin round-trips, in read-priority / write order. */
export const KEYWORD_SCHEMES = [
  {
    tag: 'HierarchicalSubject',
    writeGroup: 'XMP-lr',
    container: 'list',
    pathSeparator: '|',
    read: true,
    write: true,
  },
  {
    tag: 'LastKeywordXMP',
    writeGroup: 'XMP-microsoft',
    container: 'list',
    pathSeparator: '/',
    read: true,
    write: true,
  },
  { tag: 'Keywords', writeGroup: 'IPTC', container: 'list', pathSeparator: null, read: true, write: true },
  {
    tag: 'CatalogSets',
    writeGroup: 'XMP-mediapro',
    container: 'list',
    pathSeparator: '|',
    read: true,
    write: true,
  },
  {
    tag: 'TagsList',
    writeGroup: 'XMP-digiKam',
    container: 'list',
    pathSeparator: '/',
    read: true,
    write: true,
  },
  {
    tag: 'Categories',
    writeGroup: 'XMP-acdsee',
    container: 'xml',
    pathSeparator: '/',
    read: false,
    write: true,
  },
  { tag: 'Subject', writeGroup: 'XMP-dc', container: 'list', pathSeparator: null, read: true, write: true },
  {
    tag: 'XPKeywords',
    writeGroup: 'EXIF',
    container: 'joined',
    pathSeparator: null,
    itemSeparator: ';',
    read: true,
    write: true,
  },
] as const satisfies readonly KeywordScheme[];

/** Lookup from an ExifTool tag name to its scheme (used by the reader). */
export const KEYWORD_SCHEME_BY_TAG: ReadonlyMap<string, KeywordScheme> = new Map(
  KEYWORD_SCHEMES.map((scheme) => [scheme.tag, scheme]),
);

// ----------
// * SHAPES OF THE DATA AS IT FLOWS THROUGH THE PIPELINE
// ----------

export type ExiftoolRawValue = JsonValue;
export type ParsedExiftoolValue = ExiftoolRawValue | Date | ParsedExiftoolValue[];

type ExiftoolTagGroup = 'EXIF' | 'XMP' | 'IPTC' | 'File' | 'QuickTime' | 'Composite' | 'MakerNotes';
type GroupedTagKey<TagName extends string> = `${ExiftoolTagGroup}:${TagName}`;
type SelectedExiftoolTags = Pick<Tags, SelectedExiftoolTagNames>;

type GroupedSelectedExiftoolTags = {
  [TagName in keyof SelectedExiftoolTags & string as GroupedTagKey<TagName>]?: ExiftoolRawValue;
};

export type ExiftoolRawMetadata = Simplify<
  {
    [TagName in keyof SelectedExiftoolTags]?: ExiftoolRawValue;
  } & Partial<GroupedSelectedExiftoolTags> & {
      [key: string]: ExiftoolRawValue;
    }
>;

/** Parsed allowlisted tags; dates become `Date` when valid and otherwise remain strings. */
export type ParsedExiftoolTags = Simplify<{
  [K in keyof SelectedExiftoolTags]: K extends DateExiftoolTagName ? Date | string : SelectedExiftoolTags[K];
}>;

export interface ParsedExiftoolRegion {
  tagName: string;
  area: AreaBox;
}

// ----------
// * RUNTIME COERCION PER KIND (drives readField/readFieldByTag)
// ----------

// `-Tag#` disables PrintConv but does not guarantee a JSON number: some machine values arrive as
// plain numeric strings or `num/den` rationals, so parse those instead of dropping the field.
const _asNumber = (value: ParsedExiftoolValue): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const fraction = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  const parsed = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const FIELD_COERCERS: Record<ExiftoolFieldKind, (value: ParsedExiftoolValue) => unknown> = {
  string: (value) => {
    if (typeof value === 'string') return value.trim() || null;
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
  },
  number: _asNumber,
  positiveInteger: (value) => {
    const number = _asNumber(value);
    return number != null && Number.isInteger(number) && number > 0 ? number : null;
  },
  positiveNumber: (value) => {
    const number = _asNumber(value);
    return number != null && number > 0 ? number : null;
  },
  rating: (value) => {
    const number = _asNumber(value);
    return number != null && Number.isInteger(number) && number >= 0 && number <= 5 ? number : null;
  },
  date: (value) => (value instanceof Date ? value : null),
  struct: (value) => value,
};
