# `CHG-20260823-8e6381ea-library-overview`

Change-ID: `CHG-20260823-8e6381ea`
Status: finalized
Lane: standard
Owner: `Vong maintainers`
Affected-Specs: `LIBRARY-005`

## Intent

Listeners get one visual entry point for the personal collection they already own, with richer album and artist context instead of landing directly in a flat song list. The overview reuses user-scoped summaries and existing collection routes; it does not add a catalog, data model, or playback behavior.

## Behavior Change

- Before: the web and Android navigation label “Thư viện” leads directly to the paged song list, while the other collections are dispersed across routes.
- After: “Thư viện” opens a dedicated overview with direct collection links plus recent-album and artist highlights; the song list remains available at `/tracks` and its Android route.

## Acceptance Criteria

- [x] `AC-CHG-20260823-8e6381ea-01`: Given an authenticated listener with an indexed library, when they open Library, then they see user-scoped album and artist highlights and can navigate to every focused collection.
- [x] `AC-CHG-20260823-8e6381ea-02`: Given an authenticated listener with no indexed tracks, when they open Library, then they see the collection navigation and a clear storage-connection next step.
- [x] `AC-CHG-20260823-8e6381ea-03`: Given Android playback E2E, when the Library tab is opened, then the visible Bài hát shortcut reaches the existing song list before playback begins.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-8e6381ea-01` | passed | `npm run e2e:all` — web Playwright verifies all five collection links, both highlight headings, and the Bài hát route. |
| `Outcome: AC-CHG-20260823-8e6381ea-02` | passed | Code review: `LibraryOverview` keeps the collection rail and renders the owned-storage connection empty state when `trackCount === 0`. |
| `Outcome: AC-CHG-20260823-8e6381ea-03` | passed | `npm run e2e:all` — Android release E2E opens Thư viện, taps Bài hát, then verifies MediaSession playback and background continuation. |
| `Experience: desktop and Android Library overview` | passed | Accepted concept and Playwright render inspected with `view_image`; layout, hierarchy, palette, collection rail, album media, and persistent-player composition matched. Intentional deviations: artist initials until owned artwork exists; overview selection is Thư viện rather than a falsely selected Album. |
