# Photo metadata

**Metadata** is the information stored *inside* a photo file, next to the
image itself: when and where it was taken, which camera was used, and
optionally its tags, rating, description and the names of the people in it.
Because it lives in the file, it travels with the photo to other apps,
computers and backups.

You don't need to understand metadata to use Photokin. This page explains what
Photokin does with it, so you can decide how much it should touch your files.

## What Photokin reads

When you add photos, Photokin reads everything it can use: dates, locations,
camera details, ratings, titles, descriptions, tags and people. Photos you've
already organized in other apps arrive with that work intact.

## Where your changes are saved

When you tag, rate, describe, move a date or add a location in Photokin, the
change can be saved in one of two ways. You chose one during setup; change it
any time in **Settings → Metadata → Write mode**.

| | **Read only** ("Library only" during setup) | **Sync to files** ("Library and photo files") |
| --- | --- | --- |
| Where edits go | Photokin's library only | The library **and** the photo files |
| Other apps see your edits | No | Yes |
| Your files are changed by these edits | Never | Yes |
| Good for | Trying Photokin, or if you don't have a backup yet | Everyday use, once your photos are backed up |

::: tip Start with Read only
Use **Read only** while you get to know Photokin. When you switch to
**Sync to files** later, use **Write metadata to files…** on an album or a
selection to save your earlier edits into the files.
:::

### When to write

With **Sync to files**, **When to write** decides the timing:

- **Immediately:** each change is written as soon as you make it.
- **On manual sync:** changes are collected and written all at once the next
  time you sync the library. This is handy if you edit a lot and want to review
  first, or if your photos live on a slow or network drive.

### Related settings

- **Keep "Date modified" when writing** keeps the file's modification date
  unchanged after Photokin writes metadata, so backup and sync tools don't
  upload photos again just because they were re-tagged.
- **Save favorites as 5 stars** (in favorites mode) also writes a 5-star rating
  into the file when you favorite a photo. When off, hearts stay in Photokin.

## Some actions always change your files

Whatever the write mode, these actions work on the real files, because that's
what they're for:

- **Rotating** a photo, and **renaming** or **moving** files and albums.
- **Saving an edit** from the editor (as a copy, or replacing the original).
- **Move to Trash**, and emptying the Trash.

## Dates and places

- **Edit date & time…** (<kbd>Ctrl</kbd>+<kbd>D</kbd>) fixes wrong dates, for
  example from a camera whose clock was off, on one or many photos at once. It
  can shift all of them by the same amount, or read the date from file names
  like `IMG_20220701_113932.jpg`.
- **Edit location…** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) adds or corrects where a
  photo was taken, as coordinates and place names (city, region, country).
  Place names for coordinates are looked up offline, on your computer.

## For experts

### Standards and fields

Photokin reads and writes metadata through
[ExifTool](https://exiftool.org/), using the EXIF, IPTC and XMP standards.
With **Sync to files**, it can write:

| What | Main fields |
| --- | --- |
| Tags | `XMP-lr:HierarchicalSubject`, `XMP-digiKam:TagsList`, `XMP-microsoft:LastKeywordXMP`, `XMP-mediapro:CatalogSets`, `IPTC:Keywords`, `XMP-dc:Subject`, `EXIF:XPKeywords` ([details](/guide/tags#tags-in-your-files)) |
| People | Names in the same keyword fields as tags, plus `XMP-mwg-rs:RegionInfo` for confirmed named face regions ([why people also appear in Tags](/guide/people#people-and-your-files)) |
| Rating | `Rating` (0–5) |
| Title and description | Title and description/caption fields |
| Capture date | `DateTimeOriginal` and related date fields |
| Location | GPS coordinates and altitude, plus sublocation, city, state/province, country and country code |
| Credits | Creator, copyright, credit and source |

Photokin also reads, but doesn't write, technical values (dimensions,
duration, color space…) and place names derived offline from GPS coordinates.

### Formats

What can be written depends on the file format and on ExifTool's support for
it; not every format can store every field. Face areas are never written to
videos. Test with a few copies of your usual formats before turning on
**Sync to files** for your whole library.

### Re-reading files

If you change files with another app, a [sync](/guide/library#keeping-in-sync)
picks up the changes according to **What counts as a change**. To force it, use
**Reload metadata** on an album, or **Reload metadata from files…** on a
selection. This re-reads every file, including unchanged ones.
