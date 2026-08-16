# PRD: {feature}

_Status: draft | approved | shipped · Owner: {who} · Cycle: {YYYY-Cnn}_

## Problem

One sentence, from the user's point of view, describing what they cannot do today. If
this sentence needs a "because the code currently…" clause, it is an engineering task,
not a feature — put it in the backlog instead.

## Evidence

What number or observation says this is worth doing. Name the metric and its current
value, or say plainly that this is a judgement call and why the judgement is defensible
without data.

## Success

The metric that should move, in which direction, by roughly how much, within how long.
A feature whose success cannot be observed cannot be evaluated later, which means it can
never be removed.

## Scope

**Shell order.** Which shell first and why. Default is Android per the roadmap.

**In scope.** The smallest version that would teach us something.

**Out of scope.** What is deliberately excluded so it does not creep back in.

## Invariants touched

From `AGENTS.md`. For each one listed, state how it stays satisfied:

- one audible source at a time
- YouTube URLs resolve on-device only
- every googlevideo request carries a `Range` header spanning ≤ 1 MiB
- library streaming from native shells carries `Authorization: Bearer`
- `mobile/android/` is generated — changes go through `mobile/plugins/`

## Telemetry

Which existing events answer the success question. If a new event is needed, name it and
its properties here — and remember it must be added to `ANALYTICS_EVENTS` and
`docs/product/telemetry.md` in the same commit, and declared to Google Play.

## Design

What the user sees. Link to shots in `.shots/` when they exist. Must be consistent with
the immersive dark-first direction.

## Risks

What could make this the wrong thing to have built, and what would make that visible early.

## Verification

Beyond the standard Definition of Done: what specifically must be checked on a real
device for this feature to count as working.
