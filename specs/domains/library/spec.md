# Library specification

Spec-ID: LIBRARY
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Index a listener's remote audio files as metadata, expose a user-scoped library, and
stream the original bytes from their storage provider.

## Invariants

- Vong stores metadata and provider references, not a second canonical media copy.
- Every library query and stream lookup is scoped to the owning user.
- Metadata extraction uses range reads; unchanged remote revisions are skipped.
- Native library stream requests carry `Authorization: Bearer`.

## Requirements

## `LIBRARY-001` — Select remote scan roots

### Rule

A listener can browse folders for one of their active storage connections and add or
remove selected roots. Root identity is unique per connection and owned transitively
through that connection.

### Acceptance criteria

- `AC-LIBRARY-001-01`: Given an owned active connection, when its folders are browsed, then the provider's folders are returned for selection.
- `AC-LIBRARY-001-02`: Given a selected remote folder, when it is saved twice for the same connection, then only one scan-root record exists.
- `AC-LIBRARY-001-03`: Given an unowned connection, when roots are read or changed, then no other user's roots are exposed or mutated.

### Evidence

- Code/schema-confirmed: connection folder/root routes, [provider contract](../../../src/lib/providers/types.ts), and [scan root uniqueness](../../../src/db/schema.ts).
- Test gap: folder-provider integrations and ownership denial are not covered by automated tests.

## `LIBRARY-002` — Persisted, incremental library scanning

### Rule

Starting a scan persists a job and its remote audio items. Processing occurs in
bounded API batches (default 25, maximum 100) with eight concurrent metadata reads.
Items whose stored remote revision is unchanged are marked skipped; each job records
processed, skipped, failed, completed, cancelled, or failed state as applicable.

### Acceptance criteria

- `AC-LIBRARY-002-01`: Given selected scan roots, when a scan starts, then provider audio files become persisted scan items before metadata processing.
- `AC-LIBRARY-002-02`: Given a remote file with the same revision as its existing track, when its item is processed, then it is skipped without rewriting metadata.
- `AC-LIBRARY-002-03`: Given remaining items, when a step request completes, then counters and terminal/non-terminal job state reflect the processed batch.

### Evidence

- Code/schema-confirmed: [scanner](../../../src/lib/scanner.ts), scan routes, and [scan job/item tables](../../../src/db/schema.ts).
- Test gap: batch resumption and partial provider failures have no dedicated application test.

## `LIBRARY-003` — User-scoped browse and search

### Rule

Authenticated listeners can browse home summaries, tracks, albums, and artists, and
search their own indexed tracks/albums. Track IDs are UUIDs; YouTube IDs are not
accepted as library track IDs.

### Acceptance criteria

- `AC-LIBRARY-003-01`: Given indexed library data, when the owner opens library surfaces, then only their tracks, albums, artists, counts, and recent items are returned.
- `AC-LIBRARY-003-02`: Given a search query, when library search runs, then matching owned tracks and albums are returned with bounded result counts.
- `AC-LIBRARY-003-03`: Given an empty query, when library search runs, then it returns empty result sets instead of an unbounded library.

### Evidence

- Code-confirmed: [library service](../../../src/lib/library.ts) and library API routes.
- Test-confirmed: authenticated browsing and library search are exercised by [web E2E](../../../e2e/web/vong.spec.ts).

## `LIBRARY-004` — Stream original provider bytes

### Rule

The stream endpoint authorizes track ownership, reuses valid temporary links, and
returns a 302 redirect for redirect-capable providers. Google Drive is proxied with
its authorization header and browser ranges are capped to 6 MiB for the first chunk
and 2 MiB for later chunks when file size is known. HEAD uses stored metadata only.

### Acceptance criteria

- `AC-LIBRARY-004-01`: Given an unowned or invalid track ID, when stream GET or HEAD is requested, then the endpoint does not disclose provider data.
- `AC-LIBRARY-004-02`: Given a redirect stream target, when playback starts, then the client receives a temporary redirect and media bytes bypass the Vong server.
- `AC-LIBRARY-004-03`: Given a proxy stream target with known size, when bytes are requested, then the upstream and response range are bounded and advertise the true total size.
- `AC-LIBRARY-004-04`: Given a native library track, when its media request is built, then the Vong bearer header is attached.

### Evidence

- Code-confirmed: [stream source ownership](../../../src/lib/stream-source.ts), [stream route](../../../src/app/api/stream/[trackId]/route.ts), native mobile resolver, and Windows track requests.
- Test-confirmed only at flow level: [web E2E](../../../e2e/web/vong.spec.ts) starts library playback; provider redirects/range sizes are not asserted.

## Connections

- Requires sessions and provider credentials from the [identity domain](../identity/spec.md).
- Produces playable library tracks for the [playback domain](../playback/spec.md).
