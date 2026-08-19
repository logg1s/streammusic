# YouTube discovery and radio specification

Spec-ID: DISCOVERY
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Expose YouTube music metadata alongside the personal library and extend listening
sessions with YouTube up-next queues without resolving audio on the server.

## Invariants

- Server-side YouTube integration is metadata-only; native audio resolution stays on device.
- Radio seeds are YouTube tracks and duplicate/blocked tracks are not re-added client-side.
- Optional credentials enrich discovery but their absence must not break core library playback.

## Requirements

## `DISCOVERY-001` — Search and cache YouTube metadata

### Rule

Authenticated search queries fetch song/video metadata, interleave de-duplicated
results, persist reusable YouTube track rows, and return `PlayableTrack` values whose
IDs are prefixed with `yt:`. Search result caching is short-lived and in-memory.

### Acceptance criteria

- `AC-DISCOVERY-001-01`: Given a non-empty query, when YouTube search succeeds, then de-duplicated playable metadata is returned and cached for reuse.
- `AC-DISCOVERY-001-02`: Given a repeated query inside the cache lifetime, when search runs, then the cached metadata result can be returned.
- `AC-DISCOVERY-001-03`: Given song and general-video hits for the same video ID, when results are merged, then only one result remains with the preferred ordering.

### Evidence

- Code-confirmed: YouTube search route, [music metadata client](../../../src/lib/youtube/music.ts), [metadata store](../../../src/lib/youtube/store.ts), and shared track conversion.
- Unit-test-confirmed: [merge tests](../../../src/lib/youtube/merge.test.ts) and [track tests](../../../packages/shared/src/track.test.ts).
- Network test gap: live YouTube responses were not exercised during adoption.

## `DISCOVERY-002` — Home, trending, and optional taste

### Rule

The home endpoint combines personal sections derived from recent play seeds with
global YouTube Music sections. A linked read-only YouTube account can import likes,
subscriptions, and playlists as taste metadata. Trending returns an empty list when
`YOUTUBE_API_KEY` is absent; global sections are cached for six hours.

### Acceptance criteria

- `AC-DISCOVERY-002-01`: Given an authenticated listener, when YouTube home loads, then available personal sections precede available global sections.
- `AC-DISCOVERY-002-02`: Given no YouTube API key, when trending loads, then it returns an empty track list instead of failing the page.
- `AC-DISCOVERY-002-03`: Given a linked read-only YouTube account, when taste sync runs, then imported artist/video signals are stored for that user only.

### Evidence

- Code/schema-confirmed: YouTube home/trending routes, [taste synchronization](../../../src/lib/youtube/taste.ts), [account lifecycle](../../../src/lib/youtube/account.ts), and taste tables.
- Test gap: personalized home, quota fallback, and linked-account sync have no application-level automated coverage.

## `DISCOVERY-003` — Radio queue lifecycle

### Rule

Radio starts from a YouTube seed, disables shuffle/repeat, keeps the current track
playing when it is the seed, and requests YouTube up-next metadata. Continuations
refill near queue end; client state filters queued and blocked IDs. Stopping radio
stops future refills but keeps already-added tracks.

### Acceptance criteria

- `AC-DISCOVERY-003-01`: Given a YouTube seed, when radio starts, then the seed remains or becomes current and radio enters a loading state with shuffle/repeat disabled.
- `AC-DISCOVERY-003-02`: Given a continuation and a nearly exhausted queue, when refill succeeds, then only fresh tracks are appended and continuation state advances.
- `AC-DISCOVERY-003-03`: Given radio is stopped, when queued recommendations remain, then they stay playable but no new radio pages are requested.
- `AC-DISCOVERY-003-04`: Given repeated refill failures, when retry policy is applied, then delay is bounded and quota/network exhaustion is represented separately.

### Evidence

- Code-confirmed: radio API route, [radio client](../../../packages/shared/src/radio-client.ts), [radio engine](../../../packages/shared/src/radio-engine.ts), and player-store radio state.
- Unit/soak-test-confirmed: [radio client tests](../../../packages/shared/src/radio-client.test.ts), [player-store tests](../../../packages/shared/src/player-store.test.ts), and [long-session soak test](../../../packages/shared/src/radio-soak.test.ts).

## `DISCOVERY-004` — Listening history and session-local feedback

### Rule

Authenticated clients record play outcomes separately from anonymous telemetry.
Library or YouTube source is represented by exactly one reference. An intentional
YouTube skip adds a session-local blocked-track tombstone so later continuations do
not re-add it; engine errors do not create that tombstone. A legacy authenticated
`/api/radio/feedback` compatibility contract can still accumulate user/video/artist
counters, but no tracked current client calls it and the current radio route does not
read it.

### Acceptance criteria

- `AC-DISCOVERY-004-01`: Given a completed or partial play, when play history is submitted, then exactly one library or YouTube source is stored for the current user.
- `AC-DISCOVERY-004-02`: Given an intentional YouTube skip, when client reporting runs, then the track is blocked for the current radio session and a later continuation cannot re-add it.
- `AC-DISCOVERY-004-03`: Given an automatic advance caused by playback error, when client reporting runs, then it is not treated as an intentional session block.
- `AC-DISCOVERY-004-04`: Given a valid direct request to the legacy feedback endpoint, when it is submitted, then matching user/video and optional artist counters are incremented even though current clients do not use that path.

### Evidence

- Code/schema-confirmed: play/legacy-feedback routes, exact-one-source database checks,
  session blocking in the radio client, and error markers in web/Windows/Android engines.
- Unit-test-confirmed: radio client reporting decisions are covered in [radio client tests](../../../packages/shared/src/radio-client.test.ts).
- Compatibility note: the legacy feedback endpoint/table remains for older clients,
  while the unused ranked-radio service has been removed. Its `radio_seeds` table is
  retained until a separately approved data migration removes it.

## Connections

- Produces YouTube `PlayableTrack` values for [playback](../playback/spec.md).
- YouTube tracks can be saved by the [collections domain](../collections/spec.md).
