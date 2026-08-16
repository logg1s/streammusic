---
name: github-release
description: Cut a versioned GitHub Release of Vong with the Android APK and Windows installer attached. Use when asked to release, tag, or publish app binaries.
---

# GitHub release

Repo: `logg1s/streammusic` (public). Two paths:

## Path A — CI (preferred when Actions works)

```bash
git tag v<X.Y.Z> && git push origin v<X.Y.Z>
```

`.github/workflows/release.yml` then builds both artifacts and attaches them.
Required repo secrets (already set, re-set with):

```bash
base64 -w0 mobile/credentials/vong-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set VONG_UPLOAD_STORE_PASSWORD --body "$(cat mobile/credentials/keystore-pass.txt)"
```

**Known blocker**: runs fail with `startup_failure` / "account is locked due
to a billing issue" — the `logg1s` account has an Actions billing lock only
the user can clear (github.com → Settings → Billing). Diagnose with
`gh run list` + `gh api .../runs/<id>/jobs --jq '.jobs[].steps'`; an empty
steps array + failure annotation = billing, not YAML.

## Path B — manual (works regardless of Actions)

Build locally (see `release-android` and `release-windows` skills), then:

```bash
gh release create v<X.Y.Z> \
  Vong_<X.Y.Z>_arm64.apk \
  src-tauri/target/release/bundle/nsis/Vong_<X.Y.Z>_x64-setup.exe \
  --title "Vong <X.Y.Z>" --notes "<what changed, install hints for both platforms>"
```

## Verify

```bash
gh release view v<X.Y.Z> --json assets
curl -sL -o /tmp/dl.exe <asset url> && cmp /tmp/dl.exe <local file>  # byte-identical
```

Bump versions before tagging: `src-tauri/tauri.conf.json` (Windows filename),
`mobile/app.json` `expo.version` + android `versionCode`, root `package.json`.
Write commit messages and release notes in English.
