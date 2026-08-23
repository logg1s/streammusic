---
name: repository-sdd
description: Use when starting or adopting a project, or when ideating, designing, building, fixing, changing, or reviewing product behavior. Bootstrap an unadopted repository and keep product intent, current truth, code, and checks aligned. Skip explanation-only, cosmetic, and behavior-preserving internal work.
---

# Repository SDD

Carry the map and bookkeeping for the user. Ask about product outcomes and material
decisions, never lanes, IDs, templates, or routine commands.

## Navigate

1. Respect whether the request authorizes explanation, diagnosis, design, review, or
   implementation.
2. Inspect `sdd.config.json`. If `adopted` is false, read
   [bootstrap.md](references/bootstrap.md) and establish current truth before a delta.
3. Read `specs/product.md`, `specs/architecture/system.md`, only the current file that
   owns each affected requirement, nearby contracts/tests, and a matching open card.
   A compact domain may own requirements in `spec.md`; a large domain may route them
   to `parts/*.md`. Exclude `specs/changes/**` from
   broad inventories. Use `python scripts/sdd_status.py` only when inherited or
   parallel state is unclear; do not enumerate change directories or print every
   card's metadata. If an open path must be located, return only open matches with
   `rg -l -g change.md "^Status:.*(draft|active|approved|implementing|verified)" specs/changes`.
   Never open finalized contents for routine work.
4. Identify outcome, observable success, material assumptions/non-goals, affected
   requirement IDs, and risk. For a material unresolved choice, read
   [decision-protocol.md](references/decision-protocol.md). For a new product, broad
   redesign, unclear experience, or explicit ideation/mockup request, read
   [design-protocol.md](references/design-protocol.md). Clear bounded work skips both.

When the user supplies an explicit public contract, treat it as closed scope. Do not
add commands, validation rules, persistence behavior, or UX behavior beyond it unless
needed for a stated safety boundary; record a narrow assumption rather than inventing
plausible product policy.

## Choose the smallest safe path

- Fast: observable behavior and owned contracts stay unchanged; no card. Run only a
  proportionate focused check.
- Standard: one bounded domain behavior changes. Create the compact card directly—do
  not inspect command help or the template first:

  `python scripts/new_change.py <slug> --lane standard --owner "<owner>" --affected <ID[,ID...]>`

  Use `new:<ID>` only while a genuinely new requirement is absent from current specs.
  After adding that requirement to the domain spec, replace `new:<ID>` with `<ID>`
  before setting the card to `verified`.
- Critical: auth, money, privacy, compatibility, migration, destructive data,
  hard-to-reverse work, or a coupled cross-boundary invariant. Read
  [change-lanes.md](references/change-lanes.md), warn with risk/boundary/recovery,
  wait for explicit approval, then create the full card with:

  `python scripts/new_change.py <slug> --lane critical --owner "<owner>" --decision-owner "<approver>" --affected <IDs>`

Keep one writer per working copy. Read [orchestration.md](references/orchestration.md)
only when independent exploration, noisy analysis, or read-only review would help.
Use a stable responsible person, team, or workstream as Owner; do not use the
executing agent's temporary label.

## Keep current truth compact

- Store a fact once at its owner: behavior in domain specs, interface shape in
  executable contracts, physical storage in schema/migrations, rationale in ADRs.
- Preserve only facts that change future product or engineering decisions. Do not
  restate the prompt, code structure, test steps, or schema prose in several files.
- Keep each requirement to an observable rule, essential edge cases, and evidence
  links. Put temporary tasks and alternatives in the open card or working plan.
- If `spec_check.py` reports a map hotspot, read
  [map-maintenance.md](references/map-maintenance.md) and split only that logical
  domain without changing its requirement IDs.

## Finish once

1. Align current specs, code, tests, checked acceptance criteria, passing `Outcome:`
   evidence that names every criterion, and one truthful `Experience:` row. Closely
   related criteria may share an Outcome row.
2. After the last behavior edit, run each genuinely narrower focused command once.
   Do not repeat an unchanged focused command merely to fill or restate evidence. If
   the configured full lane is already the smallest useful check, skip a separate run.
3. Set the integrated card to `verified`, then run
   `python scripts/finalize_change.py --all`. Its built-in structural preflight fails
   before application commands; on success it runs the configured lane once and
   atomically finalizes the batch. Do not run standalone `verify.py` or the configured
   full command immediately beforehand.
   When one user request produces several independent cards in one cohesive delivery,
   keep them verified and finalize that batch once. Do not batch unrelated requests.

Read [verification.md](references/verification.md) only for diagnosis, a card that
must remain open, parallel handoff, readiness without lifecycle transition, or a failed
finalizer. Report outcome, evidence, skipped checks, and remaining assumptions/risks.
After a cohesive milestone, reconcile product outcomes and boundaries once if delivery
changed them; do not touch review dates per card. Finalization does not commit or push.
Before changing writers or handing work to a teammate, create a normal VCS checkpoint.
