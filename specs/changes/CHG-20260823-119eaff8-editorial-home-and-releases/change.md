# `CHG-20260823-119eaff8-editorial-home-and-releases`

Change-ID: `CHG-20260823-119eaff8`
Status: finalized
Lane: standard
Owner: `Codex`
Affected-Specs: `DISCOVERY-005`

## Intent

Make Home a genuine music-discovery starting point: show a playable editorial feature,
surface an explicit new-releases rail when YouTube Music provides one, and retain the
listener's own recent/library entry points. The release shelf is assumed to be present
only when the locale-aware YouTube home feed labels it as such; this change does not
invent a release feed, alter metadata ownership, or introduce another playback engine.

## Behavior Change

- Before: Home has a generic greeting, library lists, and undifferentiated YouTube rows.
- After: Home has a dark editorial feature, a distinct dynamic **Mới phát hành** rail,
  retained library continuity rows, loading/failure containment, and every play action
  delegates to the existing shared player or radio path.

## Acceptance Criteria

- [x] `AC-CHG-20260823-119eaff8-01`: Given an authenticated listener and an available release shelf, when Home loads, then **Mới phát hành** exposes named playable music and the feature uses the same track.
- [x] `AC-CHG-20260823-119eaff8-02`: Given a listener selects a Home YouTube item, when playback starts, then the existing radio flow receives the item and no new audio engine mounts.
- [x] `AC-CHG-20260823-119eaff8-03`: Given discovery is loading or fails, when the listener has library content, then library continuity rows stay visible and usable.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-119eaff8-01` | pass | `Web E2E injects a named Mới phát hành shelf and verifies both its heading and the shared featured track.` |
| `Outcome: AC-CHG-20260823-119eaff8-02` | pass | `Web E2E clicks the featured YouTube track and observes the existing /api/radio request; the player bar updates to the selected track.` |
| `Outcome: AC-CHG-20260823-119eaff8-03` | pass | `Web E2E forces both discovery endpoints to return 503 and verifies the failure message, “Vừa thêm vào” continuity rail, and a library track remain visible.` |
| `Experience: desktop Home` | pass | `Authenticated E2E screenshot reviewed against the accepted dark editorial concept; hierarchy, rail, persistent player, and release action are present.` |
| `Experience: Android Home` | pass | `Release APK installs after the E2E boot readiness check; the native MediaSession playback, next-track, background, pause, search, and library flows complete before the suite proceeds to Windows.` |
| `packages/shared/src/discovery-home.test.ts` | pass | `4 assertions passed locally` |
