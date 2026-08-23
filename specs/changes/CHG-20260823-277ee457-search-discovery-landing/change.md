# `CHG-20260823-277ee457-search-discovery-landing`

Change-ID: `CHG-20260823-277ee457`
Status: finalized
Lane: standard
Owner: `Codex`
Affected-Specs: `DISCOVERY-006`

## Intent

Make Search feel like a music destination before a listener knows the exact song name:
surface existing YouTube discovery shelves while retaining the direct, fast query path.
The landing reuses metadata endpoints and the shared radio flow; it does not introduce
personalization storage, another recommendation API, or another audio engine.

## Behavior Change

- Before: an empty query exposes only the search field and any local history.
- After: an empty query can expose Mới phát hành, selected discovery shelves, and
  trending tracks on web and Android; failures are contained to the landing content.

## Acceptance Criteria

- [x] `AC-CHG-20260823-277ee457-01`: Given available discovery metadata, when a
  listener opens Search without a query, then named playable discovery shelves render
  on web and Android.
- [x] `AC-CHG-20260823-277ee457-02`: Given a listener chooses a landing YouTube
  track, when playback starts, then the existing radio route handles it.
- [x] `AC-CHG-20260823-277ee457-03`: Given either landing metadata request fails,
  when a listener opens Search, then they can still enter and submit a query.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-277ee457-01` | pass | `Web E2E injects Mới phát hành/trending shelves and verifies the named landing controls; Android release E2E enters the revised Search screen and runs its query path.` |
| `Outcome: AC-CHG-20260823-277ee457-02` | pass | `Web E2E clicks the Search release item, observes the existing /api/radio request, and verifies the persistent player updates.` |
| `Outcome: AC-CHG-20260823-277ee457-03` | pass | `Web E2E forces both landing endpoints to 503, checks the contained fallback copy, then enters and submits a query; Android E2E retains its Search query flow.` |
| `Experience: Search landing` | pass | `Reviewed authenticated desktop E2E screenshot: search field remains primary, followed by clear discovery hierarchy and horizontal release cards above the persistent player.` |
| `Focused project checks` | pass | `Web E2E 8/8; Android signed E2E reached MediaSession/search and proceeded to Windows/Tauri; targeted web/mobile typecheck and lint passed.` |
