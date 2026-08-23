# `CHG-20260823-d6ecc15c-android-playlist-drag-reorder`

Change-ID: `CHG-20260823-d6ecc15c`
Status: finalized
Lane: standard
Owner: `Codex`
Affected-Specs: `COLLECTIONS-002`, `PLAYBACK-001`

## Intent

Listeners can reorder an owned Android playlist and upcoming radio queue entries by
dragging dedicated handles. The existing playlist move controls remain as an accessible
alternative; the scope does not add cross-device conflict resolution beyond the
existing complete-order API.

## Behavior Change

- Before: Android playlist rows expose only up/down buttons; dragging a track is not a
  supported reorder interaction.
- After: Dragging a row's handle enables reordering, updates the visible list, and
  persists the full item order through the existing playlist API without playing a track.
- After: Dragging a radio queue handle reorders only upcoming tracks in the local
  shared player state, keeping the current native playback item unchanged.

## Acceptance Criteria

- [x] `AC-CHG-20260823-d6ecc15c-01`: Given an owned playlist with multiple tracks on
  Android, when the listener drags a handle, moves a track, and releases it, then
  the order is visible after reload and the drag does not start playback.
- [x] `AC-CHG-20260823-d6ecc15c-02`: Given an Android radio queue with multiple
  upcoming tracks, when the listener drags one by its handle, then its dropped order
  is used without changing the current track or playback state.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-d6ecc15c-01` | pass | Android release E2E drove the dedicated playlist handle, observed the dropped order after reopening the fixture playlist, and confirmed the MediaSession stayed paused (`C:\Users\Long\AppData\Local\Temp\vong-e2e\20260823-182034`). |
| `Outcome: AC-CHG-20260823-d6ecc15c-02` | pass | `packages/shared/src/player-store.test.ts` proves `moveUpcoming` changes only future order while retaining current identity and position; the Android queue sheet calls that shared action. |
| `Experience: Android phone / playlist and queue handles` | pass | Release APK bundled the gesture handler and drag-list implementation; Android E2E completed without a failure artifact before the Windows stage. |
| `npm test -- --run packages/shared/src/player-store.test.ts mobile/src/lib/playlist-order.test.ts` | pass | 29 tests passed. |
| `npm run typecheck && npm run typecheck --workspace @vong/mobile && npm run lint --workspace @vong/mobile` | pass | Root/shared and Android type checks plus Android lint passed. |
