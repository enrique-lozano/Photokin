---
name: frontend-design
description: Distinctive, intentional visual design for Photokin UI (React, Tailwind, Radix). Use when building or reshaping screens, layout, typography, empty/error states, or when the user asks for UI/UX polish.
---

# Frontend Design

Approach this as the design lead for a **local desktop photo gallery**. Every
choice should feel like Photokin (photographs, light, time, place) — not a
generic dashboard template.

Express decisions through **existing Photokin primitives**: Tailwind tokens,
CSS colocated with components, and `src/components/ui/` (Radix). Do not
introduce CSS-in-JS, a new component library, or Flutter/Material APIs.

## Ground it in the subject

Pin the screen’s job: browsing a library, reviewing a photo, tagging people,
deduping, or settings. Design with real gallery content (thumbnails, dates,
filenames), not lorem and fake metrics.

If memory of the user’s taste exists, use it. Follow an explicit visual brief
when they give one — including if they ask for a look you would otherwise avoid.

## Design principles

The primary surface is a thesis. Lead with the photograph or the collection,
not chrome. Chrome (sidebar, toolbar, selection bar) supports looking; it
should not compete with the image.

Typography: Photokin already ships Inter, Lora, Nunito, Space Grotesk, Poppins.
Pair display/body deliberately using those families and existing scales. Don’t
add new font packages unless asked.

Structure is information. Section labels, dates, and counts should describe
the library. Avoid decorative numbered markers (01 / 02 / 03) unless the
content is actually a sequence.

Motion: reuse existing lightbox/gallery transitions. Prefer CSS and the
patterns already in lightbox/gallery CSS. Respect that a photo app’s job is
often stillness. Extra animation reads as AI-generated.

Match complexity to the vision. Maximal directions need execution; minimal
directions need spacing and type discipline.

## Photokin constraints

- Desktop-first (Tauri window), but keep usable at narrower widths.
- Reuse `button`, `dialog`, `dropdown-menu`, `context-menu`, `popover`,
  `tooltip`, `slider`, toasts — don’t restyle from scratch.
- Selection, lightbox, and timeline gallery are shared; extend them rather
  than forking a second gallery.
- Don’t hardcode colors that ignore existing CSS variables / Tailwind theme.
- Copy: name things users recognize (albums, photos, people, tags) — not
  tables or services. Sentence case. Active verbs (“Move to trash”, not
  “Submit”). Empty and error states say what to do next.

## Process

1. Short design plan: palette (map onto existing tokens), type roles, layout
   (including ASCII wireframe if helpful), one signature element.
2. Critique: if it matches the usual AI defaults (cream + terracotta serif,
   black + acid green, hairline-grid brutalism) and the brief didn’t ask for
   that, revise.
3. Build from the plan using shared components. Watch nested padding fights.
4. Self-critique: remove one accessory. Verify in the running app when UI
   tools exist.

Spend boldness in **one** place. Keep the rest quiet.

## Writing

Words exist to make the gallery easier to use. Same control name through a
flow. Failures explain the fix. Don’t apologize. Don’t be clever.
