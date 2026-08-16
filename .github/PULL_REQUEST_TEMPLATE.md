## What this changes and why

<!-- One or two sentences. Link the issue this closes, if any. -->

## Shell(s) touched

- [ ] Web (`src/`)
- [ ] `packages/shared/`
- [ ] Windows (`src-tauri/`)
- [ ] Android (`mobile/`)
- [ ] Repo / CI / docs only

## Hard invariants (`AGENTS.md`)

Does this PR touch any of the five hard invariants?

- [ ] No
- [ ] Yes — which one(s), and how it's still satisfied:

<!-- 1. one audible audio source at a time
     2. YouTube audio URLs resolve on-device only, never on the server
     3. every googlevideo request carries a Range header ≤ 1 MiB
     4. native library streaming carries Authorization: Bearer
     5. mobile/android/ is generated — no hand edits -->

If checked, consider running the invariant script:
`node .claude/skills/invariant-check/scripts/check-invariants.mjs --diff origin/master`

## Verification

Which commands did you run, and on which shell(s)?

- [ ] `npm run typecheck && npx eslint .` (web + `packages/shared`)
- [ ] `cd mobile && npx tsc --noEmit && npx eslint .`
- [ ] `cd src-tauri && cargo clippy`
- [ ] `npm run test`
- [ ] Verified on a real Android device/emulator (required if `mobile/` changed playback or native code)

## Other notes

- [ ] If `ANALYTICS_EVENTS` (`packages/shared/src/analytics.ts`) changed, `docs/product/telemetry.md` was updated in this same PR.
- [ ] User-facing strings are Vietnamese; docs and commit message are English.

<!-- Anything a reviewer should know that isn't obvious from the diff. -->
