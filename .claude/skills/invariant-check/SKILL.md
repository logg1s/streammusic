---
name: invariant-check
description: Check Vong's five hard invariants — one audible audio source, on-device YouTube resolve, bounded Range headers on googlevideo, Bearer auth for native library streaming, and generated mobile/android/. Use before merging any change to playback, audio URLs, native shells, streaming auth, or the Expo config; when the invariant script fails; when adding a new audio path or native bridge call; and whenever asked to verify, audit, or explain the hard invariants.
---

# Invariant check

## Run it first

```bash
node .claude/skills/invariant-check/scripts/check-invariants.mjs
node .claude/skills/invariant-check/scripts/check-invariants.mjs --diff origin/master
```

Exit 0 is clean, exit 1 lists `file:line [invariant]` with the failing scenario. Scans
~190 source files across TS/TSX, Kotlin and Rust in well under a second, so there is no
reason to skip it.

## What the script actually checks

| Invariant | Detection | Blind to |
| --- | --- | --- |
| One audio source | `new Audio()`, `createElement("audio")`, `new YT.Player()`, the IFrame API URL, `VongAudio.*`, `ExoPlayer.Builder()` outside the four player directories | Two *existing* engines both being active at runtime |
| Range header | Any file mentioning googlevideo with no sign of `audioRangeHeaders` / `Range` / `RangeForcing` / `setRequestProperty`, plus existence of both range-forcing sources | A Range header present but wider than 1 MiB |
| On-device resolve | `resolveAudio` / `createYoutubeResolver` called from `src/app/api/` or `src/lib/youtube/` | Resolution reached indirectly through a helper |
| Bearer auth | A native-shell file hitting `/api/stream` with no `bearer` / `authoriz` / `authHeader` anywhere in it | A header built but never attached |
| Generated Android | `git diff` touching `mobile/android/` with no matching `mobile/plugins/` change | Uncommitted edits when diffing against `HEAD` |

Comments are stripped before matching. This matters: the codebase documents these rules in
long comments that quote the banned constructs, and matching raw text turns the
best-documented files into the loudest false positives.

`mobile/android/` and `mobile/ios/` are skipped by **path**, never by directory name —
`mobile/modules/vong-audio/android/` is the hand-written Kotlin engine and must be
scanned, since two of the five invariants are implemented there.

## What only a human or a careful agent catches

The script matches text. It cannot see a `useEffect` that starts the audio pool while the
YouTube iframe is still mounted, a native `setQueue` racing the store, or a Range header
that is technically present but spans 4 MiB. After the script is green, read the diff for:

- any new place that starts, stops, or prepares playback
- any new request to googlevideo or to `/api/stream`
- lifecycle changes in the engines — mount, unmount, effect ordering
- changes to `mobile/plugins/` (correct) versus `mobile/android/` (wrong)

## Handling a failure

1. Read the scenario in the message — it names the concrete way this breaks in production.
2. Fix the code, not the check, unless the finding is genuinely a false positive.
3. If it is a false positive, add the path to the relevant allowlist in the script **with
   a comment saying why**. An unexplained allowlist entry is how a check quietly dies.
4. If you found a real problem the script missed, extend the script. That is the only way
   this gets stronger over time rather than depending on who happens to read the diff.

## Wiring it into CI

Add to `.github/workflows/ci.yml`, alongside the existing typecheck and lint steps:

```yaml
      - run: npm test
      - run: node .claude/skills/invariant-check/scripts/check-invariants.mjs --diff origin/${{ github.base_ref || 'master' }}
```

The `--diff` form is what makes the generated-Android rule meaningful on a pull request;
without a base ref it can only see uncommitted work.
