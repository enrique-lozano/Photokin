# Screenshots

The images in the README and on the website are captured from the real app,
running on a demo library. The website tour uses unframed screenshots; separate
promotional slides add text and backgrounds for the README and other uses.
Nothing is drawn by hand, so both can be refreshed whenever the UI changes:

```powershell
pnpm screenshots            # everything: takes a few minutes (Windows only)
pnpm screenshots --slides   # export slides and unframed images from the last captures
```

`pnpm screenshots`:

1. Starts the app (`tauri dev`) on a separate, fresh `screenshots` library
   profile. Your own library is never opened. Close any running dev app first:
   ports 1420 and 9222 must be free.
2. Imports [`demo/showcase`](../../demo/showcase/ATTRIBUTION.md). Every photo
   there already carries tags, ratings, GPS and named faces, so Places, Tags
   and People fill in without running face detection.
   Also creates four empty folders (Family, Projects, Weekends and To organize)
   under the screenshot cache and imports them into this profile to fill out
   the album sidebar. No demo photos are moved or duplicated.
3. Waits for thumbnails and smart search indexing (uses a search model you
   already downloaded), then captures every screen in `config.mjs` at
   1440×900 @2×, in English, with toasts and dev-only buttons hidden.
4. Renders the slides in `slides/` to `website/public/screenshots/*.webp`
   and exports unframed captures to `website/public/screenshots/app/*.webp`
   with the installed Microsoft Edge, and closes the app.

Commit both sets of exported `.webp` files; the README and the website use them.
Raw captures and the app log stay in `node_modules/.cache/photokin-screenshots/`.
The website's Appearance segment switches between the six `theme-*` captures
(Photokin, Slack and Spotify, each in light and dark mode), without changing
the website's own theme.
The homepage hero reuses `app/albums.webp` alongside rotating photo prints.
`HERO_PHOTOS` in `config.mjs` selects four existing demo photos, exported as
center-cropped 640×640 WebPs in `website/.vitepress/theme/assets/memories/`.
Commit these generated photos too. The hero imports them directly so Vite
checks their existence and generates versioned asset URLs for production.
The photos and captions crossfade
together every three seconds using CSS. The pause control appears on hover or
keyboard focus on desktop and stays visible on touchscreens; reduced motion
shows a single static print. The screenshot tour keeps the full,
unframed app captures available.
The cropped copies retain the licenses listed in the demo library's attribution
file, linked below the website's screenshot tour.

## Files

```text
scripts/screenshots/
├── config.mjs        Demo folder, capture size, settings, themes and screens (SHOTS)
├── screenshots.mjs   The command above
└── slides/           Slide template: texts and layout (slides.js), look (slides.css)
```

To try changes to the template, run `pnpm screenshots --slides` and open the
generated images, or serve `scripts/screenshots/slides/` with any static server.

## Adding a screen

1. Add an entry to `SHOTS` in `config.mjs`: a route, plus a `prepare` step if
   it needs a click first, or a `theme`.
2. Add a slide to `SLIDES` in `slides/slides.js` that uses that shot.
3. Run `pnpm screenshots`. Reference the slide from the README, or add the
   unframed image to the website tour in
   `website/.vitepress/theme/components/HomeShowcase.vue`.

## Changing the demo library

Keep `demo/showcase` small, colorful and fully described: tags, ratings and
GPS in every photo, named face regions plus matching `People|Name` keywords for
people. Only add images whose license allows redistribution, and list them in
`demo/showcase/ATTRIBUTION.md`.

## Testing with a separate library

`pnpm dev:demo` runs the app on its own `demo` profile (kept between runs;
`--reset` starts it from scratch). Use it to try flows without touching your
own library; add `demo/` or any folder you like.
