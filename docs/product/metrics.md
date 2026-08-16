# Metrics

Definitions are fixed here so that a number means the same thing in week 3 and week 30.
Queries live in [`scripts/metrics/`](../../scripts/metrics/).

## North Star

**Weekly listening minutes per weekly active user.**
`scripts/metrics/north-star.sql`

Chosen over "app opens" or "monthly actives" because it is the only one that goes down
when the product gets worse. A recommendation engine that serves songs people skip will
raise opens and lower this.

Source: `play_events` — available today, with history. Note that `/api/plays` discards
plays shorter than 20% of duration, so these are real listening minutes, not taps.

## Input metrics

| Metric | Question it answers | Source | Query |
| --- | --- | --- | --- |
| Radio-seeded session share | Did making autoplay the default actually change behaviour? | `analytics_events` | `radio-quality.sql` |
| Early-skip rate by origin | Are radio picks worse than user picks? | `analytics_events` | `radio-quality.sql` |
| Queue-dry rate | How often does listening just stop? | `analytics_events` | `radio-quality.sql` |
| Plays per session | Are sessions deepening? | `analytics_events` | `radio-quality.sql` |
| W1 / W2 retention | Is this a habit or a novelty? | `play_events` | `retention.sql` |
| Library vs YouTube split | Where should engineering effort go? | `play_events` | `north-star.sql` (extend) |

Early-skip rate **cannot** come from `play_events`: the plays API deliberately drops
short plays so they don't pollute taste scoring. That gap is the single clearest reason
this project needs telemetry at all.

## Reliability SLIs

`scripts/metrics/reliability.sql`. Always read per shell — Tauri blocks on `wait_meta()`
and Android goes through ExoPlayer; the average across shells describes nothing.

| SLI | Target | Breach → |
| --- | --- | --- |
| p95 time-to-first-audio | < 3000 ms per shell | Backlog item next cycle |
| Resolve failure rate | < 2% of play attempts | Postmortem, treated as urgent |
| Error-session rate | < 1% of sessions | Postmortem |

Resolve failure is the highest-severity number in this project. YouTube resolution is a
dependency nobody controls, and a silent rise here is what a broken app looks like from
the outside.

## Baselines

Unset. The first four weekly reviews establish them; until then, read direction and not
absolute values. Recorded here once known, with the date they were measured.

## Rules for reading

- Never compare a shell against another shell. Compare a shell against its own past.
- A week with a release in it is not a normal week. Note releases in the review.
- Small numbers lie loudly. Below ~30 sessions in a bucket, report the count and stop.
