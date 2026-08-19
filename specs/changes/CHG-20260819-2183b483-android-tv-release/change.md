# `CHG-20260819-2183b483-android-tv-release`

Change-ID: `CHG-20260819-2183b483`
Status: active
Lane: critical
Owner: `Vong maintainers`
Decision-Owner: `User / Vong maintainer`
Affected-Specs: `IDENTITY-005, PLAYBACK-001, PLAYBACK-002, PLAYBACK-003, PLAYBACK-004, OPERATIONS-002`

## Intent

Ship one coherent Vong brand across web and native surfaces, add a remote-first
Android TV experience without forking playback behavior, and publish independently
testable phone and TV artifacts in the next GitHub release. The authentication and
cross-shell playback risk is justified because a TV build that depends on touch or a
local browser would not be a usable product.

## Behavior Change

- Before: Web and Android use inconsistent icon/wordmark assets; the Expo app is
  portrait phone-only, opens a local browser for sign-in, and exposes touch-first
  navigation and seeking. GitHub releases contain one Android phone APK.
- After: Web, phone, and TV use one recognisable brand system; the TV target is a
  landscape Leanback application navigable by D-pad, pairs through a separate phone,
  preserves the native playback invariants, and ships beside the phone artifact.

## Acceptance Criteria

- [x] `AC-CHG-20260819-2183b483-01`: Given a web, Android phone, or Android TV install surface, when Vong is rendered or launched, then the approved mark and wordmark are consistent, legible, and correctly spell "Vọng".
- [x] `AC-CHG-20260819-2183b483-02`: Given an Android TV device with only a D-pad and Select/Back/media keys, when the listener launches Vong, then every primary browse and playback action is reachable and has an obvious focused state without touch input.
- [x] `AC-CHG-20260819-2183b483-03`: Given a signed-out TV listener, when they pair on a separate browser-capable device, then the TV receives one scoped native bearer session without exposing the device polling credential; expired, unknown, replayed, or unapproved attempts issue no session.
- [x] `AC-CHG-20260819-2183b483-04`: Given library or YouTube playback on TV, when playback starts, seeks, advances, backgrounds, or receives a media key, then Media3 remains the only audible engine, library requests retain the Vong bearer, and googlevideo requests retain a Range header without the bearer.
- [ ] `AC-CHG-20260819-2183b483-05`: Given the release commit passes local and emulator gates, when the GitHub release is published, then versioned phone and TV APK assets are attached and byte-verifiable from the release page.
- [x] `AC-CHG-20260819-2183b483-06`: Given playback has loaded bearer-backed Android items, when the listener signs out, then native playback, MediaSession queue, shared queue, and persisted session are cleared in that order.

## Impact

- Contracts: Add a bounded TV pairing API and Android TV release asset to the latest-release contract; keep existing phone and desktop contracts compatible.
- Data/migration: Reuse the existing Auth.js verification-token table with a dedicated prefix; no schema migration or existing row rewrite is needed.
- Security/privacy: Pairing stores only hashed device credentials plus short-lived approval state, requires an authenticated browser for approval, and atomically consumes the approved record before minting a native session.

## Risks

- A TV-specific React Native dependency could regress the phone build; keep separate build profiles and run both signed release smoke tests.
- Focus may become trapped or invisible on large lists; use one focus treatment and exercise all primary paths with D-pad-only input.
- Pairing could mint or replay the wrong session; use high-entropy device credentials, a short expiry, authenticated approval, atomic exchange, and negative tests.
- TV playback could mount a second sink or drop security headers; reuse the existing Android Media3 engine and re-run its queue, header, background, and MediaSession checks.

## Rollout and Recovery

- Rollout: Publish phone and TV APKs as separate assets in one GitHub prerelease-quality gate, then promote the same tested TV artifact to the Android TV Play track later.
- Rollback/recovery: Remove or supersede the TV asset while leaving the phone APK and existing APIs operational; prefixed expired pairing rows can be deleted without affecting Auth.js sessions.

## Plan

- [x] Update identity, playback, operations, and Android TV current specs/contracts.
- [x] Apply and verify the shared brand assets before behavior changes.
- [x] Implement and test TV pairing, remote-first UI, and TV build configuration.
- [x] Run Critical local verification and Android TV emulator smoke tests.
- [ ] Verify the signed phone and universal-ARM TV artifacts produced from the release tag.
- [ ] Publish and verify the authorised GitHub release artifacts.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Brand asset inspection and web/mobile render | pass | Generated shared mark/wordmark/icon/banner assets; `/login` browser QA passed with no console errors; TV pairing and shell screenshots captured under `artifacts/` |
| Pairing contract tests | pass | `src/lib/tv-pairing.test.ts`: start/approve/consume, unapproved, replay, and expiry cases pass; live local start route returned a challenge |
| `python scripts/verify.py` | pass | SDD check plus the full Critical local gate passed on 2026-08-19. |
| `npm run verify:local` | pass | 132 tests, web/shared/mobile typecheck and lint, Next production build, and Rust clippy passed. |
| Android phone signed release smoke test | pending | Not run yet |
| Android TV signed release D-pad/playback smoke test | partial | Debug-signed TV build installed on Android TV API 36; Leanback activity resolved; D-pad traversed all primary sections and track cards; Media3/MediaSession fixture playback and remote pause/resume passed. Logout returned to pairing and changed MediaSession to `NONE` with empty metadata/queue. Release ARM artifact build remains pending. |
| GitHub release asset verification | pending | Not run yet |

## Open Questions

- None. The user explicitly approved implementation, TV testing, and GitHub publication in the 2026-08-19 goal request. The shared package/application identity is retained; phone and TV use separate build/release artifacts.

## Review

- Decision: approved by the user / decision owner on 2026-08-19
- Fresh-context review: approved on 2026-08-19; no code blocker remains. Signed artifact, downloaded checksum, and final release smoke checks remain post-tag gates.
