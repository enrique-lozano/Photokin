# People

Photokin can find the faces in your photos, group the ones that look alike,
and help you put a name to each person. All of it runs on your computer: no
photo, face or name is ever uploaded.

![Photokin's People page](/screenshots/02-people.webp){.screenshot}

## How it works

1. **Find faces.** Photokin looks for faces in your photos.
2. **Name a few.** You tell it who some of those faces are.
3. **Recognize faces.** Photokin compares the remaining faces with the people
   you've named and suggests who they might be.
4. **Review.** You accept or correct the suggestions. The more faces you
   confirm, the better the suggestions get.

Nothing is assigned to a person without your confirmation.

## Step by step

### 1. Find faces

On the **People** page, click **Find faces**. It runs in the background (the
progress appears in the bottom-right corner), and you can stop it at any time;
the faces found so far are kept. You can also run it on just a few photos from
their menu.

### 2. Name people

Open **Unknown faces** or **Suggested faces**, click a face and type a name. To
name many at once, select several faces first. In the name box, use
<kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> to pick a person, or <kbd>H</kbd>
to hide the face.

::: info Named people also appear in Tags
A new person gets a tag such as **People → Ana**. If you choose an existing
tag when naming a face, Photokin reuses it instead. The People and Tags views
refer to the same entry, so you don't need to add the name twice.

This keeps names compatible with other photo apps.
[Learn how names and face areas are saved](#people-and-your-files).
:::

### 3. Recognize and review

Click **Recognize faces** to get suggestions for everyone you've named. Then
review them in **Suggested faces** and **Unknown faces**. When you open a group,
you can mark each face **Keep in group** or **Remove from group**, **Ignore** a
face you don't care about, or flag **Not a face** when the detector got it
wrong.

::: tip Start with the people who matter most
Name 3 to 5 clear photos of each family member first, then run **Recognize
faces**. Good reference faces make every later suggestion better.
:::

## The People sections

| Section | What you'll find |
| --- | --- |
| **All People** | Everyone you've named. |
| **Suggested faces** | Groups of faces that look like the same person, waiting for you to confirm. |
| **Unknown faces** | Faces that don't belong to anyone yet. |
| **Ignored faces** | Faces you hid, such as strangers in the background or faces on posters. You can restore or name them later. |
| **Face issues** | Appears only when something needs attention, like the same person found twice in one photo. |

## Managing people

From a person's page you can:

- **Edit details:** their name, a short bio, birth and death dates, and sex.
- **Change profile photo**, or pick any face with **Use as profile photo**.
- **Favorite** them, so they appear first on the People page.
- **Hide person** from normal views (they come back with **Show hidden items**).

If the same person ended up under two names, use **Merge people…**: all their
faces and photos move to the person you keep. **Remove person** deletes the
name together with their face areas and recognition data; the photos
themselves, and other people in them, are untouched.

### Cleaning up

**Clean up faces** hides faces that are too small or too uncertain to be useful
(for example, a crowd in the distance). Nothing is deleted: cleaned-up faces
go to **Ignored faces** and can be restored.

To remove all face information from some photos, select them and choose
**Remove face data**.

## Fine-tuning detection

The face buttons' options let you adjust how faces are found and matched:

| Setting | What it changes | Default |
| --- | --- | --- |
| **Smallest face** | How small a face can be and still be found: Tiny, Small, Medium or Large. Medium and Large are 2–3× faster and only skip small background faces. | Small |
| **Face sensitivity** | How sure Photokin must be that something is a face. Lower finds more faces, and more false ones. | 90% |
| **Required similarity** | How alike a face must be to a named person to be suggested. Higher gives fewer, safer suggestions. | 36% |
| **Reference faces per person** | How many confirmed faces of each person are used for matching. | 10 |

The **Alone**, **Group photo** and **No people** filters normally count
unconfirmed faces too. To count only faces you've confirmed, turn off **Count
unverified faces in people filters** in **Settings → General**.

## People and your files

Photokin stores named people as [tags](/guide/tags) with face areas attached.
The tag says **who** is in the photo; the face area says **where** their face
is. That's why a named person appears in both People and Tags.

This follows a common photo-metadata practice: save a person's name as a
keyword, and save their face area separately. Apps that read keywords can
still find photos by that name even if they don't understand face areas.

When you add photos, Photokin reads the face names that other apps already saved
in them, so people you named elsewhere show up right away. If you choose to
[save changes to files](/guide/metadata), confirmed people's names are written
as keywords and their face areas are written as standard regions. In
**Read only** mode, these changes stay in Photokin's library.

::: details For experts: format details
Faces are read from and written to the
[Metadata Working Group region format](https://exiftool.org/TagNames/MWG.html#Regions)
(`XMP-mwg-rs:RegionInfo`) with normalized, centered rectangles, which is the
convention used by Lightroom, digiKam, Picasa and others. Older
`RegionInfoMP` (Microsoft) regions are cleared when Photokin rewrites a file's
regions.

Confirmed names are also included in the
[keyword fields used for tags](/guide/tags#tags-in-your-files). This pairing is
Photokin's interoperability choice: the MWG region format doesn't require
apps to show people in a tag tree or to use a **People** branch.
[digiKam also organizes named faces as people tags](https://docs.digikam.org/en/left_sidebar/people_view.html).
Adding a keyword alone doesn't supply the coordinates of a face region.

Detection uses the YuNet model, and recognition uses SFace embeddings compared
by cosine similarity.
:::
