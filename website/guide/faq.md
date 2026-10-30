# FAQ and troubleshooting

## General

### Does Photokin copy or move my photos?

No. Photokin reads your photos where they are. They're only moved or changed
when you ask for it (moving, renaming, rotating, editing or deleting). See
[Your library](/guide/library).

### Is it really free?

Yes. Photokin is free and open-source software under the AGPL-3.0 license, with
no subscription and no ads. If it's useful to you, you can support it from
**Settings → About**.

### Does it work on Linux or Intel Macs?

Not yet. Photokin is currently available for Windows 10/11 (64-bit) and Macs
with Apple silicon.

### Does it support RAW files?

Not yet. Photokin supports JPEG, PNG, WebP, HEIC/HEIF, AVIF, TIFF, GIF, BMP and
common video formats. RAW files are skipped when you add a folder.

### Can I use the same library on two computers?

Photokin's library is meant for one computer. Your photos and any metadata
written into them work everywhere, but the library itself isn't synced.

## Installing

### Windows says "Windows protected your PC"

Photokin isn't code-signed yet. Click **More info**, then **Run anyway**.

### macOS won't open Photokin

Photokin isn't notarized by Apple yet. See
[Install on macOS](/guide/getting-started#macos).

### Photokin says ExifTool is missing

ExifTool reads and writes the details inside your photos. On Windows, use
**Install automatically** in **Settings → System**. On macOS, install it from
[exiftool.org](https://exiftool.org/) or with `brew install exiftool`, then use
**Locate manually** if needed. Restart Photokin afterwards.

## Using Photokin

### My photos show the wrong date

Some photos have no capture date (screenshots, messaging apps, scans), or the
camera's clock was wrong. Select them and use **Edit date & time…**
(<kbd>Ctrl</kbd>+<kbd>D</kbd>). You can set a date, shift by an amount, or read
the date from the file name.

### Some photos aren't in Places

Only photos with a location appear in **Places**. Add one with
**Edit location…** (<kbd>Ctrl</kbd>+<kbd>G</kbd>).

### Smart search doesn't find anything

- Check that a model is downloaded in **Settings → System → Smart search**.
- Wait until **Indexing for search** finishes; photos are searchable once
  they're indexed.
- Try describing what's *visible*, in the language of your model. See
  [Search tips](/guide/search#tips-for-better-results).

### Faces aren't being found

Run **Find faces** on the People page first; recognition only works on faces
that have been found. For small faces in group photos, set **Smallest face** to
**Tiny**, or lower **Face sensitivity**. See
[Fine-tuning detection](/guide/people#fine-tuning-detection).

### My tags don't show up in Lightroom or other apps

Edits are only written into files when your write mode is **Sync to files**.
Check **Settings → Metadata**, then use **Write metadata to files…** on the
photos edited before you switched. With **On manual sync**, changes are written
the next time you sync.

### I edited photos in another app, and Photokin doesn't show the change

Sync the library (footer → **Sync now**). If you edit photos elsewhere often,
set **What counts as a change** to **Modified time** in **Settings → Library**,
or use **Reload metadata** on the album.

### I deleted a photo by mistake

Open **Trash** from the Albums page and restore it. Items stay there for 30
days.

### How do I start over?

**Settings → System → Remove all data** deletes the library and thumbnails, and
optionally downloaded search models. Your photos are never touched.

## Getting help

- Search or open an issue on
  [GitHub](https://github.com/enrique-lozano/Photokin/issues).
- When attaching photos, use ones you're happy to share; files can contain GPS
  coordinates and names. See [Privacy](/guide/privacy#sharing-photos-in-bug-reports).
