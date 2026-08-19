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
- Every googlevideo byte request from a native shell must carry a `Range` header;
  the current readers use open-ended `bytes=N-` ranges
  (`src-tauri/src/audio.rs`, `RangeForcingDataSource.kt`).
- Library streaming from native shells carries `Authorization: Bearer`.
- Never hand-edit `mobile/android/` — it's generated; change config plugins in
  `mobile/plugins/` and re-run `npx expo prebuild`.
- The keystore `mobile/credentials/vong-release.jks` is irreplaceable.
- Schema changes go through `db:generate` + `db:migrate`. **Not `db:push`** — it
  leaves no migration file and can drop a column to settle a diff; mixing the two
  breaks `db:migrate` with an unhelpful silent non-zero exit. See CONTRIBUTING.
- Any change to `ANALYTICS_EVENTS` (`packages/shared/src/analytics.ts`) must
  update the Google Play Data safety declaration before the next store
  submission.

## Workflows (see `.claude/skills/`)

| Task | Skill |
| --- | --- |
| Deploy web to Vercel | `deploy-web` |
| Signed Android APK | `release-android` |
| Windows exe + installer | `release-windows` |
| Tag + publish binaries | `github-release` |
| Test on emulator/device | `verify-android` |
| Long-running local delivery | `vong-goal-workflow` |

## Repository-native SDD

- Before changing product behavior, read `sdd.config.json`, `specs/product.md`,
  `specs/architecture/system.md`, and only the affected current domain spec.
- Domain specs own current observable behavior; executable contracts own interface
  shape; Drizzle schema and migrations own physical storage; tests provide evidence.
- Use the lowest safe lane from the `repository-sdd` skill. Behavior-preserving work
  is Fast; bounded behavior changes are Standard; auth, privacy, migrations,
  destructive data, public compatibility, and cross-domain invariants are Critical.
- Keep specs, code, and tests aligned. Treat disagreement between them as drift to
  surface explicitly rather than silently choosing one source.
- Run `python scripts/verify.py` during SDD work and the completion gate before
  claiming a behavior change is ready.

## Verification commands

```bash
npm run verify:local  # web + shared + tests + build + mobile + Rust
```
