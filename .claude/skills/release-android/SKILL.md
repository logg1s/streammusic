---
name: release-android
description: Build the signed release APK for the Vong Android app (Expo + custom vong-audio module). Use when asked to build, sign, or ship the Android app, or when a release/CI Android build fails.
---

# Android release build

Produces a signed, production-origin APK that installs on a real device with no Metro.

## Steps

```bash
cd mobile
npx expo prebuild --platform android    # regenerates android/; config plugins inject everything
cd android
./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -PVONG_UPLOAD_STORE_PASSWORD="$(cat ../credentials/keystore-pass.txt)"
# output: android/app/build/outputs/apk/release/app-release.apk (~45 MB)
```

## How signing gets in

- Keystore: `mobile/credentials/vong-release.jks` (gitignored, password in
  `mobile/credentials/keystore-pass.txt`). **Never lose or regenerate it** —
  installed apps could never update again.
- `mobile/plugins/with-release-signing.js` is an Expo config plugin (registered
  in `mobile/app.json`) that writes the `signingConfigs.release` block into
  `android/app/build.gradle` on every prebuild. Never hand-edit
  `android/` — prebuild overwrites it.
- Alias `vong`, algorithm RSA 2048. Verify a built APK with
  `apksigner verify --print-certs app-release.apk` (expect `CN=Vong, OU=Vong, O=Vong, L=Hanoi, C=VN`).

## Origin

The release APK embeds the production origin `https://streammusic.vercel.app`
via `expo.extra.origin` in `mobile/app.json`. Dev builds flip this to
`http://localhost:3000` — check `assets/app.config` inside the APK if playback
hits the wrong host.

## Windows-specific gotchas

- **260-char path limit** breaks C++ codegen (expo-router gesture-handler).
  Fix: `mklink /J C:\vb <repo>` then build from `C:\vb\mobile\android`.
- Gradle needs `ANDROID_HOME` (usually `C:\Users\<u>\AppData\Local\Android\Sdk`)
  and JDK 17.
- If rustc/gradle run concurrently the machine can OOM — build one at a time,
  or cap with `CARGO_BUILD_JOBS=4`.

## CI equivalent

`.github/workflows/release.yml` does the same on a `v*` tag. Secrets:
`ANDROID_KEYSTORE_BASE64` (base64 of the .jks), `VONG_UPLOAD_STORE_PASSWORD`.
