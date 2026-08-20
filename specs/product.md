# Product direction

Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Problem

People who already own music files in cloud storage, and also listen through
YouTube, need one personal library and player without uploading another copy of
their media. Browser-only playback cannot reliably continue while a native app is
backgrounded, and YouTube audio URLs cannot be resolved reliably from server IPs.

## Desired outcomes

- A listener can sign in, connect supported storage accounts, select folders, and
  build a browsable personal library from remote audio metadata.
- A listener can search, queue, seek, repeat, shuffle, favorite, and organize both
  library tracks and YouTube tracks where the relevant surface supports them.
- Web playback continues across in-app navigation; Windows, Android phone, and
  Android TV playback can continue through native audio engines and expose
  operating-system or remote media controls.
- Storage media remains at its provider. Redirect-capable providers send media
  directly to the client; Google Drive is proxied only because its media API needs
  an authorization header.
- YouTube audio resolution happens on the listener's device; the server handles
  metadata, search, home suggestions, and radio queue metadata only.

## Boundaries

- In: Google Drive, Dropbox, and OneDrive connections; metadata scanning; personal
  library browsing; playback across web, Windows, Android phone, and Android TV;
  D-pad-first TV navigation and phone-assisted QR/code pairing for TV and web; YouTube discovery;
  radio queues; favorites; playlists; product telemetry; native update discovery.
- Out: uploading or hosting a second canonical copy of a listener's media;
  server-side YouTube audio resolution; selling media or subscriptions; public
  library sharing and collaborative playlists.
- Adoption assumption: public sharing and collaboration are treated as current
  non-goals because no route, schema, UI, or test implements them. Product intent
  beyond the repository baseline has not been independently confirmed.

## Constraints

- A listener must never hear more than one playback source at once. This is
  code-confirmed in the engine-selection and source-switching logic, and partially
  exercised by player and end-to-end tests.
- Native library streaming must carry `Authorization: Bearer`; ownership is checked
  again on the server before a track can be streamed. This is code-confirmed.
- Every native googlevideo byte request carries a `Range` header. Current Rust and
  Android readers inject open-ended `bytes=N-` ranges; downstream HTTP stacks
  may replace them with tighter ranges.
- Storage tokens and linked YouTube tokens are encrypted at rest. User-scoped
  records and routes must preserve tenant ownership. These are code/schema-confirmed
  but do not currently have dedicated integration tests in this repository.
- Database changes use generated and committed Drizzle migrations. The repository
  workflow explicitly forbids `db:push`.
- Product telemetry is anonymous by design, must not contain music/search content,
  and must never interrupt playback. This is code- and unit-test-confirmed.

## Evidence and confidence

- Product claims above are derived from [application documentation](../README.md),
  [database contracts](../src/db/schema.ts), API routes, shared player contracts,
  native engine code, unit tests, and [web end-to-end tests](../e2e/web/vong.spec.ts).
- No production service, provider account, physical device, or deployed endpoint was
  exercised during adoption. Provider behavior, background playback on real devices,
  and production scale remain operational assumptions unless covered by a later run.
