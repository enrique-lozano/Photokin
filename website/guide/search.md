# Search

The search bar at the top of Photokin understands two kinds of input, and you
can mix them freely:

- **Plain words**, like `dog on the beach` or `birthday cake`, find photos by
  what's in them, using smart search.
- **Filters**, like `rating>=4` or `person:Ana`, narrow results precisely.

`person:Ana beach rating>=4` finds Ana's best beach photos.

## Editing a search

Click the search bar to choose a filter, or just describe a photo. Suggestions
follow where you're editing: choose **Person** to insert `person:`, then choose
a name. Clicking inside an existing filter lets you replace its value without
changing the rest of your search. Values with spaces or special characters are
quoted automatically.

- **Enter** applies your search. Typing, choosing a
  suggestion and clearing the field only edit the draft; results do not change
  until you submit.
- **Up/Down** highlights a suggestion. **Enter** or **Tab** accepts a highlighted
  suggestion instead of submitting. Press Enter again to search.
- **Escape** closes suggestions without changing the draft. Down reopens them.
- **More filters** shows dates, cameras, locations and the other available fields.
- Filter suggestions use icons and compact labels; hover for syntax and field
  details. Person and tag values show their full paths below the name.
- Recognized filter values have a subtle accent color in the search
  field. Free text and invalid or unfinished filters keep the normal text style.
  This is highlighting, not chips: you can still edit and copy the whole query.
- Operator buttons appear above values and mark the current choice. After choosing
  a field, type an operator to replace the automatic `:` without moving back:
  choose Rating, type `>` then `=`, and enter `4` for `rating>=4`.
- With smart search available, focusing an empty field shows gently rotating
  description examples that roll upward and an explanation that AI search runs on your device.
  Examples are hints, not inserted text. They stop when you type or leave the
  field; reduced-motion preferences disable rotation. Without a downloaded
  model, the dropdown offers **Enable smart search** instead.
- Back/forward restores the submitted search. Drafts do not survive navigation.

### Recent searches

Focus an empty field to see your three most recent searches above filter
suggestions. As you type, up to three recent queries containing your draft text
are shown, ignoring capitalization and ordered newest first. Select one to
restore it as a draft, then press **Enter** to run it.
The dropdown never runs a search just because you selected a suggestion.

Photokin keeps up to 20 submitted, non-empty queries on this device, including
across restarts. Repeating a query moves it to the top without duplicating it.
Typing alone does not save history. Use the **×** beside a recent query to remove
it, or **Clear history** to remove all saved queries.

History saves query text only. Running a recent query uses your current library
filters, not the library filters from the original search.

Recognized filters appear in a subtle, initially collapsed card above the results.
Choose the **detected filters** count and caret on the right to reveal the labeled
icon chips and **Add as library filters** action. Choose
the **About these filters** info button beside the label for details about how
filters combine and what assigned tags and detected faces mean. Search warnings
remain visible above the results. Choose **Add as library filters** inside the
expanded card to apply those filters across library views
that support filtering. This keeps existing library filters and leaves your search
text unchanged; plain words are not added as filters. The **Library filters**
banner shows each active filter with its icon. Remove one with its **×** button,
or choose **Clear all** to remove all library filters.

Nothing is selected automatically. You can always type a value yourself,
including a name that isn't in the suggestions.

![Photokin searching for photos](/screenshots/03-search.webp){.screenshot}

## Smart search

Smart search lets you describe a photo in your own words: _"sunset over the
sea"_, _"kids playing in the snow"_, _"a red bicycle"_. It uses an AI model that
runs on your computer. Your photos and searches are never uploaded.

To use it, download a search model (during setup, or later in
**Settings → System → Smart search**). Photokin then indexes your photos in the
background; you'll see **Indexing for search** in the bottom-right corner.
New photos are indexed automatically.

In **Settings → System → Smart search**, turn off **Index missing photos at
startup** to leave unfinished indexing paused when Photokin opens. New imports
and model changes still trigger indexing.

Use **Rebuild search index** in the same section to reprocess all photos with
the selected model. This can take a very long time in large libraries; smart
search results will be incomplete while it runs. Original photos are not
changed. Progress and the **Stop** action appear in the main window.

Without a model, the search bar still finds photos by name and tag.

### Tips for better results

- **Describe what you'd see**, not what it means: _"two people hugging at an
  airport"_ works better than _"reunion"_.
- **Add details** to narrow it down: _"black dog"_, _"dog swimming"_.
- **Combine with filters** for the best of both: `mountains year=2023`.
- Filters are strict. If nothing matches, Photokin shows no results, not similar
  photos outside those filters. Choose **Edit search** or **Clear query filters**
  to broaden it yourself. Clearing query filters keeps library filters.
- Photokin only shows photos it's confident about. If what you want isn't
  there, choose **Show weaker matches** below the results to see every photo
  ranked by similarity, within the same filters and the existing result limit.
- The first search after starting Photokin takes a few seconds while the model
  loads; the next ones are almost instant.

### Choosing a search model

Models differ in size, speed and languages. Choose in
**Settings → System → Smart search**. Changing models rebuilds the search index
on your computer.

