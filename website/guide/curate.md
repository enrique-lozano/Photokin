# Favorites, duplicates and edits

## Favorites or stars

Choose how you mark your best photos in **Settings → General → Ratings**:

- **Favorites:** a single heart. Press <kbd>F</kbd> to favorite or unfavorite
  the selected photos.
- **1–5 stars:** finer ratings for sorting and filtering.

You can switch at any time without losing anything: a favorite is stored as a
5-star rating, so it shows as 5 stars in stars mode, and photos rated 5 stars
become favorites in favorites mode.

Filter by rating in **Library filters**, or with `rating>=4` or the word
`favorites` in the search bar.

::: details For experts: ratings in files
Ratings use the standard `Rating` field (0–5) that Lightroom, Windows and most
photo apps read. In favorites mode, hearts stay in Photokin's library unless you
turn on **Save favorites as 5 stars** in **Settings → Metadata**.
:::

## Duplicates

The **Duplicates** page finds photos you have more than once and helps you
free up space without losing anything important.

1. Click **Scan for duplicates**. You can limit the scan to some albums.
2. Photokin groups the results into sets of three kinds:
   - **Exact:** byte-for-byte identical files, for example the same photo
     copied to two folders.
   - **Similar:** photos that look the same but differ in size, format or small
     edits.
   - **Bursts:** several shots taken within moments of each other.
3. Open a set. Each photo is marked **Keep** or **Remove**; click a photo to
   change it. A **keep rule** decides the starting choice: **Highest
   resolution**, **Largest file**, **Smallest file**, **Newest**, **Oldest** or
   **Manual**. For bursts you can also choose **Keep all frames**.
4. Click **Remove** to move the photos marked for removal to Photokin's
   [Trash](/guide/library#hiding-removing-and-deleting). You can restore them
   from there for 30 days.

If a set isn't really a duplicate, choose **Not duplicates**. It won't be
suggested again, and you can bring it back from **Ignored**.

::: tip Compare any two photos
Select two photos anywhere in Photokin and choose **Compare photos** to see them
side by side.
:::

## Editing photos

For quick fixes, select a photo and choose **Edit photo…**. The editor offers:

- **Crop**, with free or fixed proportions.
- **Rotate and flip** (horizontally or vertically).
- **Resize**, smaller only. Photokin won't enlarge a photo beyond its crop.
- **File format** and **Photo quality** when saving.
- **Compare with original** to check your changes.

### Saving

- **Save as copy** (the default) creates a new file next to the original and
  adds it to the album. The original stays as it was.
- **Overwrite** replaces the original file. This **can't be undone**, so only
  use it when you have a backup. It's available only when the photo can be
  safely rewritten in the same format.

Camera, date, location, keywords and color profile are copied to the edited
photo where the format allows, and face areas are adjusted to the new crop.

::: warning Rotating changes the file
Rotating a photo from the selection menu updates the original file (its
orientation), whatever your [metadata setting](/guide/metadata) is. The same
goes for renaming and moving.
:::

For anything more advanced, use **Open in default app**, or choose your
favorite editor in **Settings → Viewer → Open in another app**.
