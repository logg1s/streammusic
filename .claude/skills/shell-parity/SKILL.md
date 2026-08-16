---
name: shell-parity
description: Verify web, Android and Windows agree — compare packages/shared against each shell's consumer, API responses against client expectations, and native bridge signatures against their TypeScript callers. Use after changing shared logic, after adding or changing an API route, before a release, when a feature works on one shell but not another, or when a track plays silently.
---

# Shell parity

Vong is one core behind three shells, so the bugs live at boundaries. The method is always
the same: **open both sides and compare shapes**. Confirming that one side exists proves
nothing.

## The boundaries

| Boundary | Side A | Side B |
| --- | --- | --- |
| Store ↔ engines | `packages/shared/src/player-store.ts` | `src/components/player/*.tsx`, `mobile/src/components/player/playback-engine.tsx`, `src-tauri/src/player.rs` |
| Radio ↔ controllers | `packages/shared/src/radio-client.ts` | `src/components/player/radio-controller.tsx`, `mobile/src/components/player/radio-controller.tsx` |
| API ↔ clients | `src/app/api/**/route.ts` | the type each caller destructures |
| Native module ↔ bridge | `mobile/modules/vong-audio/**/*.kt` | the TS declarations calling `VongAudio` |
| Shared exports | `packages/shared/src/index.ts` | every importer |
| Telemetry | `ANALYTICS_EVENTS`, `sanitizeProps` | `src/app/api/events/route.ts`, both provider components |

`packages/shared/src/index.ts` lists exports explicitly rather than re-exporting, because
the ESM loader must know export names at link time. **A new export not added there fails
at runtime with a SyntaxError, not at typecheck** — check this whenever shared grows.

## Commands — run them, do not predict them

```bash
npm run typecheck && npx eslint . && npm test    # web + shared
cd mobile && npx tsc --noEmit && npx eslint .    # mobile
cd src-tauri && cargo clippy                     # Rust
```

The root typecheck **excludes** `mobile/` and `src-tauri/`. A green root build says
nothing about two of the three shells — this is the single most common way a change looks
verified and is not.

## Reading a boundary

1. Open both sides in the same pass.
2. Compare field names and types literally: `durationSec` versus `duration_sec`,
   `number | null` versus optional, seconds versus milliseconds.
3. Check the empty and error paths, not just the happy one. What does the client render
   when the route returns `[]`, `204`, or `401`?
4. For the native bridge, compare Kotlin parameter names and nullability against the TS
   declaration — a mismatch here fails silently at runtime rather than at build.

## Behaviour needs a device

Background playback, MediaSession, lockscreen controls, gapless transition and scrubbing
cannot be verified by reading. Use the `verify-android` skill on an emulator or device.

## Silence is a symptom

The characteristic failure in this app is not a crash but a track that plays nothing:

| Symptom | First place to look |
| --- | --- |
| Library track silent on a native shell | Missing `Authorization: Bearer` → 401 |
| YouTube track silent everywhere | Expired googlevideo URL (~6 h) or a blocked embed (101/150) |
| YouTube track silent on server-rendered paths | Resolution attempted server-side → `LOGIN_REQUIRED` |
| 403 mid-track | A request without a bounded `Range` header |
| Native Next does nothing | Next track missing from the native queue (it holds current + next only) |

Treat "nothing happened" as a lead, never as a pass.

## Reporting

Per finding: the boundary, both sides quoted with `file:line`, the input that breaks it,
observed versus expected. Then list which shells you actually verified and which you did
not — an unverified shell reported as fine is worse than no report at all.
