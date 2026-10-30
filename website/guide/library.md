# Your library

Your **library** is the list of folders Photokin knows about, plus everything
it has learned about the photos in them: dates, places, tags, people and
thumbnails.

## Albums are your folders

Each folder you add becomes an **album**, and its subfolders become nested
albums. Photokin never copies your photos into a library of its own: it reads
them where they are, so your folders keep working with your file manager,
backup tools and other apps.

To add folders, go to **Albums → Add albums**. You can add several folders at
once, but not a folder that is already inside one you added (or that contains
one).

### Supported files

| Type | Formats |
| --- | --- |
| Photos | JPEG, PNG, WebP, HEIC/HEIF, AVIF, TIFF, GIF, BMP, SVG, ICO |
| Videos | MP4, WebM, OGG/OGV |

Other files are skipped and reported before you confirm. Camera RAW files
(CR2, NEF, ARW, DNG…) aren't supported yet.

## Keeping in sync

When you add, rename or delete photos with another app, Photokin catches up
the next time it syncs:

- **Sync now:** click the sync status in the footer, or go to
  **Settings → Library → Sync library**. To check a single album, open its menu
  and choose **Sync this album**.
- **Scan folders at startup:** turn this on in **Settings → Library** to check
  your folders every time Photokin opens.

Folders on a disconnected drive are left unchanged. Their photos aren't treated
as deleted, and they come back when you reconnect the drive.

### What counts as a change

New, renamed and deleted photos are always detected. For photos you edit in
another app (for example, adding a keyword in Lightroom), choose how careful a
manual sync should be in **Settings → Library**:

| Option | When to use it |
| --- | --- |
| **New & removed only** | You organize only in Photokin. Your Photokin edits are never replaced. |
| **Modified time** | You also edit photos in other apps; Photokin re-reads a file when its "Date modified" changes. |
| **Modified time + File size** | The most thorough check, for when you edit photos in other apps often. |

## Hiding, removing and deleting

These three actions sound alike but do very different things:

| Action | What happens | Your files |
| --- | --- | --- |
| **Hide album** | The album disappears from normal views. Turn on **Show hidden items** to see it again. | Untouched |
| **Remove Album Folder** | Photokin forgets the folder and everything it learned about it. | Untouched |
| **Move to Trash** | The photo moves to Photokin's **Trash**, where you can restore it. Items are deleted for good after 30 days, or when you empty the Trash. | Moved, then deleted |

::: warning Trash is Photokin's own
Photokin's Trash is separate from the Windows Recycle Bin or macOS Trash. Once
an item is deleted from Photokin's Trash, it's gone.
:::

## Moving and renaming

You can move photos or whole albums to another folder, and rename files, from
Photokin. These actions change the real files and folders on your disk, exactly
as if you did it in your file manager, and Photokin keeps your tags, people and
other details attached.

## Where Photokin keeps its data

**Settings → System → Storage** shows where the library database and the
thumbnail cache live, and how much space they use. From there you can:

- **Clear the thumbnail cache.** Thumbnails are recreated as you browse.
- **Remove all data** (in **Danger zone**). This deletes the library database
  and thumbnails, and can also delete downloaded search models. Your photos and
  videos are never touched.

::: details For experts: what's stored where
The library is a SQLite database in the app's local data folder, next to the
thumbnail cache and downloaded search models. It holds the indexed file
details, tags, ratings, face regions, places and settings that belong to the
library. It isn't encrypted, so protect it like any other personal data. See
[Privacy and photo safety](/guide/privacy).
:::
