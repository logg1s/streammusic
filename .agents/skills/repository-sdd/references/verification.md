# Verification and completion

Repository verification is authoritative. Local hooks and remote automation are optional adapters that call the same commands.

## Everyday check

```text
python scripts/verify.py
```

The runner reads working change cards, selects the highest lane, validates the map, and executes cumulative project commands from `sdd.config.json`.

## Completion check

```text
python scripts/verify.py --completion-gate --change CHG-YYYYMMDD-xxxxxxxx
python scripts/verify.py --completion-gate
```

Use the scoped form when one card is ready but other teammates still have draft or active cards. Use the global form on the combined repository state before finalize or release.

Completion requires:

- `adopted: true` and a configured Standard project command;
- the named card at `Status: verified` for scoped completion, or every remaining card for global completion;
- checked acceptance criteria and successful evidence;
- new behavior reconciled into current domain specs;
- Critical approval, recovery, and fresh-review evidence when applicable.

Report exact commands and results, meaningful evidence, unexpected working-tree changes, skipped checks, and remaining risk. Never describe a skipped command as passing.
