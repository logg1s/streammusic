# Change lifecycle

This folder holds route cards for observable behavior changes. Open cards guide
work; finalized cards are inert evidence and may be deleted later.

Create a Standard card:

```text
python scripts/new_change.py account-lockout --owner identity-team --affected ACCOUNTS-001
```

Use `--lane critical --decision-owner <owner>` for high-risk work. IDs use a UTC date plus a random token, so different working copies can create cards without a shared allocator.

Default lifecycle:

```text
draft -> active -> verified -> integrate -> finalized
```

1. Draft one bounded outcome, material assumptions/non-goals, and acceptance criteria.
2. Set `Status: active` after required decisions are clear.
3. Update the current domain spec, implementation, and tests together.
4. Record a passing `Outcome:` row naming every AC and one resolved `Experience:`
   row. For UI work, inspect a clean final artifact; for internal work, record a
   concrete local reason that no user-facing surface changed. Then set `Status: verified`.
5. If teammates still have working cards, optionally run
   `python scripts/verify.py --completion-gate --change CHG-...` as a readiness handoff.
6. Integrate the intended work in the combined working copy.
7. Run `python scripts/finalize_change.py --all`. When one request produced several
   independent cards in one cohesive delivery, keep them verified and finalize that
   batch together; do not batch unrelated requests. The finalizer runs one global completion
   before atomically changing each verified card Status to `finalized`. Repeat
   `--change CHG-...` in one command only for a deliberately selected batch.

`verified` is still open: it participates in lane selection and overlap warnings
until finalization. `finalized` is inert history; current requirement IDs and links
may evolve without invalidating it. It may remain for audit or be
deleted later when version control or project policy already preserves what matters.
Never edit a card directly to `finalized`; the command has no force or
skip-verification path.

No pull request, hosting provider, or remote CI service is required by this lifecycle.
