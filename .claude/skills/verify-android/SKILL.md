---
name: verify-android
description: Run and verify the Vong Android app on an emulator or device — install, drive the UI over adb, check background playback and MediaSession. Use when testing, debugging, or verifying Android behaviour.
---

# Android verification loop

## Setup

```bash
adb=~/AppData/Local/Android/Sdk/platform-tools/adb.exe
emulator -avd Medium_Phone_API_36.0 &          # or a real device via USB
adb reverse tcp:8081 tcp:8081                  # Metro
adb reverse tcp:3000 tcp:3000                  # local web origin (dev builds only)
```

Dev build: `cd mobile && npx expo run:android`, then relaunch against a fresh
Metro with the deep link
`vong://expo-development-client/?url=<encoded http://10.0.2.2:8081>`.
Release APK: `adb install -r app-release.apk` — no Metro, production origin.

## Drive the UI

- Tap: `adb shell input tap X Y` (screenshot coords ÷ display scale).
- Screenshot: `adb shell screencap -p /sdcard/s.png && adb pull ...` — read the
  image, then act. Re-shoot after every navigation.
- Back/menu: `adb shell input keyevent 4` (back), `82` (dev menu).

## The checks that matter

```bash
# Playback state + track title (the ground truth, works locked)
adb shell dumpsys media_session | grep -A3 app.vong.mobile
#   state=PlaybackState {state=PLAYING(3), position=..., ...}
#   metadata: ... title of current track

# Background survival: lock, wait, re-check position advanced
adb shell input keyevent 26; sleep 60
adb shell dumpsys media_session | ...   # position must have grown; state PLAYING

# Notification with Next/Previous
adb shell dumpsys notification --noredact | grep -i vong

# JS-side errors
adb logcat -d -t 800 | grep -E "ReactNativeJS|VongAudio|ExoPlayer|MediaSession"
```

Hard invariant to re-verify after touching `mobile/modules/vong-audio`:
googlevideo 403s any request without `Range:` ≤ 1 MiB —
`RangeForcingDataSource.kt` enforces it; a 403 in logcat means it regressed.

## Known failure modes

- **White screen, dev build**: Metro wedged (bundle request hangs) →
  `hub restart metro`, wait for ready, force-stop + relaunch app.
- **`ClassNotFoundException: SplashScreenManager`**: `expo-splash-screen`
  missing → `npx expo install expo-splash-screen`, prebuild, rebuild.
- **Stale native code after Kotlin edits**: gradle may skip recompile —
  `./gradlew clean :app:assembleDebug`, verify class mtimes under
  `mobile/modules/vong-audio/android/build/tmp/kotlin-classes`.
- **Sign-in loops**: emulator lacks a Google-capable browser session; Custom
  Tabs must open (no `disallowed_useragent`), callback lands on
  `vong://auth?code=...`.
- Keep `mobile/app.json` `extra.origin` = production when committing; local
  runs may temporarily flip it to `http://localhost:3000`.
