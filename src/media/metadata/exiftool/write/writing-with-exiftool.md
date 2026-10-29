# Writing metadata with ExifTool

A practical guide to building **correct** `exiftool` write commands. ExifTool is powerful, but a handful of its behaviors surprise you the first time — which group a tag lands in, how it reformats dates, hidden "sibling" tags, timezone quirks. This page collects the ones that actually bite, with verified examples, so you can compose a command that does exactly what you intend — nothing more, nothing less.

> This file lives next to Photokin's write code, but it documents **ExifTool itself**. For reading/parsing, see [`../read/`](../read/).

## TL;DR

- **Groups:** a tag with no group prefix is _created_ in one group only (EXIF, else IPTC, else XMP) but _updated_ in every group where it already exists. Prefix the group to target a specific copy. → [Groups and priority](#groups-and-priority-exif--iptc--xmp)
- **Dates:** hand the same full `YYYY:MM:DD HH:MM:SS` string to every date tag; ExifTool keeps the part each tag needs. → [Date and time values](#date-and-time-values)
- **Time zones:** IPTC/XMP time tags get the machine's **local** offset unless you append one. Want UTC? write `…+00:00`.
- **Create vs update:** `-wm w` updates only existing tags; `-wm cg` only creates missing ones. → [Write modes](#write-modes--wm)
- **Safety:** `-overwrite_original` skips the `*_original` backup; `-m` lets _minor_ errors through (it never hides real failures).

## Anatomy of a write command

```
exiftool [flags] -TAG[=VALUE] ... FILE...
```

- `-TAG=VALUE` sets a tag. `-TAG=` with an empty value **deletes** it.
- A tag can carry a group: `-IPTC:DateCreated=`, `-XMP-xmp:CreateDate=`, `-EXIF:DateTimeOriginal=`. With no group, ExifTool picks one for you (see below).
- Values with spaces or colons must be quoted: `-CreateDate="2024:06:15 14:30:00"`.
- The file(s) come last; you can pass many.

A minimal, safe single write:

```
exiftool -overwrite_original -DateTimeOriginal="2024:06:15 14:30:00" photo.jpg
```

Global flags you'll reach for often:

| Flag                  | What it does                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `-overwrite_original` | Edit in place instead of leaving a `photo.jpg_original` backup.                                           |
| `-m`                  | Ignore _minor_ warnings so they don't abort the write (see [batching](#running-many-writes-efficiently)). |
| `-P`                  | Preserve the file's `FileModifyDate` (filesystem mtime) across the edit.                                  |
| `-wm MODE`            | Restrict to creating and/or updating (see [write modes](#write-modes--wm)).                               |
| `-@ ARGFILE`          | Read arguments from a file — the robust way around command-line length limits.                            |

## Groups and priority (EXIF > IPTC > XMP)

Many tag names are valid in more than one group (EXIF, IPTC, XMP). When you write **without** a group prefix, ExifTool:

- **creates** the tag in only the **highest-priority** group it's valid for — EXIF first, else IPTC, else XMP; and
- **updates** the tag in **every** group where it already exists.

Verified: on a fresh JPEG, `-CreateDate="2024:06:15 14:30:00"` creates only `ExifIFD:CreateDate`. It does **not** create `XMP-xmp:CreateDate`, because XMP is lower priority and the tag wasn't already there.

Two ways to put this to work:

- **Target one specific copy:** prefix the group. `-XMP-xmp:CreateDate=` writes exactly that tag (creating the XMP block if needed). Use this to force a copy into a file that lacks it, or to write to exactly one place.
- **Update a lower-priority copy only if it already exists** — a genuinely useful trick: write the **group-less** name. It creates/updates the high-priority EXIF/IPTC copy and updates the XMP copy _only when the file already has it_, without ever adding XMP to a file that lacks it:

```
-DateTimeOriginal=…   # creates EXIF; updates XMP-exif:DateTimeOriginal only if present
-DateCreated=…        # creates IPTC:DateCreated; updates XMP-photoshop:DateCreated only if present
-CreateDate=…         # creates EXIF; updates XMP-xmp:CreateDate only if present
-ModifyDate=…         # creates EXIF; updates XMP-xmp:ModifyDate only if present
```

## Write modes: `-wm`

`-wm MODE` (long form `-writeMode`) controls whether ExifTool may create tags, update them, or both. `MODE` combines any of:

| Char | Meaning                            |
| ---- | ---------------------------------- |
| `w`  | **W**rite (update) tags that exist |
| `c`  | **C**reate new tags                |
| `g`  | Create new **g**roups as needed    |

The default is `wcg` (update, create, and create groups). Useful restrictions:

- `-wm w` → only edit tags that already exist; never create anything. (This is what digiKam calls "update only existing timestamps".)
- `-wm cg` → only create missing tags/groups; never touch existing values.

**Nuance:** the "group" that `g` creates is the _SubDirectory_ block — the whole XMP or IPTC block, or an individual EXIF IFD — not a family-0 umbrella.

## Date and time values

**ExifTool reformats each date to that tag's canonical shape**, keeping only the part it needs. So you can hand the same full `YYYY:MM:DD HH:MM:SS` string to every date tag:

```
exiftool \
  -DateTimeOriginal="2024:06:15 14:30:00" \
  -CreateDate="2024:06:15 14:30:00" \
  -XMP-photoshop:DateCreated="2024:06:15 14:30:00" \
  -IPTC:DateCreated="2024:06:15 15:42:00" \
  -IPTC:TimeCreated="2024:06:15 15:42:00" \
  photo.jpg
```

| Tag                         | Stored value          | Note                              |
| --------------------------- | --------------------- | --------------------------------- |
| `IPTC:DateCreated`          | `2024-06-15`          | date-only; time dropped           |
| `IPTC:TimeCreated`          | `15:42:00+02:00`      | time-only; **local offset added** |
| `XMP-photoshop:DateCreated` | `2024-06-15T14:30:00` | ISO 8601                          |

Notice you can pass a full datetime to a date-only or time-only tag and ExifTool splits it. It never fills a tag you didn't name: `exiftool -DateCreated="2024:03:15 12:30:00" photo.jpg` writes only `IPTC:DateCreated` (the date), not `IPTC:TimeCreated`, and creates no XMP copy.

### Time zones

IPTC and XMP time tags **carry a timezone offset**. If you don't give one, ExifTool appends the **machine's local** offset (the `+02:00` above) — so the same command produces different bytes on different machines. If you want a fixed zone, say so:

```
-IPTC:TimeCreated="2024:06:15 12:00:00+00:00"   # stored 12:00:00+00:00 (UTC)
```

EXIF `DateTimeOriginal`/`CreateDate` store no offset themselves; their zone lives in separate `OffsetTime*` tags (below).

### Sub-second and offset sibling tags

An EXIF date has hidden siblings that a whole-second write does **not** touch:

- `SubSecTimeOriginal` / `SubSecTimeDigitized` / `SubSecTime` — fractional seconds
- `OffsetTimeOriginal` / `OffsetTimeDigitized` / `OffsetTime` — the EXIF timezone offset

If the file already had them, they **linger** and can shift the effective instant (a stale `+05:00`, an old `.250` fraction). When you overwrite a date and want a clean whole-second value, clear the siblings in the same command:

```
-DateTimeOriginal="2024:06:15 12:00:00" -SubSecTimeOriginal= -OffsetTimeOriginal=
```

## FileModifyDate vs embedded ModifyDate

Two things that sound alike but are unrelated:

- **`FileModifyDate`** — the **filesystem** modification timestamp. Writing it does **not** rewrite the file's contents, and it takes a timezone: `-FileModifyDate="2024:06:15 12:00:00+00:00"`. Pass `-P` on _other_ writes if you want to preserve it.
- **`ModifyDate` / `XMP-xmp:ModifyDate` / `XMP-xmp:MetadataDate`** — **metadata inside the file**. Writing these rewrites the file.

Decide which one you actually mean; they answer different questions.

## Collateral of a rewrite

Writing any tag makes ExifTool rebuild the block it lives in, and the rebuild changes two things you never asked it to:

- **`XMPToolkit`** names the tool that last wrote the XMP packet, so ExifTool stamps its own version over (say) Adobe's on every write. Assigning the previous value back keeps that provenance. The value is usually space-padded and round-trips verbatim, argfile included:

```
-XMP-x:XMPToolkit="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        "
```

- **`IPTCDigest`** is Photoshop's MD5 of the IPTC block, used to detect IPTC that changed without XMP. Rewriting IPTC leaves the stored digest describing the _old_ block, and every later read warns `IPTCDigest is not current. XMP may be out of sync`. The special value `new` recomputes it:

```
-IPTCDigest=new
```

Only refresh a digest the file already had — `new` happily **creates** the tag on a file that never carried one. Both fixes therefore need the old values read _before_ the write (see `preserveOnWrite.ts`).

`-P` is the third piece: without it every write also moves `FileModifyDate`, which is what makes backup and sync tools flag a photo whose pixels never changed. It does not fight an explicit `-FileModifyDate=` in the same command — the assignment wins. (Verified.)

## Running many writes efficiently

ExifTool's startup cost dwarfs the write itself, so one process per file is slow (especially on Windows). Two ways to batch:

- **`-execute`** separates several commands inside one process. Per-file options (`-overwrite_original`, `-wm`, tag assignments) **reset at each `-execute`**, so repeat them:

```
exiftool -overwrite_original -CreateDate="…" a.jpg -execute \
         -overwrite_original -CreateDate="…" b.jpg -execute
```

- **`-@ argfile`** reads arguments (one per line) from a file — the robust way to dodge the OS command-line length limit (~32k chars on Windows). For large batches, prefer an argfile or chunk the commands under that budget.

On errors:

- `-m` downgrades **minor** issues (IPTC value-length limits, small quirks in a file's existing metadata) so they don't abort the write. It does **not** hide hard failures — an unwritable or unsupported file still exits non-zero. (Verified.)
- ExifTool reports per-file problems as `Error: <message> - <path>` on stderr and sets a non-zero exit code. Judge success/failure from both, not from stdout text.

## GPS and place names

EXIF stores latitude and longitude as four sibling tags: two unsigned coordinate
values and two hemisphere references. Do not update only the coordinate values,
or a south/west photo may keep stale north/east references.

ExifTool 12.36+ exposes the writable `GPSPosition` composite, which updates the
four tags atomically from signed decimal degrees:

```
-GPSPosition="-33.8568, 151.2153"
```

Altitude still has a separate sign reference. Store the magnitude in
`GPSAltitude` and use `GPSAltitudeRef=1` below sea level (`0` otherwise):

```
-EXIF:GPSAltitude#=12 -EXIF:GPSAltitudeRef#=1
```

Photokin writes videos through `QuickTime:GPSCoordinates`, whose value contains
latitude, longitude and optional altitude. Removing a photo location clears the
whole EXIF GPS IFD (`-GPS:All=`); for video it clears the QuickTime coordinate
tag instead.

### Structured place text

Photokin keeps place text **structured** — a free-form spot (`Location`), `City`,
region (`State`, mirrored to the IPTC `Province-State`), and `Country` (mirrored
to `Country-PrimaryLocationName`) — and only composes a single display label for
the UI. Writes are **atomic and non-destructive**: the whole geolocation is
written together (coordinates, altitude and every place field) or cleared
together, and each field is written to the same tags it is read from. A field the
user left blank is cleared; a field they did not touch keeps its value, so a
manually entered `City`/`State`/`Country` is never silently deleted:

```
-Location="Sydney Harbour" -City=Sydney -State= -Province-State= \
-Country=Australia -Country-PrimaryLocationName=Australia -CountryCode=AU -Country-PrimaryLocationCode=AU
```

For video, the composed label is also written to `Keys:LocationName`. Removing a
photo location clears the whole EXIF GPS IFD (`-GPS:All=`) and every place tag.

#### Country code (ISO 3166-1)

Country **names** are language-dependent ("Spain"/"España"), so Photokin also
keeps a canonical `countryCode` used to group Places by country and to render a
localized name (via `Intl.DisplayNames`) plus a flag. It is **derived, never
typed**: read from `CountryCode` (XMP) / `Country-PrimaryLocationCode` (IIM) and,
since deriving from GPS is safe, backfilled from the geocoder's
`GeolocationCountryCode` even when the file embeds place text. The IIM tag is
often alpha-3 while XMP/geocoder are alpha-2, so every source is normalized to
**alpha-2** on read and written as alpha-2 to both tags. Editing the country name
by hand clears the derived code so grouping never uses a stale value.

### Reverse / forward geocoding (offline)

`-api geolocation` turns on ExifTool's bundled geonames database. On read it
generates `GeolocationCity/Region/Country/CountryCode` from a file's GPS, which
Photokin uses as a **display/index-only** fallback when the file has no embedded
place text (the alpha-2 `GeolocationCountryCode` also backfills the country code)
— it is never written back automatically. Photokin also passes
`-api GeolocFeature=-PPLX` so neighbourhoods (geonames "section of populated
place", e.g. Madrid's Embajadores) are skipped. This is still a nearest-feature
lookup, not a municipality-boundary lookup: some neighborhoods are classified
as ordinary populated places and may still be returned. The editor can, on explicit user
action, fill place fields from coordinates or vice-versa using the same offline
database with no file:

```
# coordinates -> place            # place -> coordinates
exiftool -j -api geolocation=LAT,LON -GeolocationCity -GeolocationRegion -GeolocationCountry -GeolocationCountryCode
exiftool -j -api geolocation="City,Country" -GeolocationPosition
```

### Stored place source

`assets.locationSource` describes the place text, not whether GPS coordinates
are embedded. It is recorded when data changes; opening the Location panel
never reads the file or runs the geocoder to infer a source.

- `file`: imported embedded place text, or the current place successfully written
  to the file. This means last known saved, not a continuous filesystem check.
- `auto`: GPS-derived place text that has not been written to the file.
- `manual`: user-edited place text that has not been written to the file.
- `NULL`: no place text, or legacy data whose source is not known.

The panel displays a plain "Auto" badge for `NULL`, with an unclassified-source
note. This is a display fallback only: it neither stores an inferred source nor
claims the value was read from the file or derived from GPS.

Immediate successful location writes change `manual`/`auto` to `file`. Deferred
writes leave the source alone until sync succeeds; failed writes never claim
the place was saved. Unrelated tag/rating writes do not change the place source.
Reloads replace it from file metadata or GPS; automatic rescans that keep an
existing place also keep its source. Existing databases require an explicit,
backed-up schema update and one-time audit; unknown legacy values are not
automatically classified as manual.

Spot / place is the free-form sublocation (`XMP-iptcCore:Location`), suitable for
a neighborhood, landmark or venue within a city. Embedded/user-entered values
are retained, but the nearest-feature geocoder does not populate it automatically.

## Recipes

- **Stamp a capture date on every canonical copy, without adding XMP to files that lack it:**

```
-DateTimeOriginal="2024:06:15 12:00:00" -DateCreated="2024:06:15 12:00:00" \
-IPTC:TimeCreated="2024:06:15 12:00:00+00:00" -SubSecTimeOriginal= -OffsetTimeOriginal=
```

- **Only fix files that already carry a tag (leave the rest untouched):** add `-wm w`.
- **Change the filesystem date only (no content rewrite):** `-FileModifyDate="2024:06:15 12:00:00+00:00"`.
- **Delete a tag:** `-XMP-xmp:CreateDate=`.
- **Read back what you wrote:** `exiftool -G1 -a -s -time:all photo.jpg`.

## Gotchas checklist

- [ ] Need the tag in a specific group, or in several? → prefix the group(s); group-less only _creates_ one.
- [ ] Creating tags, or only updating existing ones? → pick `-wm`.
- [ ] Rewriting file contents? → add `-overwrite_original` (and usually `-m`).
- [ ] Does the date have sub-second/offset siblings that could linger? → clear them.
- [ ] Do your time tags need a specific zone? → append the offset (`+00:00` for UTC).
- [ ] Filesystem stamp or embedded metadata? → don't conflate `FileModifyDate` and `ModifyDate`.
