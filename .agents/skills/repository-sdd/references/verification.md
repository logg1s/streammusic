# Verification and completion

Repository verification is authoritative. Local hooks and remote automation are optional adapters that call the same commands.

## Diagnostic or leave-open check

```text
python scripts/verify.py
```

The runner reads open change cards, selects the highest lane, validates the map, and
executes cumulative project commands from `sdd.config.json`. Use it during diagnosis,
when a card will remain open at `verified`, or for readiness without a lifecycle
transition. It is not a ritual required immediately before finalization.

Open cards include both work in progress (`draft`, `active`, `approved`,
`implementing`) and cards at `verified` awaiting combined completion. A verified
Critical card therefore keeps Critical verification active. A `finalized` card is
historical and does not affect lane selection or overlap warnings. Do not load
finalized card contents during ordinary work.

## Completion check

```text
python scripts/verify.py --completion-gate --change CHG-YYYYMMDD-xxxxxxxx
python scripts/verify.py --completion-gate
```

Use the scoped form when one card is ready for a parallel handoff but other
teammates still have draft or active cards. Use the global form for an explicit
readiness/release check. Neither is a required extra run immediately before the
finalizer, because the finalizer performs its own global completion.

For a local single-card change that is already integrated, the lean finish is:

1. run only genuinely narrower application checks needed for truthful evidence; if
   the configured full lane is already the smallest useful check, skip this step;
2. reconcile current specs, check acceptance criteria, record evidence, and set the
   card to `verified`;
3. run `python scripts/finalize_change.py --all` once.

Do not insert a standalone `verify.py` or invoke the configured full-lane command
directly between steps 2 and 3. The finalizer first runs structural completion; if
that fails, no application command or lifecycle mutation occurs. It then owns the
single authoritative configured verification for that lifecycle transition.

Scoped completion requires the named card to be `verified`, runs its declared lane,
and never finalizes it. Global completion requires every open card to be `verified`
and runs the highest open lane. With no open card, global completion still runs the
Standard adoption baseline.

Completion requires:

- `adopted: true` and a configured Standard project command;
- the named card at `Status: verified` for scoped completion, or every remaining card for global completion;
- checked acceptance criteria and successful evidence;
- every change acceptance ID named by a passing `Outcome:` evidence row;
- one passing `Experience:` row with clean runtime evidence for a user-facing change,
  or `Experience: N/A - <reason> | pass | local: <why no surface changed>` for internal work;
- new behavior reconciled into current domain specs;
- Critical approval, recovery, and fresh-review evidence when applicable.

An Outcome row proves the observable criterion rather than merely naming a command.
An Experience row records the relevant journey, state, input mode, and viewport.
For visual work, inspect the final artifact itself: a test cannot make a screenshot
with debug overlays, placeholder content, broken focus, unreadable truncation, or an
obvious layout defect acceptable. Evidence can cover multiple AC IDs in one row when
one runtime scenario genuinely exercises them.

When a Critical lane has no configured Critical-specific command, cumulative
Standard commands still run. Add the smallest local checks that exercise each
material risk and record at least one passing
`Risk: ... | pass | local: ...` evidence row. Use `required_test_ids` for stable current
requirement or domain-acceptance IDs whose regression coverage must remain
enforced; do not use temporary `AC-CHG-*` IDs. Remote CI links are supplemental.

## Finalize

```text
python scripts/finalize_change.py --all
```

Run this after the intended changes are present in the combined working copy. It
performs one global completion while every target is still `verified`, protects the
repository SDD state even without Git, then atomically changes each target Status to
`finalized`. Use repeated `--change CHG-...` for a deliberately selected batch. It
has no force or skip-verification mode. If any open card is still working, the
global gate fails and no lifecycle state changes. A rare filesystem failure between
cards leaves a safe mixed state (`finalized` plus `verified`); fix the filesystem
issue and rerun the same command.

Report exact commands and results, meaningful evidence, unexpected working-tree changes, skipped checks, and remaining risk. Never describe a skipped command as passing.