| Model                     | Download | Languages       | Notes                                     |
| ------------------------- | -------- | --------------- | ----------------------------------------- |
| CLIP ViT-B/32 (LAION)     | 580 MB   | English         | Fastest, simplest                         |
| SigLIP ViT-B/16           | 780 MB   | English         | Balanced                                  |
| SigLIP ViT-B/16 384px     | 780 MB   | English         | Sharper, slower indexing                  |
| SigLIP2 ViT-B/16          | 1.43 GB  | Major languages | **Recommended:** best results             |
| SigLIP2 ViT-B/32          | 1.44 GB  | Major languages | Faster SigLIP2                            |
| XLM-RoBERTa CLIP ViT-B/32 | 1.4 GB   | Many languages  | Fast                                      |
| SigLIP i18n ViT-B/16      | 1.41 GB  | Many languages  | Balanced                                  |
| NLLB-CLIP base            | 1.94 GB  | Widest coverage | **Recommended** for less common languages |

"Major languages" covers widely spoken ones such as Spanish, French, German or
Portuguese; "Many languages" adds dozens more, including Asian ones. If you
search only in English, an English model is smaller and just as good.

## Filters

Type `key:value` (or `key=value`). Put values with spaces in quotes:
`person:"Ana López"`.

Separate filters combine with **AND**. Unknown keywords are ordinary search
text. Invalid known filters (such as `rating:abc`, an empty `person:`, an invalid
date or a reversed range) also remain search text, with a notice explaining
that they were not applied as filters.

### People, tags and text

For text filters, `:` (or `=`) matches the whole value exactly, while `~` finds
it anywhere inside: `camera:"Canon EOS R6"` matches only that camera,
`camera~Canon` matches every Canon. Both respect capital letters.

| Filter        | Example               | Finds                                    |
| ------------- | --------------------- | ---------------------------------------- |
| `person`      | `person:Ana`          | Photos with Ana (confirmed faces)        |
| `tag`         | `tag:"Japan 2024"`    | Photos with that tag (name or full path) |
| `filename`    | `filename~IMG_20`     | Files by name                            |
| `description` | `description~wedding` | Photos by their description              |
| `location`    | `location~Madrid`     | Photos by place name                     |
| `camera`      | `camera~Canon`        | Photos by camera make and model          |
| `lens`        | `lens~50mm`           | Photos by lens                           |
| `type` / `is` | `is:video`            | Only `photo` or only `video`             |

For `person` and `tag`, a comma means _any of these_: `person:Ana,Luis` finds
photos with Ana **or** Luis. Write two filters to require both:
`person:Ana person:Luis`.

If several people or tags have the same name, typing the name matches any of
them. Suggestions insert the full path to distinguish them. An exact full path
takes precedence over matching leaf names.

Quote individual list members containing commas, e.g.
`tag:"Trips/Ana, Luis",Beach`. Inside quotes, use `\"` for a quote and `\\` for
a backslash. Commas inside quotes are literal, not list separators.

### Has / No

| Filter       | Meaning                                |
| ------------ | -------------------------------------- |
| `has:tag`    | Has assigned file tags (`tag_count>0`) |
| `no:tag`     | No assigned file tags (`tag_count=0`)  |
| `has:person` | Has detected faces (`person_count>0`)  |
| `no:person`  | No detected faces (`person_count=0`)   |

Detected faces include unnamed faces and follow the **Count unverified faces**
setting. `no:person` does not mean nobody is visually in the photo; it means
Photokin has no counted face detections. Assigned tags count file-tag
associations, not face associations. A confirmed face can match `tag:Name`
without contributing an assigned file tag.

These shortcuts also appear above the names in the Person and Tag suggestions.
No other `has:` / `no:` fields are supported.

### Dates

Dates are written `YYYY-MM-DD`.

| Filter             | Example                              | Finds                                             |
| ------------------ | ------------------------------------ | ------------------------------------------------- |
| `date`             | `date=2024-07-15`, `date>2024-01-01` | Photos taken on, after or before a day            |
| `after` / `before` | `after:2024-06-01 before:2024-08-31` | A date range                                      |
| `year`             | `year=2015`                          | Photos from that year                             |
| `month`            | `month=12`                           | Photos from December, any year                    |
| `day`              | `day=25`                             | Photos from that day of the month                 |
| `weekday`          | `weekday=0`                          | Photos from a weekday (0 = Sunday … 6 = Saturday) |
| `added`            | `added>2024-05-01`                   | Photos added to Photokin after a day              |

### Numbers

These accept `=`, `!=`, `>`, `>=`, `<` and `<=`, and ranges with `..`:

| Filter         | Example                             | Finds                                        |
| -------------- | ----------------------------------- | -------------------------------------------- |
| `rating`       | `rating>=4`, `rating=3..5`          | Photos by star rating (favorites count as 5) |
| `person_count` | `person_count=1`, `person_count>=5` | Portraits, group photos…                     |
| `tag_count`    | `tag_count=0`                       | Photos without tags                          |
| `size`         | `size>10`                           | Files larger than 10 MB                      |
| `iso`          | `iso>=3200`                         | High-ISO shots                               |
| `focal`        | `focal<=24`                         | Wide-angle shots (mm)                        |
| `aperture`     | `aperture<=2`                       | Wide-aperture shots (f-number)               |
| `shutter`      | `shutter>=1`                        | Long exposures (seconds)                     |

### Shortcuts

Everyday words such as **videos**, **photos** and **favorites** are ordinary
search text, not guessed filters. Choose **Media type** for `type:video` or
`type:photo`, or **Favorites** for `rating>=5`. The results page shows
**Applied filters**, separately from notices about text interpretation.

This replaces the earlier automatic word-to-filter interpretation and automatic
similar-photo fallback. Existing valid typed filters and query URLs still work.

## The filter drawer

Prefer clicking to typing? **Library filters** in the toolbar offers the same
filters with menus and date pickers, plus filtering by album. Filters from the
drawer and from the search bar combine.
The results page reminds you when library filters also apply. Clearing the
search field or query filters never clears library filters.
