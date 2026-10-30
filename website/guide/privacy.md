# Privacy and photo safety

## What stays on your computer

Everything that makes up your library:

- The photos and videos themselves, in your own folders.
- Photokin's library: dates, tags, ratings, people, faces, places and settings.
- Thumbnails, previews and the smart search index.
- Downloaded search models.

Face recognition and smart search run **on your computer**. Photokin has no
account, no cloud library, no analytics, and doesn't send crash reports.

::: warning Protect your computer
Photokin doesn't encrypt its library. Faces, names and locations are personal
information, so protect your computer, your user account and your backups.
:::

## When Photokin goes online

A few features need the internet. This is the complete list:

| Feature | Connects to | What it reveals |
| --- | --- | --- |
| Standard map | OpenStreetMap | The map area you're viewing |
| Satellite map | Esri / ArcGIS | The map area you're viewing |
| Elevation lookup | Open-Meteo | The coordinates being looked up |
| Downloading a search model | Hugging Face | Which model you downloaded |
| Installing ExifTool (Windows) | exiftool.org, SourceForge | That you downloaded ExifTool |
| Update check and download | GitHub | That you're checking for a new version |

Every connection also shares the usual technical details, such as your IP
address. No photos, faces or search terms are ever sent. You can turn off the
update check in **Settings → About**.

::: tip Sensitive locations
Map tiles reveal the area you're looking at. If a place is private, avoid
opening it on the map.
:::

## Keeping your photos safe

Photokin is careful with your files, but no app is a substitute for backups.

- **Keep a backup** of your photos, ideally in two places. Photokin's Trash is
  not a backup.
- **Start with copies** while you're trying Photokin, or with your metadata
  setting on **Read only**.
- **Test before writing to files.** Before switching to
  [Sync to files](/guide/metadata), try it on a few copies of each format you
  use.
- **Save edits as copies** until you're happy with the result.

### What can change your files

| Action | Effect on your files |
| --- | --- |
| Browsing and adding folders | None. Photokin only reads them. |
| Tags, ratings, descriptions… in **Read only** mode | None. Saved in the library only. |
| The same edits in **Sync to files** mode | Written into the files. |
| Rotate, rename, move | Changes the files and folders. |
| Saving from the editor | Creates a copy, or replaces the original if you choose **Overwrite**. |
| Move to Trash | Moves the file to Photokin's Trash. |
| Empty Trash / delete permanently | Deletes the files. This can't be undone. |
| Remove all data (Settings) | Deletes the library and thumbnails; your photos are untouched. |

### Backing up your library

Tags, people and other edits made in **Read only** mode live only in
Photokin's library. To keep them, also back up the library database (its
location is in **Settings → System → Storage**). Close Photokin first, so the
copy is complete.

## Sharing photos in bug reports

Photos can contain hidden details: GPS coordinates, names and face areas.
Blurring a screenshot doesn't remove them from an attached file. When reporting
a problem, use photos you're comfortable sharing, or copies with the metadata
removed.

The full [privacy notice](https://github.com/enrique-lozano/Photokin/blob/main/docs/PRIVACY_POLICY.md)
has the formal details.
