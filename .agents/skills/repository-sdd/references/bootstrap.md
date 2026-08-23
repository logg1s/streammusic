# Automatic bootstrap

Use this path only while `sdd.config.json` has `adopted: false`. Do not require the
user to name SDD, choose metadata, or repeat repository instructions.

## Determine the baseline

- New project: derive only what is justified by the user's product request. Ask
  about users, outcomes, boundaries, or a material technology choice when needed.
  An empty app has no current behavior, so bootstrap includes one smallest useful
  vertical slice. For a clear, bounded, one-domain, non-Critical project, that slice
  becomes the initial baseline without a synthetic change card. Use the normal card
  lifecycle when the first slice is Critical, cross-domain, migration-heavy,
  externally compatible, or otherwise too consequential for lean bootstrap.
- Existing codebase: inspect source, executable contracts, schemas, and tests first.
  Record current behavior without silently treating guesses as product intent.
- If a material fact cannot be inferred, follow
  [decision-protocol.md](decision-protocol.md), ask one focused product question, and
  keep `adopted` false. Do not fill live specs with invented certainty.

## New project

1. Frame a short intent handshake from the request: user outcome, observable success,
   material assumptions/non-goals, and any unresolved choice that would change the
   product direction. Ask one focused question only when that choice cannot be inferred;
   use the harness's structured input when the decision has two or three clear options.
2. Only when the initial product or experience direction is materially open, or the
   user explicitly requests ideation/mockup/prototype work, read
   [design-protocol.md](design-protocol.md). Otherwise skip it. When direction is open,
   compare real alternatives and obtain the user's selection before production
   implementation. Preserve only an accepted design that must guide later changes;
   do not turn early drafts into current truth.
3. Resolve the initial product/system direction, then define the smallest vertical
   slice. When it is clear, bounded to one domain, reversible, and non-Critical, use
   lean bootstrap: treat the implemented slice as initial current truth and do not
   create a change card merely to describe a repository that did not exist before.
   Otherwise create its card using the normal lane rules. Never down-classify a risky
   first slice just to finish adoption; choose a safe foundation slice or complete
   the Critical path.
4. Scaffold the app, implement that slice, and add an executable application test.
   For a user-facing slice, capture clean runtime experience evidence at the relevant
   input mode and viewport, then compare the result with the requested outcome and
   any accepted design before expanding the product.
5. Reconcile the implemented behavior into a compact first current domain spec at
   `specs/domains/<domain>/spec.md`, using `specs/templates/domain-spec.md`; do not
   invent an alternate domain path. Use stable requirement IDs and preserve only
   facts that will affect later decisions. Do not repeat the prompt, tests, CLI schema,
   or implementation detail across several documents. When a card was required,
   complete it and its evidence.
6. Configure that application test/build argv in `verification.standard`, adapt
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
   `scripts/sdd_status.py`, `scripts/finalize_change.py`, lifecycle helpers, or
   `scripts/tests` as the application's evidence. Version probes, no-op commands,
   and formatting/documentation-only checks do not qualify by themselves.
2. While `adopted` is still false, run the single final adoption gate. It performs
   the required structural check and the configured application command. Before
   running it, remove every starter/template placeholder from live product, system,
   and domain specs; do not use the adoption gate as a placeholder-discovery loop:
   - lean new-project or existing-code baseline with no open card:
     `python scripts/verify.py --require-configured --lane standard`;
   - new-project first slice with a card:
     `python scripts/verify.py --require-configured --change CHG-...` so its normal
     Standard or Critical lane is inferred.
3. Only after that application gate passes, set `adopted` to true. Do not rerun the
   same application suite or structural check merely to report adoption.
4. Only when a new-project first-slice card exists, run
   `python scripts/finalize_change.py --all`. It performs one adopted global
   completion and leaves the bootstrap card as inert finalized history. A lean
   new-project or existing-code baseline without a card is ready directly.

Report the product map established, first-slice outcome, evidence used, unresolved
assumptions, and the ordinary next step. Never mark adoption complete merely to
unblock implementation or mistake a passing scaffold for product acceptance.
