# Project map

This directory is shared memory for people and AI.

```text
product.md                     Product direction and boundaries
architecture/system.md         Major parts, flows, and important boundaries
domains/<domain>/spec.md       Current observable behavior
changes/CHG-*/change.md        Short-lived behavior delta being built
architecture/decisions/        Decisions whose rationale must outlive a change
templates/                     Standard, Critical, domain, and ADR templates
```

## Reading order

For ordinary work, read only:

1. `product.md`;
2. `architecture/system.md`;
3. the affected domain spec;
4. the working change card, contract, ADR, and nearby tests when relevant.

Do not load unrelated domains merely because they exist.

## Current domain specs

- Describe repository HEAD, not a future wish list.
- Use stable IDs such as `AUTH-001`.
- Record business rules, edge cases, and observable outcomes in plain language.
- Link to executable contracts instead of copying schemas into prose.
- Link to tests or other evidence when useful.
- Keep implementation tasks in the working change or agent plan, not the current behavior map.

Canonical ownership is per fact: domain specs own business rules; executable schemas own interface shape; database schema and migrations own physical storage; tests provide evidence. When they disagree, surface and resolve the drift.

## Working changes

- Standard uses the compact change card; Critical uses the extended safety card.
- One change folder owns one behavior delta.
- Resolve product ambiguity before implementation.
- Mark a card `verified` only after its acceptance criteria, current specs, and evidence agree.
- Keep the card until integration or release verification is complete, then remove it when convenient.
- Retain or archive cards only when the project has a real history/audit need.

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
