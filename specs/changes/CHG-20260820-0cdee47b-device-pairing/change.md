# `CHG-20260820-0cdee47b-device-pairing`

Change-ID: `CHG-20260820-0cdee47b`
Status: verified
Lane: critical
Owner: `Vong maintainers`
Decision-Owner: `User / Vong maintainer`
Affected-Specs: `IDENTITY-001, IDENTITY-005`

## Intent

Let a listener authenticate a limited-input TV or an unsigned-in desktop web
browser from their phone. Both targets display the same short-lived QR code and
human-readable code; the phone may scan the QR or accept manual entry, then shows
an explicit account confirmation before the target receives its own session.

## Behavior Change

- Before: TV displays only a verification address and code, approval happens on the
  `/tv` web page, and desktop web supports Google sign-in only.
- After: TV and signed-out desktop web both display a QR plus manual code. The phone
  opens one shared `/pair` approval page by scanning or entering the code; approval
  returns a native bearer session to TV or an HttpOnly Auth.js cookie to web.

## Acceptance Criteria

- [x] `AC-CHG-20260820-0cdee47b-01`: Given an unsigned-in TV or desktop web target,
  when pairing starts, then the target displays a scannable QR, the same short code,
  a manual verification address, expiry feedback, and a retry action.
- [x] `AC-CHG-20260820-0cdee47b-02`: Given a valid target challenge, when the listener
  scans its QR or enters its code on a phone and explicitly confirms the account,
  then TV receives one native bearer session or web receives one secure HttpOnly
  cookie and continues to its internal callback path.
- [x] `AC-CHG-20260820-0cdee47b-03`: Given an unapproved, expired, unknown, malformed,
  replayed, or target-mismatched challenge, when it is polled or approved, then no
  session is issued and no secret device credential is exposed in QR or UI.
- [x] `AC-CHG-20260820-0cdee47b-04`: Given an existing `/tv?code=...` link, when it is
  opened, then it reaches the shared phone approval experience without losing the
  code.

## Impact

- Contracts: Generalize the TV challenge response with target kind, complete
  verification URL, and QR image URL; add same-origin web start/consume routes.
- Data/migration: Reuse the Auth.js verification-token table and existing prefixed
  rows; no schema migration or production data rewrite.
- Security/privacy: QR contains only the short user code and public verification
  URL. The high-entropy device credential stays on the target, approval requires an
  authenticated phone session and explicit confirmation, and consumption is atomic.

## Risks

- A stolen short code could prompt the wrong account: approval identifies the target
  kind and requires a deliberate confirmation; codes expire after ten minutes.
- A target-kind confusion could mint the wrong transport: store the intended kind in
  the pending row and require the matching consume endpoint before issuing a session.
- A web response could create an insecure cookie: use the Auth.js cookie name/salt,
  HttpOnly, SameSite=Lax, Secure on HTTPS, bounded Max-Age, and same-origin polling.
- A QR could leak the device credential: generate it only from `/pair?code=...` and
  regression-test that the secret never appears in verification or image URLs.

## Rollout and Recovery

- Rollout: Ship the shared phone approval page and APIs with the updated web login and
  TV UI; existing Google sign-in remains available on web.
- Rollback/recovery: Remove the QR/device-pairing UI and new generic routes while
  retaining Google sign-in and the legacy `/tv` redirect. Expired prefixed rows can
  be deleted without affecting Auth.js sessions.

## Plan

- [x] Reconcile the identity spec and pairing contracts.
- [x] Implement shared pairing APIs, phone approval, web target and TV QR UI.
- [x] Add negative/replay/target-binding tests and web interaction coverage.
- [x] Run Critical verification and fresh-context security review.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Pairing unit tests | pass | 18/18 focused tests: target binding, QR secrecy, cookie flags, callback canonicalization, approval, replay and expiry |
| Web browser QA | pass | Desktop `/login` and phone `/pair` inspected with no console errors; isolated Playwright pairing flow passed as part of 6/6 tests |
| Android TV QA | pass | Universal debug APK built successfully; API 36 TV AVD accessibility tree showed QR, manual code, `/pair` address and waiting state within 1920x1080; pending polling and remote QR load succeeded |
| `python scripts/verify.py` | pass | SDD check, 14 test files / 143 tests, production Next build, web/mobile lint and typecheck, and Rust clippy passed on 2026-08-20 |

## Open Questions

- None. The user explicitly clarified on 2026-08-20 that TV and web both display QR
  while the phone handles scanning/manual entry and approval.

## Review

- Decision: approved by the user / decision owner on 2026-08-20
- Fresh-context review: approved on 2026-08-20 after the callback URL was
  canonicalized and regression-tested; no remaining pairing code/security blocker.
