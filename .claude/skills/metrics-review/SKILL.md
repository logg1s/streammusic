---
name: metrics-review
description: Run Vong's metric queries and write the weekly review — listening minutes, retention, radio quality, skip rate, time-to-first-audio, resolve failures. Use for the weekly business review, before prioritising the backlog, after a release, when asked how the app or a feature is doing, when a number is needed to settle an argument, or when defining a new metric or event.
---

# Metrics review

## Where things are

- Definitions and thresholds: `docs/product/metrics.md`
- Queries: `scripts/metrics/{north-star,retention,radio-quality,reliability}.sql`
- Output: `docs/product/reviews/YYYY-Www.md`, from `reviews/TEMPLATE.md`

## Running the queries

The database is Neon Postgres; the connection string lives in `.env.local` as
`DATABASE_URL`. Either open a SQL session against it, or run a query through drizzle with
`dotenv -e .env.local -- tsx`, following the pattern in `scripts/verify-metadata.ts`.

If `DATABASE_URL` is unavailable, **stop and say so**. Estimated numbers in a review are
worse than no review, because they get quoted later as if they were measured.

## Two sources, different questions

`play_events` — per-user, has history, powers North Star and retention. It discards plays
under 20% of duration, so it can say nothing about skipping.

`analytics_events` — anonymous, no `userId`, no foreign key to `user`. Powers radio
quality, TTFA, reliability. **Never join it to `play_events`**: the separation is the
privacy design, and a join would reconstruct exactly what the design refuses to build.

## Writing the review

1. Copy `docs/product/reviews/TEMPLATE.md` to `docs/product/reviews/YYYY-Www.md`.
2. Fill the table. Buckets under ~30 events: write the count, draw no conclusion.
3. Compare each shell against **its own** previous weeks, never against another shell.
4. Note any release in the period — a release week is not a normal week.
5. Check every SLI against its threshold in `metrics.md`. A breach means telling
   `invariant-guard` and opening `docs/incidents/`, not a footnote.
6. Write the **Decisions** section. This is what makes it a review rather than a report: a
   week of numbers that changes nothing in `backlog.md` or `roadmap.md` should say so
   explicitly, as a decision.
7. Carry forward unanswered questions from the previous review. The same question open for
   three weeks is itself a finding.

## Adding a metric or event

A question the current events cannot answer becomes backlog work, not a guess. Name the
event, its properties, and say the cost out loud: `ANALYTICS_EVENTS` in
`packages/shared/src/analytics.ts`, the table in `docs/product/telemetry.md`, and the
Google Play Data safety declaration before the next store submission — all three, in the
same change.

Properties must be bounded labels, numbers or booleans. Never free text: `sanitizeProps()`
will drop it, and if it somehow survived it would turn an anonymous counter into a
listening profile.

## Reporting back

Lead with the number that argues against the current plan. Nothing else in this project
will catch wishful prioritisation if the analysis softens it first.
