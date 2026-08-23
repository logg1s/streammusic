# Vọng home accepted design

## Outcome and non-goals

- Outcome: make the signed-in home screen feel like a living music destination where listening can begin from a featured release, new releases, personal continuity, or discovery rails.
- Observable success: an authenticated listener can immediately see and play a current discovery item, browse a dedicated new-releases rail, resume their own listening, and reach their library without the persistent player being remounted.
- Non-goals: change storage ownership, add social sharing, host media, or change native device playback behavior.

## User and context

- Primary user: a Vietnamese listener combining a cloud library with YouTube Music discovery.
- Context and job to be done: open Vọng, find something current or familiar to play in one glance, then keep browsing while the player continues.
- Important constraints: dark Vọng visual language; dynamic discovery data can be unavailable; all controls must remain keyboard/touch accessible; the one-audible-source invariant remains untouched.

## Selected direction

- Direction: dark editorial listening home — a single featured discovery moment leads into open horizontal music rails, with a quiet navigation rail and the persistent player as the only fixed chrome.
- Why this direction: it makes new music visible without hiding the listener's own library, preserves the existing app-shell/player architecture, and uses the product's coral-on-graphite identity.
- Alternatives not selected and material trade-off: a dense dashboard would expose more library data at once, but makes discovery less immediate and competes with playback controls.

## Main journey

1. The listener lands on Home and sees a featured playable release plus their currently available library context.
2. They choose a release from **Mới phát hành** or a continuing/personal row.
3. The shared queue and persistent player start or continue playback while Home stays browseable.
4. If remote discovery is unavailable, personal-library sections remain useful and the discovery region explains its unavailable state without breaking the page.

## Screen and state matrix

| Surface | Purpose | Relevant states | Accepted artifact |
| --- | --- | --- | --- |
| Web home | Start or continue a listening session | loading / no library / no discovery / success | `C:/Users/Long/.codex/generated_images/01a02ca5-83f0-70f1-965b-cf167162dc63/exec-a56a0348-52f3-40db-8630-2506e5bb1a33.png` |

## Experience constraints

- Platforms and viewports: desktop-first web shell, then responsive single-column rails on phone widths.
- Input modes: pointer, keyboard, touch; every playable cover has a name and visible focus treatment.
- Accessibility needs: semantic headings, no essential information conveyed only by cover art, reduced-motion support, AA text contrast.
- Existing design-system rules to reuse: `--background`, `--surface`, `--border`, coral accent tokens, Cover, persistent PlayerBar, AppSidebar, and the shared player/radio entry points.

## Decisions to revisit

- Create a durable release-feed source only if the YouTube home feed cannot provide a region-appropriate new-releases shelf reliably.
