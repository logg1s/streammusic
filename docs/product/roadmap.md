# Roadmap

_Last updated: 2026-08-16_

## What Vong is

A personal music player that plays a user's own cloud library and YouTube through one
queue, with a recommendation engine good enough that the queue never has to be managed by
hand. Three shells — Android (Expo), web (Next.js), Windows (Tauri) — over one shared
core in `packages/shared`.

## Standing decisions

These were decided once and are not re-litigated each cycle. Changing one requires a note
in the change log at the bottom.

| Decision | Reason |
| --- | --- |
| **Android first**, then web, then Windows | Where the listening actually happens |
| **Autoplay/radio is the default**, with a toggle | The engine is the product; a queue that stops is a worse product |
| **Immersive, dark-first, artwork-forward design** across all shells | Competing with Spotify means looking like it belongs in the same category |
| **YouTube audio resolves on-device only** | Server IPs get `LOGIN_REQUIRED`; this is a hard constraint, not a preference |
| **Shared logic lives in `packages/shared`** | Three shells drifting apart is the failure mode that kills projects this size |

## Shipped

**v0.3.0 — 2026-08-16** ([release](https://github.com/logg1s/streammusic/releases/tag/v0.3.0))

1. **Android gapless in-app next** — the bridge routes to native `skipNext` when the
   target is the prepared tail.
2. **Broader search** — YT Music catalogue interleaved with full YouTube video search,
   which is where most Vietnamese content actually lives.
3. **Autoplay as default** — persisted flag, `autoplaySeed()` in shared, both radio
   controllers convert a near-empty normal queue into radio, single-track surfaces seed
   radio on tap.
4. **Design system unification** — one accent and neutral ramp across web and mobile,
   artwork-forward now-playing surfaces.
5. **Test suite** — vitest over parse / track / player-store / autoplay seed / search merge.

## Now

**Instrumentation.** The four stages above were shipped on judgement alone; there is no
evidence any of them worked. Until numbers exist, every further priority argument is two
people guessing.

- [x] Anonymous event pipeline: `analytics_events`, `POST /api/events`, shared client
- [x] Metric definitions and queries (`docs/product/metrics.md`, `scripts/metrics/`)
- [x] Settings opt-out switch on web and Android
- [x] All 11 events wired on web, Android and Windows. Playback events are derived from
      the player store by a shared subscriber rather than called from inside the engines —
      the engines are where invariant 1 lives and where the tripwire is blind
- [x] `analytics_events` live in production, ingest smoke-tested end to end
- [x] **v0.3.1 shipped on all three shells.** Every telemetry commit landed *after* the
      v0.3.0 tag, so the binaries users actually had emitted nothing. The baseline clock
      starts at this release, not at the merge
- [x] Google Play Data safety declaration updated for the 11 events
- [ ] Confirm real device events reach `analytics_events` — a smoke test from a dev
      machine is not proof that a shipped Android build reports
- [ ] Finer `origin` than radio-vs-queue (search / recent / album / playlist) — needs work
      at each play call site, deferred until the coarse split proves insufficient
- [ ] Four weekly reviews to establish baselines

CI now enforces what this project claims to enforce: `npm test`, `cargo clippy -D
warnings`, and the invariant tripwire, in four parallel jobs. Unverified on GitHub Actions
itself — the account is billing-locked, so it has only been run locally.

## Next

**Reliability of the thing that can break.** YouTube resolution is an unowned dependency.
Once `resolve_fail` has a baseline, decide whether it needs a fallback path.

## Later — deliberately not now

- Offline / download support. Large, and unjustified until retention says people return.
- Lyrics, casting, social features. All plausible; none evidenced.
- iOS. One more shell to keep in sync, with no distribution story.

## Change log

| Date | Change | Why |
| --- | --- | --- |
| 2026-08-16 | Roadmap moved out of assistant memory into the repo | An unreadable roadmap cannot be contributed to |
| 2026-08-16 | Instrumentation inserted ahead of new features | Four stages shipped with no way to tell if they worked |
