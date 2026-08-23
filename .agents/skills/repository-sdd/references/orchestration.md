# Teamwork and agents

Do not delegate by default. Delegate only when independent exploration, noisy tests/logs, or a fresh review will save time or protect the main context.

## Boundaries

- The main agent owns requirements, decisions, writing, integration, and the final claim.
- Keep product exploration, experience review, safety review, and noisy log analysis agents read-only.
- Keep one writer per working copy.
- If parallel writers are truly useful, isolate them in separate branches, worktrees, or copies with non-overlapping files or domains.
- Critical completion requires a newly started reviewer that sees final specs, acceptance criteria, diff, recovery plan, and evidence—not the writer's conclusions.
- A broad or ambiguous product change may use one read-only explorer to challenge the
  discovery snapshot and compare genuinely different directions before user selection.
  It must not choose for the user or mutate design artifacts. A major user-facing change
  may use one read-only experience reviewer after the mockup is accepted or on final
  runtime evidence. Neither creates another writer or a new lane.
- Use one focused reviewer by default. Repeat only after blocker remediation materially
  changes the artifacts that reviewer inspected.

Ask a reviewer for concise prioritized findings, open decisions, and exact evidence.
A single project `reviewer` role can review discovery, an accepted design, final user
experience, and
Critical safety; freshness comes from starting a new review, not from maintaining
multiple personas.
Treat missing risk-specific local evidence or an explicit Critical approval record
as a blocker; remote automation status alone is not completion evidence.
