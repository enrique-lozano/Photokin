# Install and first steps

## Download

Get the latest version from the
[releases page](https://github.com/enrique-lozano/Photokin/releases/latest):

| Your computer | Download |
| --- | --- |
| Windows 10 or 11 (64-bit) | The `.exe` installer |
| Mac with Apple silicon (M1 or newer) | The `.dmg` file |

Linux and Intel Macs aren't available yet.

### Windows

Run the installer. Photokin isn't code-signed yet, so Windows may show
**"Windows protected your PC"**. Click **More info**, then **Run anyway**.

### macOS

Open the `.dmg` and drag Photokin to **Applications**. Because the app isn't
notarized by Apple yet, macOS blocks it the first time:

1. Try to open Photokin once, and close the warning.
2. Open **System Settings → Privacy & Security**.
3. Scroll down and click **Open Anyway** next to the Photokin message.

::: details macOS says the app "is damaged and can't be opened"
That message is also caused by the missing notarization, not by a broken
download. In Terminal, run:

```sh
xattr -dr com.apple.quarantine /Applications/Photokin.app
```

Then open Photokin again.
:::

## First launch

A short setup runs the first time you open Photokin.

### 1. ExifTool

Photokin uses the free tool [ExifTool](https://exiftool.org/) to read and edit
the details stored inside your photos: tags, ratings, locations and more.

- **Windows:** click **Install automatically**.
- **macOS:** install ExifTool from [exiftool.org](https://exiftool.org/) (or with
  Homebrew: `brew install exiftool`), then click **Locate manually** if Photokin
  doesn't find it.

You can browse photos without ExifTool, but dates, tags, places and other
details won't be read or written. You can install it later from
**Settings → System**.

### 2. Where should metadata changes be saved?

- **Library only** (recommended to start): your tags, ratings and other changes
  stay in Photokin's library. Your photo files are never touched by these edits.
- **Library and photo files:** Photokin also writes those changes into each
  photo, so other apps can see them.

Pick **Library only** if you're trying Photokin out or don't have a backup yet.
You can switch any time in **Settings → Metadata**.
[Learn more about metadata](/guide/metadata).

### 3. Smart search (optional)

Download a search model to find photos by what's in them, like *"sunset at the
beach"*. Choose **English** or **Multilingual**, then pick a model. It downloads
in the background while you start using Photokin.

Choose **Skip** to use only name and tag search; you can add a model later. See
[which model to choose](/guide/search#choosing-a-search-model).

## Add your photos

1. Go to **Albums** and choose **Add albums**.
2. Click **Select folders** and pick one or more folders. Subfolders are included.
3. Check the summary (how many files will be added, and how many unsupported
   files will be skipped), then click **Add albums**.

Photokin indexes the photos **where they are**: nothing is copied or moved. The
first import reads every file's details and creates thumbnails, which can take
a while for large collections. You can keep browsing meanwhile; progress appears
in the bottom-right corner.

::: tip Start small
Add one folder first, look around, and add the rest once you're comfortable.
:::

## What's next

- [Find the people in your photos](/guide/people)
- [Search your library](/guide/search)
- [Keep the library in sync with your folders](/guide/library#keeping-in-sync)

## Updates

Photokin checks for a new version when it starts. When one is available, it
offers to install it and restart. You can check manually, or turn the automatic
check off, in **Settings → About**.
