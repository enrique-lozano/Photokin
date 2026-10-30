/**
 * ISO 3166-1 country-code helpers.
 *
 * Place text stored in files is language-dependent ("Spain" / "España" /
 * "Espagne"), which fragments country grouping. The country *code* is canonical,
 * so we normalize every source to ISO 3166-1 **alpha-2** and use that as the
 * grouping key, deriving a localized display name from it at render time.
 *
 * Sources differ: the IPTC `Country-PrimaryLocationCode` tag is usually alpha-3
 * (but not always), while ExifTool's `GeolocationCountryCode` is alpha-2. This
 * module reconciles both to alpha-2.
 */

/** ISO 3166-1 alpha-3 → alpha-2. Doubles as the source of valid alpha-2 codes. */
const ALPHA3_TO_ALPHA2: Readonly<Record<string, string>> = {
  AFG: 'AF',
  ALA: 'AX',
  ALB: 'AL',
  DZA: 'DZ',
  ASM: 'AS',
  AND: 'AD',
  AGO: 'AO',
  AIA: 'AI',
  ATA: 'AQ',
  ATG: 'AG',
  ARG: 'AR',
  ARM: 'AM',
  ABW: 'AW',
  AUS: 'AU',
  AUT: 'AT',
  AZE: 'AZ',
  BHS: 'BS',
  BHR: 'BH',
  BGD: 'BD',
  BRB: 'BB',
  BLR: 'BY',
  BEL: 'BE',
  BLZ: 'BZ',
  BEN: 'BJ',
  BMU: 'BM',
  BTN: 'BT',
  BOL: 'BO',
  BES: 'BQ',
  BIH: 'BA',
  BWA: 'BW',
  BVT: 'BV',
  BRA: 'BR',
  IOT: 'IO',
  BRN: 'BN',
  BGR: 'BG',
  BFA: 'BF',
  BDI: 'BI',
  CPV: 'CV',
  KHM: 'KH',
  CMR: 'CM',
  CAN: 'CA',
  CYM: 'KY',
  CAF: 'CF',
  TCD: 'TD',
  CHL: 'CL',
  CHN: 'CN',
  CXR: 'CX',
  CCK: 'CC',
  COL: 'CO',
  COM: 'KM',
  COG: 'CG',
  COD: 'CD',
  COK: 'CK',
  CRI: 'CR',
  CIV: 'CI',
  HRV: 'HR',
  CUB: 'CU',
  CUW: 'CW',
  CYP: 'CY',
  CZE: 'CZ',
  DNK: 'DK',
  DJI: 'DJ',
  DMA: 'DM',
  DOM: 'DO',
  ECU: 'EC',
  EGY: 'EG',
  SLV: 'SV',
  GNQ: 'GQ',
  ERI: 'ER',
  EST: 'EE',
  SWZ: 'SZ',
  ETH: 'ET',
  FLK: 'FK',
  FRO: 'FO',
  FJI: 'FJ',
  FIN: 'FI',
  FRA: 'FR',
  GUF: 'GF',
  PYF: 'PF',
  ATF: 'TF',
  GAB: 'GA',
  GMB: 'GM',
  GEO: 'GE',
  DEU: 'DE',
  GHA: 'GH',
  GIB: 'GI',
  GRC: 'GR',
  GRL: 'GL',
  GRD: 'GD',
  GLP: 'GP',
  GUM: 'GU',
  GTM: 'GT',
  GGY: 'GG',
  GIN: 'GN',
  GNB: 'GW',
  GUY: 'GY',
  HTI: 'HT',
  HMD: 'HM',
  VAT: 'VA',
  HND: 'HN',
  HKG: 'HK',
  HUN: 'HU',
  ISL: 'IS',
  IND: 'IN',
  IDN: 'ID',
  IRN: 'IR',
  IRQ: 'IQ',
  IRL: 'IE',
  IMN: 'IM',
  ISR: 'IL',
  ITA: 'IT',
  JAM: 'JM',
  JPN: 'JP',
  JEY: 'JE',
  JOR: 'JO',
  KAZ: 'KZ',
  KEN: 'KE',
  KIR: 'KI',
  PRK: 'KP',
  KOR: 'KR',
  KWT: 'KW',
  KGZ: 'KG',
  LAO: 'LA',
  LVA: 'LV',
  LBN: 'LB',
  LSO: 'LS',
  LBR: 'LR',
  LBY: 'LY',
  LIE: 'LI',
  LTU: 'LT',
  LUX: 'LU',
  MAC: 'MO',
  MDG: 'MG',
  MWI: 'MW',
  MYS: 'MY',
  MDV: 'MV',
  MLI: 'ML',
  MLT: 'MT',
  MHL: 'MH',
  MTQ: 'MQ',
  MRT: 'MR',
  MUS: 'MU',
  MYT: 'YT',
  MEX: 'MX',
  FSM: 'FM',
  MDA: 'MD',
  MCO: 'MC',
  MNG: 'MN',
  MNE: 'ME',
  MSR: 'MS',
  MAR: 'MA',
  MOZ: 'MZ',
  MMR: 'MM',
  NAM: 'NA',
  NRU: 'NR',
  NPL: 'NP',
  NLD: 'NL',
  NCL: 'NC',
  NZL: 'NZ',
  NIC: 'NI',
  NER: 'NE',
  NGA: 'NG',
  NIU: 'NU',
  NFK: 'NF',
  MKD: 'MK',
  MNP: 'MP',
  NOR: 'NO',
  OMN: 'OM',
  PAK: 'PK',
  PLW: 'PW',
  PSE: 'PS',
  PAN: 'PA',
  PNG: 'PG',
  PRY: 'PY',
  PER: 'PE',
  PHL: 'PH',
  PCN: 'PN',
  POL: 'PL',
  PRT: 'PT',
  PRI: 'PR',
  QAT: 'QA',
  REU: 'RE',
  ROU: 'RO',
  RUS: 'RU',
  RWA: 'RW',
  BLM: 'BL',
  SHN: 'SH',
  KNA: 'KN',
  LCA: 'LC',
  MAF: 'MF',
  SPM: 'PM',
  VCT: 'VC',
  WSM: 'WS',
  SMR: 'SM',
  STP: 'ST',
  SAU: 'SA',
  SEN: 'SN',
  SRB: 'RS',
  SYC: 'SC',
  SLE: 'SL',
  SGP: 'SG',
  SXM: 'SX',
  SVK: 'SK',
  SVN: 'SI',
  SLB: 'SB',
  SOM: 'SO',
  ZAF: 'ZA',
  SGS: 'GS',
  SSD: 'SS',
  ESP: 'ES',
  LKA: 'LK',
  SDN: 'SD',
  SUR: 'SR',
  SJM: 'SJ',
  SWE: 'SE',
  CHE: 'CH',
  SYR: 'SY',
  TWN: 'TW',
  TJK: 'TJ',
  TZA: 'TZ',
  THA: 'TH',
  TLS: 'TL',
  TGO: 'TG',
  TKL: 'TK',
  TON: 'TO',
  TTO: 'TT',
  TUN: 'TN',
  TUR: 'TR',
  TKM: 'TM',
  TCA: 'TC',
  TUV: 'TV',
  UGA: 'UG',
  UKR: 'UA',
  ARE: 'AE',
  GBR: 'GB',
  USA: 'US',
  UMI: 'UM',
  URY: 'UY',
  UZB: 'UZ',
  VUT: 'VU',
  VEN: 'VE',
  VNM: 'VN',
  VGB: 'VG',
  VIR: 'VI',
  WLF: 'WF',
  ESH: 'EH',
  YEM: 'YE',
  ZMB: 'ZM',
  ZWE: 'ZW',
};

