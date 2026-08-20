# Playback specification

Spec-ID: PLAYBACK
Owner: Vong maintainers
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Maintain one cross-shell queue and route the selected track through the correct web
or native audio engine while preserving transport controls and recoverable state.

## Invariants

- At most one audio source is audible at any time.
- YouTube audio URLs for native playback are resolved on the listener's device.
- The Vong bearer credential is sent to library endpoints and never to googlevideo.
- Every native googlevideo byte request carries a `Range` header.

## Requirements

## `PLAYBACK-001` — Queue and transport behavior

### Rule

The shared player holds tracks, an explicit play order, current position, play state,
time, volume/mute, shuffle, repeat, autoplay, errors, and optional radio state. New
queues start playing; next/previous, seeking, repeat, shuffle, insertion, removal,
and reordering update the queue without corrupting track identity.

### Acceptance criteria

- `AC-PLAYBACK-001-01`: Given a non-empty track list, when it becomes the queue, then the selected track becomes current and playback is requested.
- `AC-PLAYBACK-001-02`: Given a current track more than three seconds in, when previous is requested, then playback seeks to its start instead of changing tracks.
- `AC-PLAYBACK-001-03`: Given repeat-one at track end, when end is handled, then the same track restarts; given repeat-all at queue end, then the first ordered track starts.
- `AC-PLAYBACK-001-04`: Given queue mutations, when a track is inserted, removed, or moved, then the order remains valid and duplicate insertions are ignored.
- `AC-PLAYBACK-001-05`: Given a non-empty queue, when a listener opens it on web
  or Android phone, then upcoming tracks appear in an independent scrollable
  drawer or sheet without requiring the listener to scroll past Now Playing.

### Evidence

- Code-confirmed: [shared player store](../../../packages/shared/src/player-store.ts).
- Unit-test-confirmed: [player-store tests](../../../packages/shared/src/player-store.test.ts) cover queue, transport, seeking, shuffle, mutations, radio state, and persistence helpers.
- E2E-confirmed: [web flow](../../../e2e/web/vong.spec.ts) exercises play, pause visibility, next, seek, and playback across a background tab.

## `PLAYBACK-002` — One active engine per shell and source

### Rule

After runtime hydration, Windows mounts only the Tauri native engine. The web runtime
mounts its library audio pool and YouTube iframe, with source-switch logic pausing the
inactive path. Android uses its Media3 native module and does not mount the web audio
engines. Engine failure handling stops or pauses the old sink before advancing.

### Acceptance criteria

- `AC-PLAYBACK-002-01`: Given the Tauri runtime, when playback engines mount, then the web audio pool and YouTube iframe engines are not mounted.
- `AC-PLAYBACK-002-02`: Given web playback changes between library and YouTube sources, when the new source starts, then the previously active source is paused.
- `AC-PLAYBACK-002-03`: Given a native load failure after old audio was retained, when recovery advances, then the old native sink is stopped before another track can play.

### Evidence

- Code-confirmed: [engine selection](../../../src/components/player/playback-engines.tsx), web audio/YouTube engines, [Windows engine](../../../src/components/player/native-audio-engine.tsx), and [Android engine](../../../mobile/src/components/player/playback-engine.tsx).
- Test gap: no automated assertion directly measures simultaneous audible sources.

## `PLAYBACK-003` — Native YouTube resolution and ranged reads

### Rule

Windows and Android resolve YouTube audio on device using the shared resolver, omit
Vong authorization when requesting googlevideo, and force a Range header on every
native byte request. Current Rust and Android readers inject open-ended
`bytes=N-` ranges; downstream HTTP stacks may tighten them.

### Acceptance criteria

- `AC-PLAYBACK-003-01`: Given a YouTube track in a native shell, when its media URL is needed, then resolution is performed by the device rather than a server API.
- `AC-PLAYBACK-003-02`: Given a googlevideo request, when headers are built, then a Range header is present and the Vong bearer token is absent.
- `AC-PLAYBACK-003-03`: Given an expired googlevideo URL or recoverable authorization failure, when playback retries, then the relevant URL or session credential is refreshed before bounded retry/advance behavior.

### Evidence

- Code-confirmed: [shared resolver](../../../packages/shared/src/player-request.ts), [mobile URL mapping](../../../mobile/src/lib/resolve.ts), [Android range data source](../../../mobile/modules/vong-audio/android/src/main/java/app/vong/audio/RangeForcingDataSource.kt), and [Rust reader](../../../src-tauri/src/audio.rs).
- Device test gap: real googlevideo playback and expiration recovery were not exercised.

## `PLAYBACK-004` — Native background and system controls

### Rule

Windows exposes playback state/metadata through SMTC. Android phone and TV use the
same Media3 service, MediaSession, notification/remote controls, and a native queue
containing the current and next item so playback can continue while the UI changes
or the app is backgrounded. The TV shell mounts no second playback engine.

### Acceptance criteria

- `AC-PLAYBACK-004-01`: Given native playback, when play state or metadata changes, then the shell updates its operating-system media session.
- `AC-PLAYBACK-004-02`: Given Android playback in the background, when lock-screen or notification transport controls are used, then the native queue reports changes back to JavaScript state.
- `AC-PLAYBACK-004-03`: Given Windows playback while minimized, when SMTC transport controls are used, then Tauri events update the shared player state.
- `AC-PLAYBACK-004-04`: Given Android TV playback, when the listener uses D-pad transport controls or a hardware media key, then the existing Media3 session changes state without mounting another audible source.
- `AC-PLAYBACK-004-05`: Given native Android playback with bearer-backed items queued, when the listener signs out, then Media3 and the shared queue are cleared before the bearer session is removed.
- `AC-PLAYBACK-004-06`: Given Android TV playback, when Now Playing and its queue
  are opened, then transport controls do not cover content, hardware Back returns
  to browsing, and visible actions expose an unambiguous D-pad focus state.

### Evidence

- Code-confirmed: [Tauri commands/events](../../../src-tauri/src/lib.rs), [Windows SMTC](../../../src-tauri/src/smtc.rs), [Android bridge](../../../mobile/modules/vong-audio/index.ts), and Android native service/module.
- Emulator-confirmed: the Android TV API 36 emulator played a ranged local fixture
  through Media3, exposed its metadata through MediaSession, and changed from
  `PLAYING` to `PAUSED` and back through hardware media key events.
- Test gap: background survival and OS controls still require a physical TV/device
  verification pass before a future Play Store submission.

## Connections

- Consumes library streams from the [library domain](../library/spec.md).
- Extends queues through the [discovery domain](../discovery/spec.md).
- Emits anonymous playback telemetry through the [operations domain](../operations/spec.md).
