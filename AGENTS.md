<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vong — project rules

## Language

- **Commit messages, docs, README, and release notes: English.**
- **Replies to the user: Vietnamese.**
- **User-facing UI strings stay Vietnamese** — that is the product language.
- Existing Vietnamese code comments are intentional; don't mass-translate them.
  New comments may be English.

## Layout

npm workspaces. Next.js web app at the repo root; `packages/shared/` (store,
radio client, YouTube resolver — used by all three shells); `src-tauri/`
(Windows, Rust audio); `mobile/` (Expo Android app + `vong-audio` native
module). `mobile/` has its own tsconfig/eslint; root `tsc --noEmit` excludes
`mobile` and `src-tauri`.

## Hard invariants

- At most ONE audio source audible at any time (audio pool vs YouTube iframe
  vs native engine — see comments in `src/components/player/`).
- YouTube audio URLs resolve **on the user's device only**; server IPs get
  `LOGIN_REQUIRED`. Server-side InnerTube is metadata-only.
- googlevideo returns 403 unless every request has a `Range` header spanning
  ≤ 1 MiB (`src-tauri/src/audio.rs`, `RangeForcingDataSource.kt`).
- Library streaming from native shells carries `Authorization: Bearer`.
- Never hand-edit `mobile/android/` — it's generated; change config plugins in
  `mobile/plugins/` and re-run `npx expo prebuild`.
- The keystore `mobile/credentials/vong-release.jks` is irreplaceable.

## Product process

*What* to build is decided in `docs/product/` — roadmap, scored backlog, metric
definitions, telemetry catalogue, PRD and weekly-review templates. Read
`docs/product/README.md` before adding a feature; it carries the Definition of Ready and
Definition of Done. Metric queries live in `scripts/metrics/`.

Any change to `ANALYTICS_EVENTS` (`packages/shared/src/analytics.ts`) must update
`docs/product/telemetry.md` in the same commit, and the Google Play Data safety
declaration before the next store submission.

## Harness

**Trigger:** for work larger than a single edit — planning a cycle, deciding what to build,
shipping a feature end to end — use the `vong-harness` skill. It orchestrates the eight
agents in `.claude/agents/`. Simple questions and one-file edits need no harness.

**Change log:**

| Date | Change | Target | Why |
| --- | --- | --- | --- |
| 2026-08-16 | Initial harness — 8 agents, 8 skills | `.claude/` | Product decisions and the hard invariants both depended on whoever happened to be reading |
| 2026-08-16 | Product process moved into the repo | `docs/product/` | The roadmap lived in assistant memory, unreadable to contributors |
| 2026-08-16 | Anonymous telemetry pipeline | `packages/shared`, `src/app/api/events` | Four stages shipped with no way to tell whether they worked |

## Workflows (see `.claude/skills/`)

| Task | Skill |
| --- | --- |
| Orchestrate a cycle / larger work | `vong-harness` |
| Plan, prioritise, write a PRD | `product-planning` |
| Weekly numbers and metric questions | `metrics-review` |
| Competitive research | `market-research` |
| Check the five hard invariants | `invariant-check` |
| Cross-shell boundary QA | `shell-parity` |
| Design token parity, visual review | `design-review` |
| Contributor-facing files, hygiene | `oss-readiness` |
| Deploy web to Vercel | `deploy-web` |
| Signed Android APK | `release-android` |
| Windows exe + installer | `release-windows` |
| Tag + publish binaries | `github-release` |
| Test on emulator/device | `verify-android` |

## Verification commands

```bash
npm run typecheck && npx eslint .                    # web + shared
cd mobile && npx tsc --noEmit && npx eslint .        # mobile
cd src-tauri && cargo clippy 2>&1 | grep -E "error|warning"  # Rust
```
