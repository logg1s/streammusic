# `CHG-20260819-7f2a9c31-listening-ui-redesign`

Change-ID: `CHG-20260819-7f2a9c31`
Status: finalized
Lane: standard
Owner: Vong maintainers
Affected-Specs: `PLAYBACK-001, PLAYBACK-004, LIBRARY-003, DISCOVERY-002, COLLECTIONS-001`

## Intent

Create one coherent, accessible listening interface across web, Android phone, and
Android TV. Playback controls stay immediately available, while the queue becomes an
explicit independent surface instead of content that is only reachable by scrolling
past the phone player.

## Behavior Change

- Before: Android phone renders the complete queue below the full player, TV has no
  queue surface and can obscure content with its bottom controls, and the three shells
  use related colors but inconsistent layout, focus, and button treatments.
- After: each shell uses shared visual principles and a device-appropriate player;
  queue opens immediately as a drawer/sheet/pane, essential controls fit the initial
  viewport, and touch, keyboard, and D-pad focus states are unambiguous.

## Acceptance Criteria

- [x] `AC-CHG-20260819-7f2a9c31-01`: Given a playing track on Android phone, when the
  listener opens Now Playing, then artwork, metadata, scrubber, transport, and a queue
  action are available without vertical scrolling.
- [x] `AC-CHG-20260819-7f2a9c31-02`: Given a non-empty queue on web or Android phone,
  when the listener opens it, then it appears in an independent scrollable drawer or
  sheet that preserves the player context and keeps queue actions reachable.
- [x] `AC-CHG-20260819-7f2a9c31-03`: Given Android TV playback, when the listener opens
  the player and queue, then the layout stays inside the TV safe area, no transport
  control covers content, and every visible action is reachable with a clear D-pad
  focus state.
- [x] `AC-CHG-20260819-7f2a9c31-04`: Given any primary listener surface, when it is
  rendered, then navigation, buttons, list rows, loading/error/empty states, type,
  spacing, and accent treatment follow the same Vong design tokens.
- [x] `AC-CHG-20260819-7f2a9c31-05`: Given the redesign, when playback is exercised,
  then queue mutations and transport behavior remain store-driven and the one-audible-
  source invariant is unchanged.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `python scripts/verify.py` | passed | SDD consistency plus the configured repository verification command |
| `npm run verify:local` | passed | 132 unit tests, Next production build, web/mobile typecheck and lint, Rust clippy |
| Browser desktop/mobile visual QA | passed | Playwright 5/5; authenticated home/search render plus queue dialog open/current-track/close assertions |
| Android emulator visual/interaction QA | passed | Clean phone AVD; x86_64 debug build, single-viewport Now Playing, independent queue sheet, and transport playback exercised with E2E fixture |
| Android TV emulator D-pad QA | passed | Leanback x86_64 debug APK; authenticated content, compact nav, direct Now Playing route, queue focus traversal, safe area, and hardware Back verified |
