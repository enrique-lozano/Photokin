# Browsing and viewing

The sidebar has a page for each way of looking at your library: **Albums**,
**Tags**, **People**, **Places**, **Calendar**, **Stats** and **Duplicates**.

## The timeline

Inside an album, tag or person, photos appear as a timeline grouped by date.
In **Settings → General → Timeline** you can:

- **Group photos by** day, month or year.
- **Show photo count per group** and **Show location per group** in each
  group's heading.

Use the slider in the footer to make thumbnails bigger or smaller.

## Calendar, Places and Stats

- **Calendar** shows every month at a glance, so you can see which days you
  took photos and jump straight to them.
- **Places** groups every photo that has a location by country and place
  (city or town), so you can browse trip by trip. Open **Map** at the bottom of
  the sidebar to explore your library geographically. Selecting a place frames
  it on the map. Moving or zooming the map doesn't change the gallery: choose
  **View photos in this area** to replace the place selection with **Map area**.
  This button appears over the map after you move or zoom it; map controls fade
  out while navigating. **Expand map** opens a full-size modal and preserves
  your position when you close it. Close the modal to apply the visible area
  from the sidebar map.
  The gallery keeps that area until you apply another area or select a place,
  even if you close the map. Library filters still apply. Click a group of photos
  to zoom in, or a single photo to open it.
  Switch between the **Standard map** and the **Satellite map** with the button
  in its corner. Only photos with GPS coordinates appear on the map.
  Photos without a location aren't shown here; you can add one with
  [Edit location](#editing-several-photos-at-once).
- **Stats** summarizes your library: shooting activity per month, the cameras
  and lenses you use most, typical ISO, aperture, shutter speed and focal length,
  ratings, and how much of your library has each kind of metadata.

![Photokin's Places page](/screenshots/04-places.webp){.screenshot}

## Filtering

Open **Library filters** in the toolbar to narrow what you see by date, rating
or favorites, people (including "alone" and "group" photos), place, camera and
lens, description, date added and exposure settings. Active filters appear as
chips above the photos; remove one with its ✕, or use **Clear all**.

You can also type filters in the search bar, like `rating>=4` or
`year=2023`. See [Search](/guide/search).

## Selecting photos

Hover a photo and click the circle in its corner to start selecting. While
selecting, a click adds or removes photos, and the circle next to a date
heading selects that whole group. The selection bar at the top shows how many
photos are selected and offers **Select all**.

### Editing several photos at once

Right-click a selection, or use the selection bar's menu, to act on every
selected photo:

| Action                                            | Shortcut                     |
| ------------------------------------------------- | ---------------------------- |
| **Add or edit tags…**                             | <kbd>Ctrl</kbd>+<kbd>T</kbd> |
| **Favorite** / **Unfavorite** (in Favorites mode) | <kbd>F</kbd>                 |
| **Edit date & time…**                             | <kbd>Ctrl</kbd>+<kbd>D</kbd> |
| **Edit location…**                                | <kbd>Ctrl</kbd>+<kbd>G</kbd> |
| **Move to folder…**                               | <kbd>Ctrl</kbd>+<kbd>M</kbd> |
| **Move _n_ photos to Trash**                      | <kbd>Delete</kbd>            |

The same menu has **Compare photos** (for exactly two photos), rotation, face
actions, **Rename…** and **Edit photo…** (for a single photo), and **Reload
metadata from files…** / **Write metadata to files…**. On a Mac, use
<kbd>⌘</kbd> instead of <kbd>Ctrl</kbd>.

## The viewer

Click a photo to open it full size.

| Key                       | Action                      |
| ------------------------- | --------------------------- |
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next photo       |
| <kbd>+</kbd> <kbd>-</kbd> | Zoom in / out (up to 400%)  |
| <kbd>I</kbd>              | Show or hide the info panel |
| <kbd>Esc</kbd>            | Close the viewer            |

By default the mouse wheel moves to the next photo and <kbd>Ctrl</kbd>+wheel
zooms. To make the wheel zoom instead, change **Mouse wheel** in
**Settings → Viewer**.

![Photokin's viewer with the info panel open](/screenshots/06-viewer.webp){.screenshot}

### The info panel

Press <kbd>I</kbd> to see a photo's details: its title and description, when
and where it was taken, the camera and settings used, file information, and the
people in it. You can edit the date, location and description from here, and
rename the file.

::: details For experts: the raw metadata
The **All metadata** tab lists every tag ExifTool reads from the file, grouped
by standard (EXIF, IPTC, XMP…), with **Copy all metadata** and **Export
metadata as JSON**. Values that come from the file are marked, for example a
location shows **Saved in file**, and a chip shows whether your edits stay in
the library or are saved to files. See [Photo metadata](/guide/metadata).
:::

### Videos

Videos play in the viewer. **Settings → Viewer → Video** controls **Auto play**
and **Loop**.

### Opening photos in another app

Each photo's menu has **Open in default app**. To always use a specific program
(for example, your favorite editor), choose it in
**Settings → Viewer → Open in another app** for photos and videos separately.
