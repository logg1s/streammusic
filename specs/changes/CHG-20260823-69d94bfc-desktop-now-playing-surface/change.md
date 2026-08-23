# `CHG-20260823-69d94bfc-desktop-now-playing-surface`

Change-ID: `CHG-20260823-69d94bfc`
Status: finalized
Lane: standard
Owner: `Codex`
Affected-Specs: `PLAYBACK-005`

## Intent

Give desktop and Windows listeners an immersive Now Playing view comparable to the
existing phone sheet, without changing source selection or native/web audio engines.
It is intentionally a shared-store presentation layer, not an additional player.

## Behavior Change

- Before: desktop exposes current metadata and controls only in the compact player bar.
- After: clicking the current track opens an accessible full desktop Now Playing dialog
  with artwork, source details, transport, timeline, and existing queue access.

## Acceptance Criteria

- [x] `AC-CHG-20260823-69d94bfc-01`: Given a current desktop track, when the listener
  opens it from the player bar, then the immersive dialog exposes the current track,
  controls, and timeline.
- [x] `AC-CHG-20260823-69d94bfc-02`: Given the dialog is open, when the listener opens
  the queue or changes transport, then the existing shared queue/player state handles it.
- [x] `AC-CHG-20260823-69d94bfc-03`: Given no current track, when the desktop player bar
  is visible, then it does not present a Now Playing launcher.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-69d94bfc-01` | pass | `Web E2E starts a fixture track, opens “Đang phát”, and verifies its exact track heading and timeline slider.` |
| `Outcome: AC-CHG-20260823-69d94bfc-02` | pass | `The same E2E opens Hàng đợi from the dialog and verifies the existing independent queue panel; transport/seek/background assertions remain in that flow.` |
| `Outcome: AC-CHG-20260823-69d94bfc-03` | pass | `Fresh authenticated Web E2E context asserts no “Mở Đang phát” launcher exists before a track is selected.` |
| `Experience: desktop/Windows Now Playing` | pass | `Reviewed E2E screenshot: large artwork, fully readable two-line title, source metadata, timeline, transport, volume and queue affordance form a clear desktop listening surface; the suite proceeds through Windows/Tauri.` |
| `Focused project checks` | pass | `Web E2E 8/8; Android release E2E MediaSession/search and Windows/Tauri E2E completed; diff check clean.` |
