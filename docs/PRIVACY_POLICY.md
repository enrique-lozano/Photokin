# Privacy and network access

Photokin is a local-first desktop photo gallery maintained by Enrique Lozano.
This notice describes the current implementation; it does not promise that
every feature works without a network. A plain-language summary is in the
[user guide](https://enrique-lozano.github.io/Photokin/guide/privacy).

## What stays on your computer

Photokin stores its library in a local SQLite database. This includes indexed
file details, tags, ratings, people/face information, locations, and other library
records. Generated thumbnails, previews, and downloaded models are local too.
Face recognition and semantic search process images on your computer; they do
not use a hosted photo-analysis service.

Photokin has no cloud library, analytics, or automatic telemetry/crash-report
upload. Local data is not automatically encrypted by Photokin: protect your
device, user account, and backups, especially when storing GPS or face data.

## When Photokin connects to the internet

| Feature                                    | Destination                                          | Information involved                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Standard map                               | OpenStreetMap tile service                           | Requested tile coordinates reveal the viewed map area; the provider also receives normal connection information such as your IP address. |
| Satellite map                              | Esri / ArcGIS tile service                           | Requested tile coordinates and normal connection information.                                                                            |
| Elevation lookup                           | Open-Meteo elevation API                             | The latitude and longitude of the requested points, plus normal connection information.                                                  |
| Semantic-search model download             | Hugging Face, including its download infrastructure  | Requested model/files and normal connection information; the download does not send photo pixels or search text.                         |
| Automatic ExifTool installation on Windows | exiftool.org and SourceForge download infrastructure | Version and archive requests and normal connection information.                                                                          |
| Update check and download                  | GitHub Releases                                      | A request for the latest release file and, when you choose to install, the installer download, plus normal connection information. Photokin checks for updates when it starts; turn this off in **Settings > About**. |

Map and elevation requests do not send photo pixels, but location requests can
still reveal sensitive information. Do not use these features for sensitive
locations if you do not want to contact their providers. Maps require network
access; local search requires its model to be downloaded first.

Development setup also downloads packages, FFmpeg/FFprobe from GitHub, face
models from the OpenCV Zoo, and Python dependencies. These build-time downloads
are separate from photo-library processing.

## External links and donations

Project, privacy, issue-reporting, and donation links open external pages in your
system browser only when selected. GitHub, PayPal, Buy Me a Coffee, and Liberapay
operate their own services and apply their own privacy policies. Photokin does
not collect payment details; information you submit to those services is handled
by them.

## Local data and removal

Use **Settings > System** to locate the library database and thumbnail folder,
clear thumbnail caches, or remove library data. The reset action can also remove
downloaded search models when selected; it is not a complete OS-level erasure
of every app file, setting, log, or backup.

Removing library data is not the same as deleting original photos. Conversely,
Trash and explicit file-editing actions can affect your originals. Restore any
photos you need from Photokin's Trash before resetting the library. See
[Photo safety](PHOTO_SAFETY.md) for these distinctions.

## Information you choose to share

Bug reports, attachments, and copied diagnostics may contain personal paths,
faces, names, GPS data, and embedded metadata. Review and sanitize them before
publishing. Never attach a private library database or sensitive originals to a
public issue.

For privacy questions, contact
[lozin.technologies@gmail.com](mailto:lozin.technologies@gmail.com). Do not include
sensitive photos or location data in an initial message.
