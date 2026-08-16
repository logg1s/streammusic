# How Vong is run

Vong is a small project run with a deliberately explicit product process. The point is
not ceremony — it is that **every decision has a written reason and a number attached to
it**, so a contributor who arrives six months from now can tell why the app looks the way
it does, and so priorities change when reality changes rather than when someone's mood
does.

This directory is the source of truth for *what* gets built. `AGENTS.md` at the repo root
is the source of truth for *how* it gets built.

## The documents

| File | Owns | Changes when |
| --- | --- | --- |
| [`roadmap.md`](roadmap.md) | Stages, current focus, what is explicitly not being done | A stage completes, or a review changes direction |
| [`backlog.md`](backlog.md) | Scored candidate work | Every planning cycle |
| [`metrics.md`](metrics.md) | Metric definitions and thresholds | Rarely — a metric definition that drifts is worthless |
| [`telemetry.md`](telemetry.md) | Exactly which events are collected and why | Any change to `ANALYTICS_EVENTS` — no exceptions |
| [`prd/`](prd/) | One spec per non-trivial feature | Before the feature is built, not after |
| [`reviews/`](reviews/) | Weekly numbers and what they mean | Weekly |

## The cadence

**Weekly review** — run the queries in `scripts/metrics/`, write `reviews/YYYY-Www.md`.
Three questions only: what moved, what did we expect to move, what will we do about the
gap. A review that lists numbers without a decision is a status report, not a review.

**Cycle planning (2 weeks)** — re-score `backlog.md` using the latest review, pick the
cycle goal, write a PRD for anything larger than a day's work. One goal per cycle. Two
goals means neither is a goal.

**Release train** — cut a release when a cycle's work is verified, not on a fixed date.
Android first (see priority order in `roadmap.md`), then web, then Windows. The four
release skills in `.claude/skills/` carry the mechanics.

**Postmortem** — opened when a reliability threshold in `metrics.md` is breached. Written
to `docs/incidents/`. Blameless, and it must end with a check that would have caught it.

## Definition of Ready

A backlog item may not enter a cycle until:

- the user-visible problem is stated in one sentence, from the user's point of view
- the target shell is named, and the reason it goes first is given
- the metric that should move is named, with the current value
- any hard invariant from `AGENTS.md` it touches is listed
- the smallest version that would teach us something is described

## Definition of Done

- verification commands in `AGENTS.md` pass for every shell touched
- `npm test` covers the new logic if it lives in `packages/shared`
- behaviour verified on a real Android device or emulator when the mobile shell changed
- if it added or changed an event, `telemetry.md` was updated in the same commit
- user-facing strings are Vietnamese; docs and commit messages are English
