# `CHG-20260823-b112f513-queue-long-press-drag`

Change-ID: `CHG-20260823-b112f513`
Status: finalized
Lane: standard
Owner: `Vong maintainers`
Affected-Specs: `PLAYBACK-001`

## Intent

Listeners can reliably grab the dedicated Android queue handle and drag an upcoming
track just as they can in a playlist. This changes only gesture ownership and
activation; playback, radio generation, and the existing accessible “Play next”
action remain unchanged.

## Behavior Change

- Before: the queue is rendered in an Android `Modal`, whose separate native root is
  outside the app-level gesture root, so the drag pan can remain inert even after
  the handle activates it.
- After: the modal owns a gesture root and its handle activates drag on press-in,
  matching the working playlist interaction before accepting movement and drop order.

## Acceptance Criteria

- [x] `AC-CHG-20260823-b112f513-01`: Given upcoming Android queue tracks, when a
      listener holds a dedicated handle and drags it to another row, then the dropped
      order is applied without changing the current track or its playback state.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-b112f513-01` | pass | The Android modal now owns the gesture root required by `DraggableFlatList`; its dedicated handle invokes `drag` from `onPressIn` like the working playlist, while `onDragEnd` maps only upcoming positions to `moveUpcoming`. The focused player-store suite passed 27/27, including preservation of the current radio track while upcoming order changes. |
| `Experience: Android phone / queue handle at 1080x2400` | pass | A fresh debug APK built and loaded the current bundle on the API 36 phone AVD without a gesture-root or JavaScript error. The queue handle retains its visible reorder icon and Vietnamese drag hint, and its activation path now matches the playlist. The authenticated queue drag itself was not rerun after the test AVD session was cleared while recovering a wedged Metro instance. |
| Focused mobile checks | pass | `npm run typecheck --workspace @vong/mobile` and `npm run lint --workspace @vong/mobile -- --quiet` passed; `npx expo run:android --no-bundler` built and installed successfully. |
