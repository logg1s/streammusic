# Project map

This directory is shared memory for people and AI.

```text
product.md                     Product direction and boundaries
architecture/system.md         Major parts, flows, and important boundaries
domains/<domain>/spec.md       Current observable behavior
domains/<domain>/parts/*.md    Optional capability shards for a large logical domain
changes/CHG-*/change.md        Open behavior delta or inert finalized evidence
architecture/decisions/        Decisions whose rationale must outlive a change
design/<area>/design.md         Accepted cross-feature experience direction, only when needed
templates/                     Standard, Critical, domain, and ADR templates
```

## Reading order

For ordinary work, read only:

1. `product.md`;
2. `architecture/system.md`;
3. the affected requirement owner (`spec.md` or one optional `parts/*.md` file);
4. the working change card, contract, ADR, and nearby tests when relevant.

Do not load unrelated domains merely because they exist.
Exclude `specs/changes/**` from broad file inventories and do not open finalized card
contents during ordinary implementation or resumption.
Load a specific finalized card only for an explicit audit, regression provenance, or
historical rationale missing from current specs and ADRs.

`design/` is conditional, not a required layer. Use it only when an accepted product
experience must guide a new product, multiple features, or a broad redesign. Keep a
bounded design decision in its change card and keep draft alternatives outside the
live map.

## Current domain specs

- Describe repository HEAD, not a future wish list.
- Use stable IDs such as `AUTH-001`.
- Record business rules, edge cases, and observable outcomes in plain language.
- Link to executable contracts instead of copying schemas into prose.
- Link to tests or other evidence when useful.
- Keep implementation tasks in the working change or agent plan, not the current behavior map.
- Keep current truth compact: preserve facts that change future decisions and avoid
  repeating the same prompt, schema, test behavior, or implementation detail across files.
- Keep one observable rule and only its essential edge cases under each requirement;
  use evidence links instead of narrating test steps.
- When `spec_check.py` reports a map hotspot, keep `spec.md` as the domain index and
  move cohesive requirement blocks unchanged into `parts/<capability>.md`. Parts inherit
  domain metadata; requirement and acceptance IDs remain stable.

Canonical ownership is per fact: domain specs own business rules; executable schemas own interface shape; database schema and migrations own physical storage; tests provide evidence. When they disagree, surface and resolve the drift.

## Working changes

- Standard uses the compact change card; Critical uses the extended safety card.
- One change folder owns one behavior delta.
- Resolve product ambiguity before implementation.
- For broad user-facing work, link any accepted mockup or durable design direction;
  current specs still describe delivered behavior, not draft screens.
- Mark a card `verified` only after its acceptance criteria, current specs, and evidence agree.
- Replace every temporary `new:<ID>` in `Affected-Specs` with the reconciled current
  `<ID>` before marking the card `verified`.
- Every completed change acceptance ID appears in passing `Outcome:` evidence; closely
  related criteria may share one row.
  Every completed card also has one passing `Experience:` row: clean runtime evidence
  for a user-facing change, or a local reason that no user-facing surface changed.
- A verified card remains open for lane selection and coordination until combined
  global completion succeeds.
- After combined integration, use `python scripts/finalize_change.py --all`; it
  runs the single authoritative global gate for the verified batch. Do not run a
  standalone `verify.py` or the configured full-lane command immediately before it
  in the same turn, and never type `Status: finalized` by hand.
- Finalized cards are ignored by lane, overlap, current-ID, and historical-link
  checks. They were validated strictly before finalization. Keep them only for a
  real audit need, or delete them later when version history preserves the evidence.
- Finalization proves local evidence but does not commit or push. Before changing the
  writer or handing work to a teammate, create a normal VCS checkpoint. After a
  cohesive milestone, reconcile product outcomes/boundaries once when they changed.

## Stable IDs

Requirement IDs remain stable even when wording changes:

```text
AUTH-001
ORDER-014
```

Change acceptance IDs belong to one temporary delta:

```text
AC-CHG-20260819-a1b2c3d4-01
```

Do not renumber IDs for visual neatness. Retire and replace an ID when its meaning changes substantially.
