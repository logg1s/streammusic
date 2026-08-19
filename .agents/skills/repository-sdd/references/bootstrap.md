# Automatic bootstrap

Use this path only while `sdd.config.json` has `adopted: false`. Do not require the
user to name SDD, choose metadata, or repeat repository instructions.

## Determine the baseline

- New project: derive only what is justified by the user's product request. Ask
  about users, outcomes, boundaries, or a material technology choice when needed.
  An empty app has no current behavior, so bootstrap includes one smallest useful
  vertical slice rather than inventing a completed baseline.
- Existing codebase: inspect source, executable contracts, schemas, and tests first.
  Record current behavior without silently treating guesses as product intent.
- If a material fact cannot be inferred, ask one focused product question and keep
  `adopted` false. Do not fill live specs with invented certainty.

## New project

1. Resolve the initial product/system direction, then define the smallest vertical
   slice and create its card using the normal lane rules—usually Standard, but
   Critical when the risk requires it. Never down-classify a risky first slice just
   to finish adoption; choose a safe foundation slice or complete the Critical path.
2. Scaffold the app, implement that slice, and add an executable application test.
3. Reconcile the implemented behavior into the first current domain spec with
   stable requirement IDs; complete the card and its evidence.
4. Configure that application test/build argv in `verification.standard`, adapt
   `test_roots`, and continue with the shared adoption checks below.

## Existing codebase

1. Resolve `specs/product.md` and `specs/architecture/system.md` from evidence and
   confirmed intent.
2. Create current domain specs for the relevant behavior and stable requirement IDs.
3. Detect a trusted application test/build command and adapt `test_roots`.
4. Finish and verify this behavior-preserving baseline before creating the card for
   the user's requested delta; then use the normal lane workflow.

## Adopt

1. Put at least one application-level test/build argv in `verification.standard`.
   Never use `scripts/spec_check.py`, `scripts/verify.py`, `scripts/new_change.py`,
   or `scripts/tests` as the application's evidence. Version probes, no-op commands,
   and formatting/documentation-only checks do not qualify by themselves.
2. Run `python scripts/spec_check.py --require-configured`.
3. Only after it passes, set `adopted` to true and run
   `python scripts/verify.py --completion-gate`.

Report the product map established, evidence used, unresolved assumptions, and the
ordinary next step. Never mark adoption complete merely to unblock implementation.
