---
name: vong-harness
description: Orchestrate Vong's agent team across a full piece of work — research, prioritise, spec, build, verify, release, and review the numbers afterwards. Use for anything larger than a single edit, for a development cycle, for "what should we build next", for "ship this properly", and for re-runs like "redo the QA part" or "update the plan with this week's data".
---

# Vong harness — orchestrator

Eight agents in `.claude/agents/`, split into a product branch that decides *what* and an
engineering branch that ensures it is *right*.

| Agent | Owns | Skill |
| --- | --- | --- |
| `product-owner` | roadmap, backlog, PRDs | `product-planning` |
| `feature-scout` | competitive research | `market-research` |
| `data-analyst` | metrics, weekly review, event catalogue | `metrics-review` |
| `design-lead` | design tokens, visual treatment | `design-review` |
| `invariant-guard` | the five hard invariants, incidents | `invariant-check` |
| `cross-shell-qa` | boundaries between shared and the three shells | `shell-parity` |
| `release-conductor` | versioning, builds, publishing | `deploy-web`, `release-android`, `release-windows`, `github-release`, `verify-android` |
| `oss-steward` | contributor-facing files, triage, hygiene | `oss-readiness` |

## Execution mode: sub-agents, not a team

Call agents with the `Agent` tool, using `subagent_type` matching the file name. Run
independent agents concurrently in a single message; wait for a phase to finish before
starting one that depends on it.

Agents share work through **files**, not through conversation:

- durable decisions → `docs/product/`
- intermediate findings → `_workspace/{phase}_{agent}_{artifact}.md`
- code → the repo

Never paraphrase one agent's output into another's prompt. Point the second agent at the
file. Paraphrase is where a "measured" number quietly becomes a "roughly".

## Phase 0 — context check, always first

1. Does `docs/product/` exist? If not, this is a first run: `product-owner` establishes it.
2. Is there a review in `docs/product/reviews/`? If not, say plainly that prioritisation
   this round is judgement, not evidence.
3. Is `_workspace/` present from a previous run?
   - present, and the user asked for a partial change → **partial re-run**: call only the
     affected agents, leave the rest of the artefacts alone
   - present, and this is new work → move it to `_workspace_prev/` and start fresh
   - absent → **first run**

## Phases

**1 · Understand** (concurrent) — `data-analyst` for what the numbers say,
`feature-scout` for what is missing versus other apps. Skip the scout for engineering-only
work.

**2 · Decide** (single) — `product-owner` scores the backlog, picks one cycle goal, writes
the PRD. One goal; two goals means neither is one.

**3 · Shape** (concurrent, only if the goal has UI or touches an invariant) —
`design-lead` specifies the surface, `invariant-guard` confirms the approach *before* code
is written. Confirming afterwards means finding out at the end that the design was never
possible.

**4 · Build** — the main session implements, Android first unless the PRD says otherwise.

**5 · Verify** (concurrent) — `cross-shell-qa` for the boundaries, `invariant-guard` for
the tripwire and the diff. Run per module as it lands, not once at the end.

**6 · Ship** (single) — `release-conductor`. A red gate stops the release; it does not
become a footnote in the announcement.

**7 · Learn** — `data-analyst` writes the next review against the PRD's success criterion.
This closes the loop: the feature that shipped is now evidence for the next cycle.

## Error handling

Retry a failed agent once. On a second failure, continue without it and **name the gap in
the report** — a phase silently skipped is how a harness starts producing confident,
incomplete work.

When two agents disagree — the scout says users expect X, the analyst says nobody uses the
existing X — keep both, attributed, and let `product-owner` decide in writing. Never
average conflicting findings into one smooth statement.

Never let a verification failure be resolved by rerunning until it passes. Flaky is a
finding.

## Test scenarios

**Normal flow.** "Plan and ship the next cycle." → Phase 0 finds `docs/product/` and one
review → analyst and scout run concurrently → owner picks one goal and writes a PRD →
design and invariant approval → build → QA and guard verify → release → review. Expect
edits in `docs/product/`, a PRD file, and a release.

**Error flow.** "Ship the next cycle" with `DATABASE_URL` unset → `data-analyst` stops and
says the numbers are unavailable rather than estimating → orchestrator continues with the
scout's findings, and the report states that prioritisation this cycle had no data behind
it → `product-owner` marks affected backlog rows `guess`, not `measured`.

**Partial re-run.** "Redo just the QA on the mobile changes" → Phase 0 finds `_workspace/`
→ only `cross-shell-qa` and `invariant-guard` run → the plan and PRD are untouched.
