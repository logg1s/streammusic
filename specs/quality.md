# Quality expectations

Owner: Vong maintainers
Status: current baseline
Last-Reviewed: 2026-08-19

## Security and privacy

- Every user-owned API read/write must resolve a session and scope its database query
  to that user. Native library streaming must carry the Vong bearer token.
- Provider and linked-account tokens are encrypted at rest. OAuth state and native
  handoff codes must remain bounded, validated, and single-use where specified.
- Analytics must remain detached from user identity and pass through the shared event
  allowlist and property sanitizer. Changes to the allowlist require a Google Play
  Data safety review before the next submission.

## Reliability and recovery

- Preserve the one-audible-source invariant during engine switches and failures.
- Keep scan work resumable through persisted jobs/items; a provider or file failure
  must be represented in scan state instead of corrupting completed items.
- Expired/revoked provider credentials transition to reauthorization. Playback and
  telemetry failures must not be mistaken for successful playback.

## Performance and capacity

- Metadata reads use HTTP ranges rather than full-file downloads.
- Web Google Drive streaming uses a larger first chunk and smaller later chunks to
  bound function lifetime while preserving time-to-first-audio.
- Verification does not establish production latency or capacity targets; those
  remain unconfirmed operational requirements.

## Accessibility and user experience

- Player controls expose accessible names and keyboard-operable controls where the
  existing web end-to-end suite addresses them.
- User-facing strings remain Vietnamese across supported surfaces.
- Full WCAG conformance and assistive-technology coverage are not established by the
  current automated suite and remain an explicit assumption boundary.

## Verification

- Standard repository verification is `npm run verify:local`.
- It covers web/shared typecheck and lint, unit tests, production Next.js build,
  mobile typecheck and lint, and Rust clippy.
- User-flow or playback changes additionally need the relevant browser/native checks;
  `npm run e2e:all` requires local Neon, browser, Android, and Windows prerequisites.
