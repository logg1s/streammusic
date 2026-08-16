<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vong — project rules

## Language

- **Commit messages, docs, README, release notes, and replies to the user: English.**
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

## Workflows (see `.claude/skills/`)

| Task | Skill |
| --- | --- |
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
