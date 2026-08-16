---
name: product-planning
description: Plan what Vong builds next — score the backlog, pick a cycle goal, write or review a PRD, update the roadmap. Use when prioritising, when deciding whether a feature is worth building, when someone proposes a feature, when planning a cycle or sprint, and when re-planning after a weekly review or a shipped release.
---

# Product planning

## Read before deciding

1. `docs/product/README.md` — Definition of Ready and Done
2. The newest file in `docs/product/reviews/` — if none exists, say plainly that you are
   prioritising without data
3. `docs/product/roadmap.md` — the standing decisions you are not re-arguing
4. `docs/product/backlog.md` — including the Rejected table

## Scoring a backlog item

Four columns, in this order of authority:

**Evidence** — `measured` (a number in a review or a fact in the repo) or `guess`. At
equal impact, `measured` always outranks `guess`. When you demote your own idea on this
rule, say so; it is the rule that keeps the backlog honest.

**Impact** — which metric in `metrics.md` moves, and roughly how much. "Improves UX" is
not an impact; name the metric or admit you cannot.

**Effort** — S (< 1 day), M (a few days), L (a cycle or more).

**Invariants touched** — from `AGENTS.md`. Anything touching one needs `invariant-guard`
to confirm the approach before work starts, not after.

Order by impact per unit of effort, then break ties with Evidence. Where the order looks
wrong to you afterwards, that usually means an impact estimate is inflated — fix the
estimate rather than overriding the order silently.

## Choosing the cycle goal

One goal. Two goals means neither is a goal — if asked for two, name the trade-off and
make the choice explicit rather than accepting both.

The goal must be shippable within the cycle on at least one shell. Android first, unless
there is a stated reason otherwise.

## Writing a PRD

Copy `docs/product/prd/TEMPLATE.md` to `docs/product/prd/{slug}.md`. The sections that
usually get skipped and must not be:

- **Success** — the metric, the direction, roughly how much, by when. If success cannot be
  observed, the feature can never be evaluated later, which means it can never be removed.
- **Out of scope** — what is deliberately excluded, so it does not creep back in.
- **Telemetry** — which existing events answer the success question. A new event costs a
  `telemetry.md` update and a Play Store declaration; say that cost in the PRD.
- **Risks** — what would make this the wrong thing to have built, and what would make that
  visible early.

## Updating the roadmap

Roadmap changes need a change-log row: date, change, why. Amend the file; never regenerate
it. The change log and the Rejected table are this project's memory of decisions that were
expensive to make, and rewriting loses precisely those.

Moving something to Later is a real decision and belongs in the log. So does a standing
decision reversed by evidence — that is the log's most valuable entry, not an embarrassment.

## Handing off

- A number you need → `data-analyst`
- How another app solves it → `feature-scout`
- Whether the approach breaks an invariant → `invariant-guard`
- What it should look like → `design-lead`

Do not estimate any of these yourself. The whole point of the split is that each answer
comes from whoever can actually check it.
