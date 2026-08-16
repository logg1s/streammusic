# Telemetry

Vong collects anonymous usage counts to decide what to build next. This document lists
**every** event that can be sent. If an event is not on this list, the app cannot send it
— the catalogue in `packages/shared/src/analytics.ts` is an allowlist enforced on both
the client and the server.

## What is collected

- A random `installId`, generated on the device, not linked to any account
- A `sessionId` for one run of the app
- Which shell (web / android / windows) and app version
- An event name from the table below, plus short labels, numbers and booleans

## What is never collected

- **Search queries.** Not truncated, not hashed — not sent.
- **Song, artist, album or playlist names.** Play events carry a source label, never a title.
- Account identity, email, or any value that could be joined back to a user
- File paths, URLs, tokens
- IP-based location or device fingerprints

This is enforced in code, not by convention: `sanitizeProps()` drops any property whose
key looks like content (`query`, `title`, `artist`, `url`, …), any string longer than 48
characters, and any nested object. The server applies the same function again to whatever
arrives. Both are covered by tests in `packages/shared/src/analytics.test.ts`.

Analytics data is stored in the project's own Neon Postgres database, in
`analytics_events`. There is no third-party analytics SDK in any shell, and no data
leaves the project's own infrastructure.

## Event catalogue

| Event | Fired when | Properties |
| --- | --- | --- |
| `app_open` | App starts | `cold` |
| `session_end` | App backgrounded or closed | `sec`, `tracks` |
| `play_start` | The clock actually moves for a track — not when play is pressed | `source` (library/youtube), `origin` (radio/queue), `ttfaMs` |
| `play_end` | Track stops or is switched | `playedSec`, `durationSec`, `origin`, `source`, `completed`, `skippedEarly` |
| `radio_seed` | A radio queue is seeded | `trigger` (autoplay/manual) |
| `radio_refill` | Radio appends a batch | `added` |
| `queue_end` | Queue runs out without continuing | `depth` |
| `resolve_fail` | YouTube audio URL resolution fails | `reason` |
| `playback_error` | Playback error surfaces to the user | `stage`, `code` |
| `search_run` | A search completes — **count only, no query text** | `results`, `hasYoutube` |
| `setting_change` | A setting is toggled | `key`, `value` |

## User control

Telemetry is **on by default with an off switch** in Settings on every shell. Turning it
off stops collection immediately and discards anything buffered but not yet sent.

The default was chosen deliberately: opt-in telemetry typically reaches 5–15% of users,
which is not enough to make decisions from and biases toward the most engaged users. The
trade is only defensible because the data collected is genuinely anonymous and genuinely
narrow — which is what the two lists above are for.

## Google Play Data safety declaration

Current as of **v0.3.1 (versionCode 4)** — the first build in which any of these events
actually leave a user's device. Fill the Play Console form to match this table exactly;
if the two disagree, this file is wrong and must be corrected, not the form.

Every row below is **collected, not shared**, encrypted in transit, and **optional** —
Settings carries an off switch, which is what lets us tick "Users can choose whether this
data is collected".

| Play data type | Category | What it is here | Purpose |
| --- | --- | --- | --- |
| App interactions | App activity | `app_open`, `play_start`, `play_end`, `radio_seed`, `radio_refill`, `queue_end`, `search_run` (count only), `setting_change` | Analytics |
| Other actions | App activity | `session_end` — session length and track count | Analytics |
| Crash logs | App info and performance | `playback_error` with a stage and code, no stack or message | Analytics |
| Diagnostics | App info and performance | `resolve_fail` reason, `ttfaMs` timing | Analytics |
| Device or other IDs | Device or other IDs | `installId` — random, app-generated, not the advertising ID, not Android ID, not any hardware identifier | Analytics |

`installId` is declared conservatively. It is not a Play-recognised device identifier and
does not survive a reinstall, but it is a persistent per-install pseudonym, and under-
declaring an identifier is the failure mode that gets an app pulled.

**Not declared, because it is not collected:** search query text, track/artist/album/
playlist names, account identity, email, file paths, URLs, tokens, location. See "What is
never collected" above — that list is enforced by `sanitizeProps()` and its tests, so
these rows can be left unticked without hedging.

**Open question, out of scope for this table:** library streaming sends
`Authorization: Bearer` to the project's own server, and the storage-provider OAuth flow
handles tokens. Neither is telemetry, but both may need their own rows under "Personal
info" / "Files and docs" depending on what the server retains. Resolve before submission —
this table covers the analytics pipeline only and does not certify the whole app.

## Obligations when changing this

- Adding an event means updating `ANALYTICS_EVENTS`, this table, **and** the Google Play
  Data safety declaration before the next store submission. An undeclared data type is
  grounds for removal from the store.
- Removing an event is safe: old clients keep sending it, the server drops unknown names
  silently rather than rejecting the whole batch.
- Never add a property that carries free text. If a question seems to need one, it is
  almost always answerable by a bounded label instead.
