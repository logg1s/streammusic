# `CHG-20260823-b112f513-queue-long-press-drag`

Change-ID: `CHG-20260823-b112f513`
Status: verified
Lane: standard
Owner: `Vong maintainers`
Affected-Specs: `PLAYBACK-001`

## Intent

Listeners can reliably hold the dedicated Android queue handle and drag an upcoming
track. This changes only gesture activation; playback, radio generation, and the
existing accessible “Play next” action remain unchanged.

## Behavior Change

- Before: the handle starts drag on touch-down, which can race Android's pan
  recognizer and leave a hold-and-drag gesture inert.
- After: the handle activates drag after a short hold, then accepts the existing
  drag movement and drop order.

## Acceptance Criteria

- [ ] `AC-CHG-20260823-b112f513-01`: Given upcoming Android queue tracks, when a
  listener holds a dedicated handle and drags it to another row, then the dropped
  order is applied without changing the current track or its playback state.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-b112f513-01` | pass | The handle now invokes the drag-list callback from React Native `onLongPress`, the documented hold-to-drag trigger; existing `onDragEnd` still delegates only future positions to `moveUpcoming`. |
| `Experience: Android phone / queue handle` | pass | A dedicated visible handle retains its Vietnamese drag hint and now responds to a deliberate 150 ms hold before movement. |
| `npm run verify:local` | pass | 155 unit tests, production web build, Android typecheck/lint, and Rust clippy passed locally. |
