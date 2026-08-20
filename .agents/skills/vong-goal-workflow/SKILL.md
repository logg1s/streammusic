---
name: vong-goal-workflow
description: Run long Vong development goals end to end with local-only quality gates. Use for implementing, refactoring, fixing, or migrating features in this repository when Codex should autonomously inspect, plan, edit, test, and verify web, shared, Android, Rust, database, or release-related work without GitHub CI.
---

# Vong Goal Workflow

Treat the goal as one bounded objective with a verifiable stopping condition. Keep working through recoverable failures; stop only for a real product decision, unavailable credential/device, destructive action requiring authority, or an external system that cannot be reached.

## 1. Establish the contract

- Restate the objective, exclusions, acceptance criteria, and proof of completion.
- Reject an open-ended backlog as one goal; select or request one coherent deliverable.
- Read `AGENTS.md`, inspect `git status`, and preserve all pre-existing changes.
- Identify affected shells: web, shared, Android, Windows/Rust, database, or deployment.
- For Next.js work, read the relevant guide under `node_modules/next/dist/docs/` before editing.
- Create checkpoints for work that spans more than one subsystem.

## 2. Run preflight

- Reproduce the problem or inspect the current behavior before editing.
- Run the narrowest existing test or check that establishes a baseline.
- Inspect recent migrations and ownership boundaries before schema work.
- Never use `db:push`. Generate schema changes with `npm run db:generate` and inspect the SQL.
- Do not apply a migration to a remote or production database unless the goal explicitly authorizes that target.

## 3. Implement by checkpoint

- Make the smallest coherent change that satisfies the current checkpoint.
- Preserve the single-audible-source invariant across audio pool, YouTube iframe, and native engines.
- Keep YouTube audio resolution on the user's device.
- Preserve `Authorization: Bearer` for native library streaming.
- Preserve a `Range` header on every native googlevideo byte request; current
  readers use open-ended `bytes=N-` ranges.
- Change Android native behavior through `mobile/plugins/` or `mobile/modules/`; never hand-edit generated `mobile/android/`.
- Add or update regression tests alongside behavior changes.
- After each checkpoint, run targeted checks and inspect the diff before continuing.

## 4. Verify locally

Run `npm run verify:local` after all implementation checkpoints. It is the mandatory repository-wide gate and covers:

- web/shared typecheck and lint;
- unit tests;
- production Next.js build;
- Android typecheck and lint;
- Rust clippy.

Also perform scope-specific verification:

- Web UI: launch the app and exercise the changed user flow in a browser.
- Android UI or playback: read and follow `.claude/skills/verify-android/SKILL.md` when its required emulator/device tooling is available.
- Windows playback or packaging: read and follow the relevant workflow under `.claude/skills/`.
- Database: verify the generated migration and exercise affected queries against an explicitly authorized database.
- Analytics events: if `ANALYTICS_EVENTS` changes, report the required Google Play Data safety update.

If a required device or credential is unavailable, complete every other check and report the exact unverified boundary. Do not claim full verification.

## 5. Run end-to-end delivery when authorized

Treat build, E2E, deployment, and publication as separate gates. A goal must explicitly authorize each external mutation.

### Web

1. Run the local gate and start the app.
2. Exercise the affected hero flows with the Browser plugin; verify page identity, meaningful DOM, console health, screenshots, and interaction state.
3. When production deployment is authorized, read `.claude/skills/deploy-web/SKILL.md`, deploy the web first, then run its anonymous API smoke tests and the affected authenticated flows against production.
4. Record the deployment URL and evidence. Do not accept a successful upload without post-deploy checks.

### Android

1. Read `.claude/skills/verify-android/SKILL.md` and `.claude/skills/release-android/SKILL.md`.
2. Start the configured emulator or use the explicitly selected physical device, build, install, and drive the app through ADB.
3. Exercise the affected UI flow plus playback, background survival, MediaSession metadata, notification controls, and relevant logcat errors.
4. For a release goal, build the signed APK, verify its certificate and production origin, reinstall it, and repeat the release smoke test without Metro.

### Windows

1. Read `.claude/skills/release-windows/SKILL.md`.
2. Build with bounded Cargo parallelism, launch with WebView2 CDP enabled, and drive the UI through the browser tooling.
3. Verify Tauri IPC, production origin, native playback ticks, SMTC metadata, and playback while minimized.
4. For a release goal, install or exercise the NSIS artifact and report its path and checksum.

### Ordering

- Run local verification before any deployment.
- Deploy and smoke-test the web before release-testing native builds because both native releases depend on the production origin.
- Build Android and Windows sequentially on this machine to avoid memory pressure.
- Stop on a blocking regression; collect and report non-blocking findings without silently waiving them.
- Publishing to GitHub Releases, Google Play, or another store requires explicit authorization and valid credentials in that same goal.

## 6. Finish safely

- Inspect `git diff --check`, `git status`, and the final diff.
- Confirm acceptance criteria with concrete test/build/runtime evidence.
- Summarize changed files, verification results, and remaining risks.
- Do not commit, push, deploy, tag, publish, migrate a production database, or upload binaries unless the goal explicitly includes that action.
- Mark the goal complete only when no required work remains. A passing command alone is not proof that the user-visible objective works.
