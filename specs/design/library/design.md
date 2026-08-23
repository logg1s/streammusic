# Library accepted design

## Outcome and non-goals

- Outcome: make Library the clear, content-rich entry point to a listener's owned music collections.
- Observable success: a listener can reach every collection from one overview and immediately see recent albums and known artists without losing the existing focused routes.
- Non-goals: no new catalog, metadata fields, collection mutations, search behavior, or playback-engine behavior.

## User and context

- Primary user: an authenticated listener returning to their personal music library.
- Context and job to be done: orient in a growing collection, choose the right way to browse, then continue to a focused collection or detail page.
- Important constraints: all content remains user-scoped; the overview cannot imply new media ownership, and playback remains hosted by the existing persistent player shell.

## Selected direction

- Direction: a dark, editorial overview with a quiet collection rail, square album media, and a rounded artist rail above the persistent player.
- Why this direction: it matches Vọng's charcoal/coral system and upgrades navigation from a flat track list into an image-led overview without inventing a new content type.
- Alternatives not selected and material trade-off: a tab strip embedded only inside the tracks page would retain deep links but would not make Library a distinct destination; a new composite data endpoint would add API surface without changing the listener outcome.

## Main journey

1. Open Library from the persistent navigation.
2. Select Album, Nghệ sĩ, Bài hát, Yêu thích, or Playlist from the collection rail, or inspect a recent album / artist highlight.
3. Continue on the existing specialized route and, when applicable, use the existing playback controls.

## Screen and state matrix

| Surface | Purpose | Relevant states | Accepted artifact |
| --- | --- | --- | --- |
| Web `/library` | Collection overview, rich desktop entry point | populated / empty | ImageGen concept inspected in this Codex task (preview-only; not a repository asset) |
| Android Library tab | Touch entry point using the same collection sequence | loading / populated / empty / API error | Same selected direction, adapted to native list and horizontal rails |

## Experience constraints

- Platforms and viewports: desktop web and Android phone; collections remain reachable at small widths without horizontal page overflow.
- Input modes: mouse, keyboard, touch, and existing Android accessibility labels.
- Accessibility needs: semantic navigation labels on web, visible focus states, touch targets and screen-reader labels on Android.
- Existing design-system rules to reuse: charcoal/coral tokens, persistent player, `AlbumGrid` / `AlbumCard`, `ArtistRow`, `SectionHeader`, and existing empty/error states.

## Decisions to revisit

- Add artwork to artist summaries only if an owned artist-image source is introduced; initials/placeholders deliberately avoid inventing portraits.
