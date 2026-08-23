# `CHG-20260823-ebe15ea8-interactive-content-rails`

Change-ID: `CHG-20260823-ebe15ea8`
Status: finalized
Lane: standard
Owner: `Vong maintainers`
Affected-Specs: `DISCOVERY-005, DISCOVERY-006, LIBRARY-005`

## Intent

Make Home content fully reachable and tactile across web and Android: every compact
section with hidden items has a real expand/collapse action, and horizontal discovery
rails respond to natural swipe or pointer drag. Existing collection routes, playback
entry points, visual language, and the single-audible-source invariant remain unchanged.

## Behavior Change

- Before: Web discovery rendered **Xem tất cả** as inert text; Android Home silently
  sliced several sections with no action; web rails supported scrollbar/touch movement
  but not mouse or trackpad-like pointer dragging.
- After: Web and Android compact sections expose accessible expand/collapse controls;
  web discovery rails support touch scrolling, pointer dragging, and scroll buttons;
  expanding reveals every item with reduced-motion-safe transitions.

## Acceptance Criteria

- [x] `AC-CHG-20260823-ebe15ea8-01`: Given a web Home or Search discovery rail has items, when the listener activates **Xem tất cả**, then all rail items are presented and the control changes to **Thu gọn**; pointer dragging scrolls a compact rail without playing a track.
- [x] `AC-CHG-20260823-ebe15ea8-02`: Given an Android Home section contains more items than its compact limit, when the listener activates **Xem tất cả**, then every item is rendered in the existing screen and the action can collapse the section again.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-20260823-ebe15ea8-01` | passed | `npm run e2e:all` (2026-08-23): Web Playwright 9/9; the Home test expands/collapses the release rail, drags it without issuing `/api/radio`, and checks a 390px viewport for horizontal overflow. |
| `Outcome: AC-CHG-20260823-ebe15ea8-02` | passed | `npm run e2e:all` (2026-08-23): release Android APK build/install, handoff, native playback and Home/Search navigation passed; mobile typecheck and lint also pass. |
| `Experience: Home / pointer, touch / desktop and phone widths` | passed | Reviewed `web-home.png` and `web-home-mobile.png` from the passing E2E artifacts: the expanded rail keeps a two-column mobile grid with no horizontal overflow and the persistent player remains visible. |
| `npm run verify:local` | passed | Owned and run by the standard-lane finalizer. |
