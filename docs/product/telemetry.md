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

## Obligations when changing this

- Adding an event means updating `ANALYTICS_EVENTS`, this table, **and** the Google Play
  Data safety declaration before the next store submission. An undeclared data type is
  grounds for removal from the store.
- Removing an event is safe: old clients keep sending it, the server drops unknown names
  silently rather than rejecting the whole batch.
- Never add a property that carries free text. If a question seems to need one, it is
  almost always answerable by a bounded label instead.
