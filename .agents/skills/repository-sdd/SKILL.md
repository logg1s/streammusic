---
name: repository-sdd
description: Use when starting or adopting a project, or when building, fixing, changing, or reviewing product behavior. Bootstrap an unadopted repository and keep its product map, code, and checks aligned. Skip explanation-only, cosmetic, and behavior-preserving internal work.
---

# Repository SDD

Use the repository as shared memory so people and AI can move quickly without losing product direction.

## Navigate first

1. Respect whether the user asked for explanation, diagnosis, planning, review, or implementation.
2. Inspect `sdd.config.json`. If `adopted` is false, read [bootstrap.md](references/bootstrap.md) and establish the truthful baseline before implementing a behavior delta. Do this automatically; the user need not mention SDD.
3. Read `AGENTS.md`, `specs/product.md`, `specs/architecture/system.md`, and only the affected domain spec, working change, contracts, ADRs, and nearby tests.
4. Identify the intended outcome, affected requirement IDs, uncertainty, and risk.
5. Choose Fast, Standard, or Critical yourself. Read [change-lanes.md](references/change-lanes.md) only for a behavior change or classification uncertainty.

## Carry the bookkeeping

- Do not ask the user to select a lane, create IDs, fill templates, or run routine commands.
- Fast: make the smallest behavior-preserving edit; no change card.
- Standard: create one compact card, resolve its acceptance criteria, then align the current spec, code, and tests.
- Critical: use the full card; resolve risk, recovery, and decision-owner approval before implementation.
- Keep one writer per working copy. Read [orchestration.md](references/orchestration.md) only when delegation or parallel work could materially help.

## Finish from evidence

- Treat disagreement among the current map, contracts, implementation, and tests as drift to resolve.
- Run `python scripts/verify.py`; it selects the working lane.
- Complete one card with `python scripts/verify.py --completion-gate --change CHG-...`; run the global form without `--change` on the combined state.
- Read [verification.md](references/verification.md) when completing work or diagnosing a failed check.
- Report the delivered outcome, evidence, skipped checks, and remaining decisions in product language.
- After integration, remove the temporary card when convenient; keep durable rationale in the current spec or an ADR.
