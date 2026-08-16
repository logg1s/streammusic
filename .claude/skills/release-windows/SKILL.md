---
name: release-windows
description: Build the Windows Tauri release (vong.exe + NSIS installer) and smoke-test it. Use when asked to build, package, or debug the Windows desktop app release.
---

# Windows release build

```bash
npm run tauri:build
# outputs:
#   src-tauri/target/release/vong.exe
#   src-tauri/target/release/bundle/nsis/Vong_<version>_x64-setup.exe (~2.6 MB)
```

## Key facts

- The installer is tiny because the UI is **remote**: `frontendDist` in
  `src-tauri/tauri.conf.json` points at `https://streammusic.vercel.app`.
  Rust ships only the audio engine (rodio + symphonia), SMTC, deep-link and
  single-instance plumbing.
- **RAM**: a full `cargo` release build alongside anything heavy can crash
  rustc. Use `CARGO_BUILD_JOBS=4 npm run tauri:build` on this machine.
- Version comes from `src-tauri/tauri.conf.json` → NSIS filename.

## Smoke test (headless)

Launch with a CDP port and drive it via the browser tool:

```
env WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333 --autoplay-policy=no-user-gesture-required"
run src-tauri/target/release/vong.exe (hub op:start)
browser open with cdp_url http://127.0.0.1:9333
```

Checks that matter:
- `'__TAURI_INTERNALS__' in window` → true (ACL/IPC alive).
- Page is the production origin, not localhost.
- Play a track: `invoke("play_track", ...)` path → Rust decodes, `player://tick`
  events advance, SMTC shows title (verify with the `scripts/` PowerShell
  WinRT snippets pattern: `GlobalSystemMediaTransportControls`).
- Minimise the window → position keeps advancing (the whole point of the Rust
  engine).

## Deep link / sign-in

`vong://` is registered by `tauri-plugin-deep-link` (registry) — but only when
installed or on first run. `single-instance` is registered BEFORE `deep-link`
in `src-tauri/src/lib.rs`; keep that order or a second instance eats the URL.
