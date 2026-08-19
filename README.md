# Vọng 🎵

**Your music, where it already lives.** Vọng turns Google Drive, Dropbox and
OneDrive into a personal streaming service — and treats YouTube as a
first-class music source next to them. Nothing gets uploaded anywhere: the app
reads your files' tags to build a library, then streams straight from your
storage.

One codebase, three apps:

| Platform | What you get |
| --- | --- |
| 🌐 **Web** | Full player in the browser — [streammusic.vercel.app](https://streammusic.vercel.app) |
| 🪟 **Windows** | Native app, audio decoded in Rust, media-key & taskbar controls, survives minimising |
| 🤖 **Android** | Native app, background playback with lock-screen controls — lock the phone, music keeps going |

📦 **Download:** grab the Windows installer or the Android APK from
[Releases](https://github.com/logg1s/streammusic/releases).

---

## Why this exists

Streaming from a browser tab has two hard limits:

1. **YouTube's iframe can't play in the background.** Lock your phone and the
   music stops. YouTube also blocks server IPs from resolving audio, so no
   server can do it for you.
2. **Browsers throttle hidden tabs**, so even your own files stutter once the
   window is minimised.

The fix is not another web trick — it's native shells. The Windows and Android
apps load the *same* web UI you already know, but swap the playback layer for
the operating system's own player. Same interface, real background audio.

## Quick start

Just want to listen? Install from [Releases](https://github.com/logg1s/streammusic/releases)
and sign in with Google. Done.

Want to run your own instance? You need a Postgres database and a Google OAuth
client:

```bash
git clone https://github.com/logg1s/streammusic && cd streammusic
npm install

# 1. Database (Neon via Vercel, or bring your own DATABASE_URL)
npm i -g vercel
vercel link
vercel integration add neon --yes --no-claim
vercel env pull .env.local --yes
npm run db:migrate && npm run db:index

# 2. Fill AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET in .env.local (see "OAuth setup")

# 3. Go
npm run dev
```

No OAuth keys yet? `npm run seed:demo` loads 8 public-domain tracks and prints
a cookie that lets you into the app without Google — enough to try the whole
library and player.

---

## How it works

```
Browser                      App (Vercel)                   Your storage
    │                              │                              │
    │  GET /api/stream/{trackId}   │                              │
    ├─────────────────────────────►│                              │
    │       + Range header         │  verify track belongs to user│
    │                              │  fetch access token (auto-refresh)
    │                              │                              │
    │                              │  Dropbox / OneDrive:         │
    │                              ├──── request temp link ──────►│
    │  ◄── 302 to that link ───────┤                              │
    │  ───────── downloads directly, bytes never touch us ───────►│
    │                              │                              │
    │                              │  Google Drive:               │
    │                              ├─ GET ?alt=media + Bearer ───►│
    │  ◄── 206 Partial Content ────┤◄──── byte stream ────────────┤
```

- **Scanning is cheap.** Tags are read with HTTP range requests — measured at
  **2% of the file for MP3, 25% for M4A**, never the whole thing.
- **Streaming is direct.** Dropbox and OneDrive hand out short-lived links, so
  the app answers with a 302 and gets out of the way. Google Drive is the one
  provider that must be proxied (its API only accepts an `Authorization`
  header).
- **YouTube plays through the official IFrame Player** on the web, and through
  on-device resolution + native decoding in the two apps (details below).

## Architecture

Every provider difference hides behind one interface
(`src/lib/providers/types.ts`). The scanner, the stream endpoint and the whole
UI only talk to that interface — supporting S3 or WebDAV later means writing
one more file.

```
packages/shared/      code shared by all three shells (web · Windows · Android)
src/
  lib/providers/     types.ts · dropbox.ts · google-drive.ts · onedrive.ts
  lib/metadata.ts    reads ID3 tags via range requests
  lib/scanner.ts     batched scanning, writes into the library
  lib/connections.ts stores + auto-refreshes OAuth tokens (AES-256-GCM encrypted)
  app/api/stream/    playback endpoint: 302 or Range proxy
  app/api/native/    sign-in + session JWT for the two native shells
  app/api/library/   JSON endpoints for mobile (home, tracks, albums, artists, search)
  components/player/ audio engine + player bar (lives in the layout, not in pages)
src-tauri/           Windows shell: audio decoded in Rust (rodio + symphonia) + SMTC
mobile/              Expo app (Android) + `vong-audio` Expo Module (androidx.media3)
```

Two design decisions worth knowing:

- **The `<audio>` pool lives in the layout** (`src/app/(app)/layout.tsx`), not
  in a page. App Router keeps layouts mounted across navigation, so music
  never cuts out when you browse.
- **The Windows shell reuses the deployed web UI; Android has its own Expo Router
  UI.** Both native shells reuse shared queue/resolver contracts and replace the
  browser audio path with an operating-system player:

  | | Playback | Controls outside the app |
  | --- | --- | --- |
  | Web | `<audio>` + YouTube iframe | `mediaSession` (while the tab lives) |
  | Windows | Rust: `rodio` + `symphonia` | SMTC (Windows media bar) |
  | Android | Kotlin: `androidx.media3` | `MediaSession` + notification |

`packages/shared/` holds what all three need: the queue store (zustand), the
radio client, and `player-request.ts` — the YouTube audio resolver. That URL
**must** be requested from the user's machine: YouTube returns
`LOGIN_REQUIRED` to server IPs, so each shell calls InnerTube over its own
network.

---

## OAuth setup

`.env.local` ships with randomly generated `ENCRYPTION_KEY` and `AUTH_SECRET`.
The rest come from three developer consoles:

| Provider                | Where to register                                                           | Redirect URI to add                                                  |
| ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Google (sign-in)        | [console.cloud.google.com](https://console.cloud.google.com) → Credentials  | `http://localhost:3000/api/auth/callback/google`                     |
| Google Drive            | same OAuth client as above                                                   | `http://localhost:3000/api/connections/oauth/google_drive/callback`  |
| Dropbox                 | [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)      | `http://localhost:3000/api/connections/oauth/dropbox/callback`       |
| OneDrive                | [portal.azure.com](https://portal.azure.com) → App registrations            | `http://localhost:3000/api/connections/oauth/onedrive/callback`      |
| YouTube (taste radio)   | same Google OAuth client                                                     | `http://localhost:3000/api/youtube/oauth/callback`                   |

Dropbox permissions to enable: `account_info.read`, `files.metadata.read`,
`files.content.read`.

Sign-in goes through Google, so **`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
are required**. Dropbox and OneDrive are optional — providers without keys
hide themselves from the UI. For production, add the same redirect URIs with
your production domain.

### ⚠️ Google Drive, read before connecting

Scanning your existing files requires the `drive.readonly` scope, which Google
treats as **restricted**:

- **Testing mode** (default): works with up to 100 test users, no verification
  — but **refresh tokens expire every 7 days**. The app handles it gracefully
  (the connection flips to `needs_reauth` and shows a re-authorize button),
  still, you'll click that button weekly.
- **Publishing** requires Google's app verification plus a CASA security
  assessment — costs money, takes weeks.
- **Google Workspace users**: set the consent screen to _Internal_ and both
  problems disappear.

**Dropbox and OneDrive have no such restriction.** For a quick test, connect
Dropbox first.

---

## YouTube

YouTube sits next to your storage as a full music source:

- **Search any song** — the Search page shows an "On YouTube" section below
  library results; every row plays instantly, queues, or joins a playlist.
- **Radio that keeps going** — hit **Radio** on a YouTube track and the queue
  extends itself in YouTube Music's up-next order, filtering tracks already
  queued or blocked in the current session.
- **Mixed playlists** — library tracks and YouTube tracks in one list.
- **Personalised home** — recently played plus YouTube Music suggestion rows.

### How playback actually works (and why)

On the **web**, YouTube tracks play through the official IFrame Player API — a
visible iframe, mounted at app start so the first click makes sound
immediately. The web app never downloads audio bytes: YouTube blocks server
IPs (`LOGIN_REQUIRED`, measured 2026-08, 3/3 videos) and Vercel's AUP forbids
media proxying anyway. The price: an iframe can't play with the screen locked.

The **native shells** resolve the audio URL on-device (residential IP — works)
and decode it themselves. One hard-won constraint applies to both: every byte
request to googlevideo must carry a `Range` header. Measurements in the current
implementation show an un-ranged request being throttled to about 32 KiB/s,
while `Range: bytes=0-` receives a normal `206` response at full speed. The
Windows and Android readers therefore inject an open-ended
`Range: bytes=N-` on every request; a downstream HTTP stack may tighten
that range without violating the contract.

Server-side InnerTube (`src/lib/youtube/resolve.ts`) is only used for
metadata: search, automix, suggestions.

### Optional extras

Everything below is optional — search, radio and suggestions work with zero
credentials:

1. **Connect a YouTube account** (_Settings → Storage → YouTube taste_) for
   personalisation from your Likes and Subscriptions. Reuses the Google OAuth
   client; scope `youtube.readonly` (sensitive — 7-day tokens in Testing
   mode).
2. **`YOUTUBE_API_KEY`** powers the "Trending" section (1 quota unit per call,
   cached 6 hours). Without it, that section hides.
3. **`YT_MUSIC_COOKIE`** personalises home suggestions. Use a **throwaway
   account** — YouTube may lock accounts used this way. The shared InnerTube
   session never receives this cookie.

---

## Costs

| Source            | Bytes through Vercel                          |
| ----------------- | --------------------------------------------- |
| Dropbox, OneDrive | ~0 (302 redirect)                              |
| Google Drive      | everything — roughly 60–100 MB per hour played |
| YouTube           | ~0 — bytes go straight from googlevideo to the device |

If Drive gets expensive, the upgrade path is caching hot tracks to Vercel Blob
and serving them from the CDN.

---

## Development

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit (web and packages/shared)
npm run verify:local # full local gate: web, shared, mobile, tests, build, Rust
npm run e2e:all     # local E2E: web Playwright + Android ADB + Windows WebView2 CDP
npm run check:youtube  # resolve a YouTube audio URL from this machine, measure real speed
npm run tauri:dev   # Windows app (needs the dev server running)
npm run tauri:build # package .exe + NSIS installer
npm run db:migrate  # apply committed Drizzle migrations
npm run db:studio   # browse data with Drizzle Studio
npm run db:index    # create extension + search indexes (once, after db:migrate)
npm run verify      # prove tag reads only fetch 2–25% of each file (no DB/OAuth needed)
npm run seed:demo   # demo library without OAuth (add -- --clean to remove)
```

### Android

```bash
cd mobile
npx expo run:android   # build + install the development build (JDK 17 + Android SDK 36)
npm start              # Metro for an already-installed development build
```

Release build — signed, production origin, installs on a real device without
Metro:

```bash
cd mobile && npm run prebuild                       # clean phone android/, signing auto-injected
cd android && ./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -PVONG_UPLOAD_STORE_PASSWORD="$(cat ../credentials/keystore-pass.txt)"
# → android/app/build/outputs/apk/release/app-release.apk
```

Android TV is generated separately and must not reuse the phone `android/`
directory. The release APK deliberately contains both ARM ABIs:

```bash
cd mobile && npm run prebuild:tv
cd android && ./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=armeabi-v7a,arm64-v8a \
  -PVONG_UPLOAD_STORE_PASSWORD="$(cat ../credentials/keystore-pass.txt)"
# → android/app/build/outputs/apk/release/app-release.apk
```

Sony does not publish the Android application ABI for the BRAVIA KD-55X80J,
and a 64-bit-capable SoC does not prove that its Android userspace is arm64.
The universal TV artifact therefore covers both `armeabi-v7a` and `arm64-v8a`.
On a physical TV, verify the exact firmware ABI with
`adb shell getprop ro.product.cpu.abilist`.

The keystore lives at `mobile/credentials/vong-release.jks` (gitignored — **do
not lose it**, or installed apps can never be updated). On Windows, long paths
require Windows long-path support plus Ninja 1.11 or newer; a directory junction
alone is insufficient because Gradle resolves the canonical source path.

### Library scanning internals

Vercel caps functions at 300 s, so scanning is batched: `POST /api/scan`
queues the files, the browser loops `POST /api/scan/{id}/step` (25 files per
step, 8 read in parallel) until done. Progress is real, scans are resumable,
and re-scans skip files whose `remoteRev` didn't change. To run scans without
keeping a tab open, swap the `step` loop for
[Vercel Workflow](https://vercel.com/docs/workflow).

## Verification & releases

- Run `npm run verify:local` before committing or releasing. Verification is
  intentionally local; this repository does not run a GitHub CI workflow.
- Run `npm run e2e:all` for deterministic login, library, search, playlist,
  playback, next-track, and background-playback coverage on all three shells.
  It requires the `Medium_Phone_API_36.0` Android AVD and an authenticated Neon
  CLI. Fixture data stays on the schema-only `e2e-local` branch; failure
  artifacts go to `%TEMP%\vong-e2e\<timestamp>`.
- Pushing a `v*` tag builds the signed APK + Windows installer and attaches
  both to a GitHub Release (`.github/workflows/release.yml`). Repo secrets:
  `ANDROID_KEYSTORE_BASE64`, `VONG_UPLOAD_STORE_PASSWORD`.
- Manual fallback (no Actions needed): build locally, then
  `gh release create vX.Y.Z <apk> <exe>`.

## Contributing

Bug reports, feature ideas and PRs are welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the parts of this repo (workspace
layout, generated `mobile/android/`, the verification commands) a generic
guide wouldn't tell you. Security issues go through
[`SECURITY.md`](SECURITY.md), not a public issue.

## License

[GNU AGPL v3.0](LICENSE). Because the web app is hosted, this means anyone
who runs a modified version of Vong as a public service must make the source
of their modifications available to its users — see
[`CONTRIBUTING.md`](CONTRIBUTING.md#license) for what that means in
practice.
