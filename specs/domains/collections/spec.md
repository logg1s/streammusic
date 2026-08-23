# Collections specification

Spec-ID: COLLECTIONS
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Let each listener save library and YouTube tracks as favorites or ordered playlists.

## Invariants

- Every favorite and playlist belongs to one user.
- Every collection item references exactly one library track or one YouTube track.
- Library references must resolve to a track owned by the current user.

## Requirements

## `COLLECTIONS-001` — Mixed playlists

### Rule

A listener can create a named playlist from library and YouTube IDs, optionally with
a radio seed label. Valid items are stored in requested order; reading a playlist
reconstructs both source types as one ordered list of playable tracks.

### Acceptance criteria

- `AC-COLLECTIONS-001-01`: Given valid owned library IDs and existing YouTube IDs, when a playlist is created, then each item stores exactly one source and preserves input order.
- `AC-COLLECTIONS-001-02`: Given a playlist owned by the current user, when it is opened, then mixed items are returned in numeric position order.
- `AC-COLLECTIONS-001-03`: Given an unowned playlist ID, when it is read, renamed, or deleted, then another user's playlist is not exposed or changed.

### Evidence

- Code/schema-confirmed: [playlist service](../../../src/lib/playlists.ts), playlist API routes, and exact-one-source/ownership schema relationships.
- E2E-confirmed: an existing playlist is listed in [web E2E](../../../e2e/web/vong.spec.ts).
- Test gap: mixed-source creation and cross-user denial are not directly tested.

## `COLLECTIONS-002` — Playlist item mutation

### Rule

An owner can append only valid, not-already-present track IDs; remove individual
items; and replace ordering using owned item IDs. Reordering uses a transaction and a
temporary negative position phase before assigning final contiguous positions.

### Acceptance criteria

- `AC-COLLECTIONS-002-01`: Given IDs already present in a playlist, when append is requested, then duplicates are ignored and only fresh valid IDs receive new positions.
- `AC-COLLECTIONS-002-02`: Given the complete owned item ID set, when reorder is requested, then positions become contiguous in the requested order.
- `AC-COLLECTIONS-002-03`: Given missing, duplicate, foreign, or incomplete item IDs, when reorder is requested, then the playlist is not partially reordered.
- `AC-COLLECTIONS-002-04`: Given an owned playlist is open on Android, when the listener drags a track by its handle and releases it, then the visible and persisted playlist order match the dropped order without starting playback.

### Evidence

- Code-confirmed: [playlist mutation service](../../../src/lib/playlists.ts) and playlist item routes.
- UI flow-confirmed: the track context menu exposes play-next, queue, and add-to-playlist actions in [web E2E](../../../e2e/web/vong.spec.ts).
- Test gap: transactional reorder recovery is not directly exercised.

## `COLLECTIONS-003` — Idempotent favorites

### Rule

A listener can favorite a valid owned library track or cached YouTube track. Database
uniqueness prevents duplicates per user/source. Removal is idempotent and includes
the user ID in the delete predicate.

### Acceptance criteria

- `AC-COLLECTIONS-003-01`: Given a valid track, when it is favorited more than once by the same user, then only one favorite exists and repeated requests succeed safely.
- `AC-COLLECTIONS-003-02`: Given an existing favorite, when its owner removes it repeatedly, then the result remains not-favorited without affecting other users.
- `AC-COLLECTIONS-003-03`: Given favorites from both sources, when the list is read, then each reference is reconstructed as a playable track in favorite creation order.

### Evidence

- Code/schema-confirmed: [favorites service](../../../src/lib/favorites.ts), favorites route, uniqueness indexes, and exact-one-source constraint.
- E2E-confirmed: add, remove, repeat add, and favorites-page visibility are covered by [web E2E](../../../e2e/web/vong.spec.ts).

## Connections

- Stores playable entities from [library](../library/spec.md) and [discovery](../discovery/spec.md).
- Collection items are consumed by [playback](../playback/spec.md).
