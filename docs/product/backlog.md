# Backlog

Scored candidates. Re-scored every cycle from the latest weekly review. Nothing enters a
cycle without meeting the Definition of Ready in [`README.md`](README.md).

**Impact** — how much it moves a metric in [`metrics.md`](metrics.md).
**Effort** — S (< 1 day), M (a few days), L (a cycle or more).
**Evidence** — where the item came from. `guess` is not disqualifying, but a `guess` must
never outrank a `measured` at equal impact.

## Ready

| # | Item | Shell | Impact | Effort | Evidence | Invariants touched | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ 1 | Wire telemetry events + Settings opt-out | all | Unblocks every other decision | M | measured (no data exists) | none | code done 2026-08-16 — pipeline, opt-out and all 11 events. **Not yet in users' hands**: every telemetry commit landed after the v0.3.0 tag, so the released APK/exe emit nothing. See item 13 |
| ✅ 2 | LICENSE (AGPL-3.0), CONTRIBUTING, SECURITY, CoC, issue/PR templates | repo | Contributor pipeline | S | measured (files absent) | none | done 2026-08-16; security contact is a real address (`SECURITY.md`) |
| ~~3~~ | ~~Remove committed `Vong_0.1.0_arm64.apk`~~ — **not a real item**: `git log --all` shows it was never committed and `.gitignore` already matched `/Vong_*.apk`. It was an untracked build artefact; deleted from the working tree. A cautionary example of an item scored `measured` on an unverified assumption | repo | — | — | measured, wrongly | none |
| ✅ 4 | CI runs `npm test` + `cargo clippy` | repo | 74 tests existed and never ran on PRs | S | measured | none | done 2026-08-16; unverified on Actions (billing lock) |
| ✅ 5 | Invariant check script wired into CI | repo | The five hard rules in `AGENTS.md` were unenforced | M | measured | all five | done 2026-08-16 |
| 13 | Ship v0.3.1 so telemetry reaches devices + update Play Data safety | all | Starts the baseline clock that items 6–12 all wait on | S | measured (commit order vs `v0.3.1` tag) | none | **the gating item** — until it ships, "four weekly reviews" has not begun |

## Candidates — need evidence before they can be ranked

| # | Item | Shell | Impact | Effort | Evidence | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | Tauri next-track prebuffer + forward-seek range request | windows | Cuts gap between tracks | M | code TODO | Blocked on `wait_meta()`; check p95 TTFA first |
| 7 | Seek buffer tuning | android | Scrub responsiveness | S | code TODO | 30s back-buffer already landed |
| 8 | Resolve-failure fallback path | all | Reliability | L | guess | Wait for `resolve_fail` baseline — may not be a real problem |
| 9 | Sleep timer | android | Retention (night listening) | S | guess | Cheap; good first contribution |
| 10 | Queue reorder by drag | web, android | Control | M | guess | Unvalidated — autoplay may have removed the need |
| 11 | Lyrics | all | Engagement | L | guess | Licensing question before engineering question |
| 12 | Offline downloads | android | Retention | L | guess | Largest item on this list; needs retention data first |

## Rejected

| Item | Why not |
| --- | --- |
| iOS shell | A fourth surface to keep in sync with no distribution path |
| Social / sharing feed | Not what this product is; would compromise the anonymity of the data model |
| Third-party analytics SDK | Would put user behaviour on someone else's infrastructure — see `telemetry.md` |
