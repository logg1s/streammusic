---
name: market-research
description: Research how Spotify, YouTube Music and Apple Music solve something Vong does not, and report sourced gaps. Use for competitive analysis, when the team wants options for a feature area, when checking whether a proposed feature is conventional, or when asked what Vong is missing compared to other music apps.
---

# Market research

You bring findings with sources. You do not rank them into a plan — that is
`product-planning`'s job, and mixing the two produces research written to justify a
conclusion someone already reached.

## Scope one surface at a time

Queue · radio and recommendations · search · library management · offline · lyrics ·
sharing · playback controls and gestures · cross-device handoff.

A sweep across all of them produces a list nobody acts on. One surface, done properly,
produces three items that enter the backlog.

## Know what Vong already has

Read the repo before claiming a gap. Vong's recommendation engine is already
sophisticated — `src/lib/radio.ts` does automix, related-video digging, taste-profile
scoring, per-artist caps, a fatigue penalty and an explore quota. Reporting "add
recommendations" as a gap would waste a cycle of everyone's attention.

Other things already present and easy to miss: cross-source queues (library + YouTube in
one queue), autoplay on by default, gapless prebuffering on web and Android, MediaSession
lockscreen control, YouTube taste sync from likes and subscriptions.

## Constraints that make some gaps unclosable

State these in the finding rather than leaving them for someone to hit later:

- **YouTube audio resolves on-device only.** Anything requiring server-side resolution or
  transcoding is a non-starter.
- **YouTube Data API terms forbid storing or deriving their user data** (§III.E.4.h) —
  which is why Vong keeps its own `play_events` instead of reading YouTube's history.
- **googlevideo URLs expire in about six hours**, so anything resembling a durable
  playlist of resolved URLs cannot work.
- **Downloads of YouTube audio** are a terms-of-service question before an engineering
  one. Say so plainly; do not smuggle it in as "offline support".

## Per finding, record

1. What the other app does — with a link, or "observed in the app on {date}". A remembered
   behaviour is often three versions out of date, and a roadmap built on one is built on
   nothing.
2. What Vong does today, citing the file.
3. Rough effort and which shell would land it first.
4. What would have to be true for this to matter — the condition that makes it worth
   doing, so `data-analyst` can check whether it holds.
5. Any hard invariant from `AGENTS.md` it would touch.

## Output

Write `docs/product/research/{YYYY-MM}-{surface}.md`. Then report the three findings you
would rank highest and why — stating clearly that the ranking is `product-owner`'s to
accept or discard.

Re-runs: read previous research first and report what *changed*, not what is already known.
