# Contributing to Vong

Thanks for looking at Vong. This file covers the parts of the repo that a
generic "clone, install, PR" guide would get wrong.

## Layout

This is an npm-workspaces monorepo, one product, three shells:

```
/                    Next.js web app (App Router) — the source of truth for the UI
packages/shared/     code shared by all three shells: the queue store (zustand),
                      the radio client, the YouTube audio resolver
src-tauri/            Windows shell — Rust, decodes audio itself (rodio + symphonia)
mobile/               Expo app (Android) + the `vong-audio` native module (androidx.media3)
```

The Windows and Android apps load the *same* deployed web UI and swap out only
the playback layer for the OS's own player. If you're changing UI, you're
almost certainly changing `src/`, not the native shells.

`mobile/` has its own `tsconfig.json` and ESLint config, separate from the
root. **The root `tsc --noEmit` excludes both `mobile/` and `src-tauri/`** —
if you only run the root typecheck, mobile type errors will pass CI-looking
locally and then fail in the mobile job. Run all three verification commands
below before opening a PR.

New code that belongs to more than one shell goes in `packages/shared/`, not
duplicated per shell. **A new export must be added explicitly to
`packages/shared/src/index.ts`** — it isn't picked up automatically, and a
missing entry fails at runtime in the consuming shell, not at typecheck time.

`mobile/android/` is **generated** by `npx expo prebuild`. Never hand-edit
anything under it — your changes will be silently discarded on the next
prebuild. Native Android config changes go in `mobile/plugins/` (Expo config
plugins) instead.

## Read `AGENTS.md` first

The repo root has an `AGENTS.md` with the project's non-negotiable rules —
language conventions and five hard invariants (one audible audio source at a
time, on-device-only YouTube URL resolution, the `Range`-header requirement
for googlevideo, `Authorization: Bearer` for native library streaming, and the
generated-`mobile/android/` rule above). Read it before touching playback,
audio URLs, native shells, or streaming auth — a PR that breaks one of these
will be asked to fix it before review continues.

If you have Claude Code or a compatible agent available, this repo's
`.claude/skills/invariant-check/` script checks these automatically:

```bash
node .claude/skills/invariant-check/scripts/check-invariants.mjs --diff origin/master
```

Running it isn't required to contribute, but it catches the most common
mistake before a human has to.

## Setting up

```bash
git clone https://github.com/logg1s/streammusic && cd streammusic
npm install
```

Full local setup — a Postgres database, Google OAuth client, and running the
dev server — is covered in the [README](README.md#quick-start). You don't
need Dropbox/OneDrive/YouTube credentials to contribute; those providers hide
themselves from the UI when unconfigured, and `npm run seed:demo` gets you a
working library without any OAuth at all.

## Changing the database schema

Edit `src/db/schema.ts`, then generate and apply a migration:

```bash
npm run db:generate    # writes drizzle/NNNN_*.sql from the schema diff
npm run db:migrate     # applies pending migrations
```

**Use `db:migrate`, not `db:push`.** `db:push` diffs the schema straight onto
the database without leaving a migration file, so the change exists on your
machine and nowhere else — and it can drop a column to resolve a diff. It is
a prototyping tool, not a deployment path.

Mixing the two also breaks `db:migrate` in a way that is hard to read: pushed
changes are never recorded in `drizzle.__drizzle_migrations`, so the next
`db:migrate` tries to re-apply migrations whose objects already exist and
fails with an unhelpful non-zero exit. If that happens, the fix is to record
the already-applied migrations (their hash is the sha256 of the raw `.sql`
file, and `created_at` is the `when` value from `drizzle/meta/_journal.json`)
rather than to delete anything.

Commit the generated `.sql` file and the updated `meta/` snapshot together
with the schema change. A schema change without its migration is a change
only you can run.

## Making changes

- **Docs, commit messages, code comments you add: English.** User-facing UI
  strings stay **Vietnamese** — that's the product's language, not a
  placeholder. Don't translate existing Vietnamese UI strings or comments as
  a side effect of an unrelated change.
- Keep changes scoped to the shell(s) they affect. A web-only change
  shouldn't touch `mobile/` or `src-tauri/`.
- If you change anything under `packages/shared/src/analytics.ts`
  (`ANALYTICS_EVENTS`), update `docs/product/telemetry.md` in the *same*
  commit — this is enforced by review, not by CI.

## Verifying before you open a PR

Run whichever of these apply to the shell(s) you touched:

```bash
npm run typecheck && npx eslint .                            # web + packages/shared
cd mobile && npx tsc --noEmit && npx eslint .                 # mobile
cd src-tauri && cargo clippy 2>&1 | grep -E "error|warning"   # Windows / Rust
npm run test                                                  # unit tests (packages/shared)
```

CI runs the web and mobile typecheck/lint on every PR. It does not currently
run `cargo clippy` or `npm run test` — run them locally if you touched Rust
or `packages/shared` logic.

If your change affects Android and you have a device or emulator available,
see the `verify-android` skill for how this project tests native playback —
type-checking alone doesn't catch playback regressions.

## Android build environment (Windows contributors)

Building the Android shell from a Windows machine hits two failure modes that
cost a full day to diagnose the first time:

1. **Long paths.** The generated `mobile/android/` tree exceeds Windows'
   default 260-character path limit. Enable `LongPathsEnabled=1` in the
   registry *and* build from a short path — a junction
   (`mklink /J C:\vb <repo>`, then build from `C:\vb\mobile\android`) works
   well.
2. **Ninja.** The native build needs ninja ≥ 1.11; older versions bundled
   with some Android Studio installs fail silently mid-build.

See the `release-android` skill for the full sequence if you're producing a
signed build rather than a development one.

## Reporting bugs and requesting features

Use the issue templates — the bug template asks for the shell (web / Android
/ Windows) and app version because the same symptom often has a different
root cause per shell, and without that a maintainer has to ask before they
can even start.

For security issues, do **not** open a public issue — see
[`SECURITY.md`](SECURITY.md).

## Pull requests

Fill in the PR template, including which verification commands you ran and
on which shells, and whether the change touches any of the five hard
invariants. A small, focused PR against one shell is easier to review than a
large one that touches several.

## License

Vong is licensed under the [GNU Affero General Public License v3.0](LICENSE)
(AGPL-3.0). By submitting a pull request, you agree that your contribution is
licensed under the same terms.

**The practical consequence, so nobody is surprised later:** the AGPL's
network clause means it isn't only about redistributing the code. Because the
web app is a hosted service, if you (or anyone) run a modified version of
Vong as a public-facing service, you must make the modified source available
to the users of that service — not just to people you hand a copy to. This
doesn't affect running Vong privately, or contributing changes back here; it
matters if you fork the project and stand up your own public instance with
changes.
