# Search

The search bar at the top of Photokin understands two kinds of input, and you
can mix them freely:

- **Plain words**, like `dog on the beach` or `birthday cake`, find photos by
  what's in them, using smart search.
- **Filters**, like `rating>=4` or `person:Ana`, narrow results precisely.

`person:Ana beach rating>=4` finds Ana's best beach photos.

![Photokin searching for photos](/screenshots/03-search.webp){.screenshot}

## Smart search

Smart search lets you describe a photo in your own words: _"sunset over the
sea"_, _"kids playing in the snow"_, _"a red bicycle"_. It uses an AI model that
runs on your computer. Your photos and searches are never uploaded.

To use it, download a search model (during setup, or later in
**Settings → System → Smart search**). Photokin then indexes your photos in the
background; you'll see **Indexing for search** in the bottom-right corner.
New photos are indexed automatically.

Without a model, the search bar still finds photos by name and tag.

### Tips for better results

- **Describe what you'd see**, not what it means: _"two people hugging at an
  airport"_ works better than _"reunion"_.
- **Add details** to narrow it down: _"black dog"_, _"dog swimming"_.
- **Combine with filters** for the best of both: `mountains year=2023`.
- When your filters match nothing, Photokin shows the most similar photos
  instead and says so: _"No photos matched your filters. Showing similar photos
  instead."_
- Photokin only shows photos it's confident about. If what you want isn't
  there, choose **Show weaker matches** below the results to see every photo
  ranked by similarity.
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

### Shortcuts in plain words

A few everyday words act as filters: **videos** (or _movies_), **photos** (or
_pictures_, _images_) and **favorites** (or _loved_). Photokin shows how it read
your search in **Interpreted as**, so nothing is applied silently. To search for
the word itself, put it in quotes: `"videos"`.

## The filter drawer

Prefer clicking to typing? **Library filters** in the toolbar offers the same
filters with menus and date pickers, plus filtering by album. Filters from the
drawer and from the search bar combine.
