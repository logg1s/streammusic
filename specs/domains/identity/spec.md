# Identity and connections specification

Spec-ID: IDENTITY
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Authenticate listeners, issue web/native sessions, and manage each listener's
authorized storage and optional YouTube accounts without crossing ownership bounds.

## Invariants

- Storage access is requested separately from primary application sign-in.
- User-owned records are read or mutated only after resolving the current user ID.
- Provider access and refresh tokens are encrypted before database persistence.
- A native handoff code can be exchanged at most once and expires after 120 seconds.
- A TV pairing challenge exposes only a short user code, stores the high-entropy device credential as a hash, and mints no session before authenticated approval.

## Requirements

## `IDENTITY-001` — Google application sign-in

### Rule

The web application signs listeners in through Google and uses an Auth.js JWT session.
The login flow requests account selection, while storage/YouTube permissions remain in
separate connection flows.

### Acceptance criteria

- `AC-IDENTITY-001-01`: Given a signed-out listener, when a protected web page is opened, then the listener can reach the Google sign-in action.
- `AC-IDENTITY-001-02`: Given a valid Google application session, when a protected API resolves identity, then it receives the session subject as the Vong user ID.

### Evidence

- Code-confirmed: [Auth.js configuration](../../../src/lib/auth.ts).
- Test-confirmed: the login boundary and authenticated library page are exercised in [web E2E](../../../e2e/web/vong.spec.ts).

## `IDENTITY-002` — One identity path for web and native API access

### Rule

Protected API routes accept either the Auth.js session cookie used by web clients or
an equivalent `Authorization: Bearer` JWT used by native clients. Missing identity is
rejected, and user-owned queries include the resolved user ID.

### Acceptance criteria

- `AC-IDENTITY-002-01`: Given a valid web cookie or native bearer token, when a protected route resolves identity, then both transports produce the owning user ID.
- `AC-IDENTITY-002-02`: Given no valid session, when a protected operation runs, then it returns an unauthorized outcome without exposing another user's data.

### Evidence

- Code-confirmed: [identity resolution](../../../src/lib/auth.ts), [HTTP error mapping](../../../src/lib/http.ts), and ownership predicates throughout library/collection services.
- Test gap: no dedicated integration test covers bearer/cookie equivalence or cross-user denial.

## `IDENTITY-003` — Native session handoff

### Rule

A listener authenticated in the system browser can authorize a native shell through a
random 120-second database-backed code. Exchanging the code deletes it atomically and
returns a native session JWT with the Auth.js default 30-day lifetime.

### Acceptance criteria

- `AC-IDENTITY-003-01`: Given a valid unused handoff code, when a native shell exchanges it, then it receives one bearer session and the code is consumed.
- `AC-IDENTITY-003-02`: Given an expired, missing, or previously consumed code, when exchange is attempted, then no session is issued.

### Evidence

- Code-confirmed: [handoff implementation](../../../src/lib/native-handoff.ts), [token minting](../../../src/lib/session-token.ts), and native auth routes.
- Test gap: timeout, concurrency, and replay behavior are not covered by repository tests.

## `IDENTITY-004` — Storage and YouTube account lifecycle

### Rule

A listener may connect Google Drive, Dropbox, or OneDrive accounts and optionally a
read-only YouTube account. Tokens are encrypted at rest, refreshed before expiry when
possible, and marked as needing reauthorization when refresh can no longer recover.

### Acceptance criteria

- `AC-IDENTITY-004-01`: Given a successful provider OAuth callback, when the account is stored, then credentials are encrypted and the connection is owned by the current user.
- `AC-IDENTITY-004-02`: Given an expiring token with a usable refresh token, when provider access is needed, then the token is refreshed and the stored credential is updated.
- `AC-IDENTITY-004-03`: Given revoked or unrecoverable credentials, when refresh is attempted, then the account transitions to a reauthorization state.

### Evidence

- Code/schema-confirmed: [connection lifecycle](../../../src/lib/connections.ts), [provider contract](../../../src/lib/providers/types.ts), [YouTube account lifecycle](../../../src/lib/youtube/account.ts), and [database schema](../../../src/db/schema.ts).
- Test gap: real provider OAuth/refresh flows were not executed during adoption.

## `IDENTITY-005` — Limited-input TV pairing

### Rule

A signed-out TV requests a ten-minute pairing challenge and displays its short user
code plus the Vong verification address. A listener signs in on a separate browser,
confirms that code, and the TV polls with its high-entropy device credential. The
database stores only the credential hash, and successful exchange deletes the
approved record atomically before issuing the standard native bearer session.
Challenge creation is atomically bounded per client and globally in one-minute
database-backed windows; raw client addresses are not stored.

### Acceptance criteria

- `AC-IDENTITY-005-01`: Given an unapproved, unknown, or expired TV challenge, when the token endpoint is polled, then no session is issued.
- `AC-IDENTITY-005-02`: Given an authenticated listener approves the displayed code, when the matching TV next polls, then it receives the approving listener's native session.
- `AC-IDENTITY-005-03`: Given an approved challenge has already been exchanged, when the device credential is replayed, then no second session is issued.
- `AC-IDENTITY-005-04`: Given repeated unauthenticated challenge starts, when the per-client or global minute budget is exhausted, then no additional challenge row is created and the endpoint returns a retryable 429.

### Evidence

- Code-confirmed: [TV pairing service](../../../src/lib/tv-pairing.ts), [pairing page](../../../src/app/tv/page.tsx), and TV native routes.
- Unit-test-confirmed: [TV pairing tests](../../../src/lib/tv-pairing.test.ts) cover hashing, approval, expiry, unknown credentials, unapproved polling, concurrent consume, replay denial, and per-client throttling.

## Connections

- Supplies identity and provider authorization to the [library domain](../library/spec.md).
- Supplies optional taste identity to the [discovery domain](../discovery/spec.md).
