# Photo safety

Photokin is young software. Start with copies and keep independent backups of
irreplaceable photos. A local library or app-managed Trash is not a backup.

## Understand what an action changes

| Action                                                                   | Effect                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse/index photos                                                      | Reads files and stores library records and generated previews/thumbnails locally.                                                                                       |
| Edit tags, ratings, or other supported metadata in **Library only** mode | Stores those edits in Photokin's database rather than writing them back to the photo. This is the default metadata mode.                                                |
| Enable **Library and photo files**                                       | Allows supported metadata edits to be written into originals. Write-back timing can be on sync or immediate; the default timing is on sync.                             |
| Save from the photo editor                                               | Can create an edited copy or explicitly replace a supported original. This is separate from metadata write-back mode.                                                   |
| Move to Trash                                                            | Moves the actual photo/video into Photokin's local app-managed Trash, not the OS recycle bin.                                                                           |
| Permanently delete / empty Trash                                         | Deletes the files, not just their library entries.                                                                                                                      |
| Clear thumbnail cache                                                    | Removes generated thumbnails, which can be regenerated.                                                                                                                 |
| Remove library data                                                      | Removes the library database and generated thumbnail/duplicate caches, optionally downloaded search models. It does not delete original photos in their source folders. |

**"Library only" is a metadata setting, not a filesystem write lock.** It does
not prevent explicit editor saves, moves, or deletions.

## Before enabling file metadata writes

Make a backup and try representative formats first. Embedded EXIF/IPTC/XMP data
can contain names, GPS coordinates, and face regions. Not every format supports
the same fields, and other tools may interpret them differently.

The **Preserve file modification time** option controls filesystem timestamps;
it is not a backup or a guarantee that file bytes remain unchanged.

## Before saving an edited photo

Prefer saving a new copy until you have checked the result. The editor supports
JPEG, PNG, and WebP outputs. Replacing an original is restricted to supported
source formats without a format change; other sources use a generated preview
and can only be saved as a JPEG copy.

The editor currently rejects photos with XMP sidecars. Metadata warnings can also
cause a save to be rejected rather than risk an unsafe result. These checks are
not a universal guarantee of lossless metadata preservation.

## Trash and library resets

Photokin keeps trashed files in its own app-data folder and can restore them while
their records remain available. It does not overwrite an existing file at the
restore destination.

Trashed items older than **30 days** are eligible for permanent deletion during
startup cleanup. Emptying Trash or deleting an item permanently is not undoable
within Photokin. Restore needed items before resetting the library: a reset
removes the database records used to manage them.

## Backups and support samples

Back up both your photo folders and the library data if you need to preserve
library-only edits. Close the app before copying the database for a consistent
offline backup, and keep that backup private.

Use disposable, sanitized files for bug reports. Removing visible names from a
screenshot does not remove embedded metadata from an attached photo.
See [contribution guidance](../CONTRIBUTING.md#share-photo-related-information-safely)
and [Privacy and network access](PRIVACY_POLICY.md).
