# Tags

Tags (also called _keywords_) are short labels you add to photos, like
**Birthday**, **Japan 2024** or **To print**. A photo can have as many tags as
you like, and tags work across albums: one click shows every photo with that
tag, wherever it is on your disk.

![Photokin's Tags page](/screenshots/05-tags.webp){.screenshot}

## Albums, tags or people?

|            | Answers                                 | Example                      | A photo can have |
| ---------- | --------------------------------------- | ---------------------------- | ---------------- |
| **Album**  | _Where is the file?_                    | `Pictures/2024/Holidays`     | Exactly one      |
| **Tag**    | _What is it about? Why does it matter?_ | **Japan 2024**, **To print** | Many             |
| **Person** | _Who is in it?_                         | **Ana**                      | Many             |

Keep folders simple (by year or event, say) and let tags do the rest.

::: info Why are people in Tags too?
When you name a face, Photokin creates or reuses a tag for that person. For
example, a new person named **Ana** also appears as **People → Ana** in Tags.
These are two views of the same entry, not duplicate people: you don't need to
tag the photo with their name again.

This helps names travel with your photos: they can be saved as keywords that
other apps understand, alongside separate face areas. Adding an ordinary tag
by hand doesn't create or confirm a face. See
[People and your files](/guide/people#people-and-your-files) for details.
:::

## Do you need to tag everything?

**No.** Photokin's [smart search](/guide/search) already understands what is
_visible_ in a photo. Typing "plane", "beach", "landscape", "dog in the snow" or
"red car" finds those photos without a single tag. Tagging obvious things takes
a lot of time and rarely adds much.

Spend your tagging time on what a computer **can't see**:

- **Events and stories:** _Ana's wedding_, _First day of school_, _Grandpa's 80th_
- **Trips and periods:** _Japan 2024_, _Erasmus year_
- **Projects and work:** _Client: Studio Nova_, _Book cover ideas_
- **Your own judgment:** _Best of 2024_, _To print_, _Family album_
- **Context that isn't in the frame:** _Our first house_, _Taken by Dad_

Of course, you can still tag visible subjects when it helps you. For example,
if you need the keyword to appear in other apps, or you want a precise,
curated list (every photo of _your_ cat, not every cat).

::: tip Let Photokin keep the rest
There's no need to tag dates, places or people either: the timeline and
calendar know _when_, Places knows _where_ (from the photo's location), and
People knows _who_.
:::

## Building a good tag tree

Tags can be nested: **Trips → Japan 2024** is the tag **Japan 2024** inside
**Trips**. A small, consistent tree is much easier to use than a long flat list.

**Keep few top-level branches.** Five to eight is plenty, for example:

```text
Events
├── Birthdays
├── Christmas
└── Weddings
Trips
├── Japan 2024
└── Norway 2022
Animals
├── Cat
└── Dog
Workflow
├── Best of
└── To print
```

**Give each idea one home.** It's tempting to build branches that repeat the
same tags in different places:

::: warning Not recommended: repeating the same subject
```text
Animals
├── Pets
│   └── Cat
├── Wild animals
│   └── Cat
└── Zoo animals
    └── Cat
```

Three different **Cat** tags make it hard to know which one a photo has, and
easy to miss photos when you search.
:::

::: tip Recommended: one subject, separate context
Keep one **Cat** tag and describe the situation with a separate tag:

```text
Animals
├── Cat
└── Dog
Settings
├── Wild
└── Zoo
```

A cat at the zoo gets **Cat** + **Zoo**. Combining small tags is more flexible
than one long, specific tag.
:::

**Be consistent.** Pick one language, and one style for capitals and plurals
(**Dog**, not a mix of _dog_, _Dogs_ and _Perro_). [Merge](#managing-tags)
duplicates when you find them.

**Name tags so they make sense on their own.** **2024** says little by itself;
**Japan 2024** does.

## Tagging photos

1. Select one or more photos.
2. Press <kbd>Ctrl</kbd>+<kbd>T</kbd> (or choose **Add or edit tags…**).
3. In **Edit tags**, tick the tags you want. If only some of the selected photos
   have a tag, its box is half-filled; click it to add the tag to all of them,
   or click again to remove it from all.
4. To create a new tag, type it in **Add a tag**. Use a slash for nested
   tags: `Trips/Japan 2024` creates **Japan 2024** inside **Trips**, reusing
   **Trips** if it already exists.

**Remove all tags** in the selection menu clears every tag from the selected
photos.

## Managing tags

On the **Tags** page and in its sidebar you can:

- **New tag:** create a tag before using it. The same `Parent/Child` syntax works
  here.
- **Move:** drag a tag onto another one in the sidebar to nest it there. All
  its nested tags move with it.
- **Edit tag:** rename it, or give a top-level tag a color. Nested tags share
  their top-level tag's color, which makes each branch easy to spot.
- **Favorite:** favorite tags appear as large cards at the top of the Tags page.
- **Merge tags:** combine duplicates (_Dog_, _Dogs_, _dog_). Every photo gets the
  tag you keep, and nested tags move under it.
- **Delete tag:** removes the tag from all its photos. The photos themselves
  aren't touched.
- **Remove unused tags:** deletes every tag that no photo uses.

Open a tag to see its photos. Turn on **Include subtags** to also see the
photos of every tag nested inside it (for example, all of **Trips**).

## Searching by tag

Click a tag, or type it in the search bar:

- `tag:"Japan 2024"`: photos with that tag
- `tag:"Trips/Japan 2024"`: use the full path when two tags share a name
- `tag_count=0`: photos that have no tags yet, handy for catching up

See [Search](/guide/search) for more.

## Tags in your files

If you choose to [save changes to your photo files](/guide/metadata), tags are
written into each photo in the formats that other photo apps read, so your tags
keep working in Lightroom, digiKam, Windows Explorer and many others. When you
add photos that already have keywords, Photokin reads them and rebuilds the
tree automatically.

::: details For experts: which fields are read and written
**Read on import** (merged and de-duplicated, highest priority first):

1. `XMP-lr:HierarchicalSubject` (Lightroom, `|`-separated paths)
2. `XMP-microsoft:LastKeywordXMP` (Windows, `/`-separated paths)
3. `IPTC:Keywords` (flat)
4. `XMP-mediapro:CatalogSets` (`|`-separated paths)
5. `XMP-digiKam:TagsList` (`/`-separated paths)
6. `XMP-dc:Subject` (flat)
7. `EXIF:XPKeywords` (Windows, one `;`-joined string)

**Written on save:** all of the above, each in its own convention: full
paths in the hierarchical fields, leaf names only in the flat ones
(`IPTC:Keywords`, `XMP-dc:Subject`, `XPKeywords`). Paths are also written to
ACDSee's `Categories`, which Photokin doesn't read back.

Confirmed people's names are included in these keyword fields too, and their
face areas are written separately as MWG regions. See
[People](/guide/people#people-and-your-files).
:::