const VALID_ALPHA2 = new Set<string>(Object.values(ALPHA3_TO_ALPHA2));

/**
 * Normalizes any ISO 3166-1 country code to upper-case **alpha-2**, or `null`
 * when the input is empty or not a recognized code. Accepts alpha-2 (validated)
 * and alpha-3 (converted); anything else (free text, region names, garbage) is
 * rejected so we never store a bogus code.
 */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  if (code.length === 2) return VALID_ALPHA2.has(code) ? code : null;
  if (code.length === 3) return ALPHA3_TO_ALPHA2[code] ?? null;
  return null;
}

/**
 * Localized country name for an alpha-2 code via `Intl.DisplayNames`, e.g. `GB`
 * → "Reino Unido" / "United Kingdom" depending on `locale`. Returns `null` for a
 * missing or unrecognized code so callers can fall back to the stored name.
 */
export function countryNameFromCode(code: string | null | undefined, locale?: string): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  try {
    const display = new Intl.DisplayNames([locale ?? _defaultLocale()], { type: 'region' });
    const name = display.of(normalized);
    // `Intl.DisplayNames` echoes the code back when it has no name for it.
    return name && name !== normalized ? name : null;
  } catch {
    return null;
  }
}

/** App-wide locale, cached after the first resolution (see {@link getCurrentLocale}). */
let _localeCache: string | null = null;

/**
 * Overrides the locale used for display names — set once at startup from the OS
 * locale (via `@tauri-apps/plugin-os`), which is the reliable source in Tauri.
 * Kept in this pure module (no Tauri import) so it stays test-friendly; the
 * caller owns the platform call.
 */
export function setAppLocale(locale: string | null | undefined): void {
  const value = locale?.trim();
  if (value) _localeCache = value;
}

/** The app-wide locale: OS override → persisted value → WebView language → "en". */
export function getCurrentLocale(): string {
  return _defaultLocale();
}

function _defaultLocale(): string {
  if (_localeCache) return _localeCache;

  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem('app-locale') : null;
  } catch {
    stored = null;
  }
  // navigator.language is unreliable in WebView2 (often en-US), so it's only the
  // last resort; startup replaces this cache with the real OS locale.
  _localeCache = stored || (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return _localeCache;
}
