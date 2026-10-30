# Color System

Photokin combines neutral light/dark surfaces in `src/App.css` with six accent
palettes in `src/utils/theme.ts`. `applyTheme` sets the selected palette on the
document root; Tailwind exposes the HSL tokens as semantic color utilities.

## Token Roles

| Tokens                                          | Purpose                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `background`, `card`, `popover` + foregrounds   | Neutral content surfaces and their labels                          |
| `primary` + `primary-foreground`                | Accent fills, selection, charts, and text on solid accent fills    |
| `action` + `action-foreground`                  | Filled primary buttons, including submit and split actions         |
| `action-hover`                                  | Opaque darker action fill, independent of the underlying surface   |
| `action-border`                                 | Action-colored in light mode; brighter accent-colored in dark mode |
| `secondary`, `muted`, `accent` + foregrounds    | Subdued surfaces and their labels                                  |
| `main-navbar`, `secondary-navbar` + foregrounds | Navigation surfaces and their labels                               |
| `destructive` + foreground                      | Destructive fills and their labels                                 |
| `destructive-text`                              | Destructive text on neutral surfaces                               |
| `success`, `warning` + foregrounds              | Status fills and their labels                                      |
| `ring`                                          | Theme-aware keyboard focus indication                              |

## Contrast Audit

The October 2026 audit found that changing `primary` without changing its
foreground made some theme pairs unreadable. Bright red and green fills need
dark labels; darker purple/indigo fills need white labels. A single foreground
for every light or dark theme was insufficient.

Filled buttons now use deeper theme hues with white labels in both appearances.
Accents retain their original hues. Light YouTube/Spotify navigation fills were
darkened to preserve white labels. Light muted text and destructive fills were
darkened; success fills now have dark foregrounds. Focus rings follow the theme.

`src/utils/theme.test.ts` checks all six themes in both appearances:

- Action labels in normal and hovered states: at least 4.5:1.
- Accent-fill and both navigation foreground pairs: at least 4.5:1.
- Action edges and focus rings against the base page surface: at least 3:1.
- Neutral and status foreground pairs in both appearances: at least 4.5:1.

These are token-level checks, not a claim of complete WCAG conformance. Disabled
controls, translucent fills, navigation hover overlays, per-page accent-colored
text, chart differentiation, and image-backed controls need contextual checks.
`primary-foreground` belongs on solid `primary` fills, not on neutral surfaces;
do not assume decorative `primary` colors are readable as small text.
