# `CHG-20260823-aa4439ac-engine-load-generation-gate`

Change-ID: `CHG-20260823-aa4439ac`
Status: finalized
Lane: standard
Owner: `Codex`
Affected-Specs: `PLAYBACK-002`

## Intent

Consolidate the async load-generation ownership contract used by Android and Tauri
playback engines. A late resolver/decoder result must never regain control after the
listener changes or clears a track. This refactor preserves each shell's native engine,
headers, resolver and queue behavior; it does not add an engine or alter media sources.

## Behavior Change

- Before: Android and Tauri each maintain an untyped local sequence ref, and clearing
  the current track does not explicitly invalidate a pending native load.
- After: both engines use the shared typed generation gate; any new load or queue clear
  invalidates older work before it can complete.

## Acceptance Criteria

- [x] `AC-CHG-20260823-aa4439ac-01`: Given overlapping native load attempts, when a
  newer attempt begins, then completion code can identify the older attempt as stale.
- [x] `AC-CHG-20260823-aa4439ac-02`: Given native playback is cleared while an async
  load is pending, when that load resolves, then it is stale and cannot own the engine.
- [x] `AC-CHG-20260823-aa4439ac-03`: Given Android and Tauri native engines, when they
  coordinate an async load, then both consume the same shared gate contract while
  retaining their source/header invariants.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-aa4439ac-01` | pass | `Shared gate unit test starts two generations and confirms only the latest remains current.` |
| `Outcome: AC-CHG-20260823-aa4439ac-02` | pass | `Shared gate unit test invalidates a pending generation; both native engines call invalidate when their current track clears.` |
| `Outcome: AC-CHG-20260823-aa4439ac-03` | pass | `Typecheck confirms the shared contract in Tauri and Android; full E2E passes web then Android native MediaSession/search before starting Windows/Tauri.` |
| `Experience: N/A - behavior-preserving engine boundary` | pass | `local: no listener-facing visual surface changes; previously reviewed discovery and Now Playing surfaces remain intact.` |
| `Focused project checks` | pass | `Shared unit test 2/2, web/shared/mobile typecheck + lint, Web E2E 8/8, Android release native smoke and Windows/Tauri E2E completed.` |
