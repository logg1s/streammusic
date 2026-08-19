# Working changes

This folder holds short-lived route cards for observable behavior changes.

Create a Standard card:

```text
python scripts/new_change.py account-lockout --owner identity-team --affected ACCOUNTS-001
```

Use `--lane critical --decision-owner <owner>` for high-risk work. IDs use a UTC date plus a random token, so different working copies can create cards without a shared allocator.

Default lifecycle:

```text
draft -> active -> verified -> integrate -> finalize
```

1. Draft the outcome and acceptance criteria.
2. Set `Status: active` after required decisions are clear.
3. Update the current domain spec, implementation, and tests together.
4. Record successful evidence and set `Status: verified`.
5. Run `python scripts/verify.py --completion-gate --change CHG-...` while the card still exists.
6. Integrate the work and run the global `python scripts/verify.py --completion-gate` on the combined state.
7. Remove the card when convenient. Keep or archive it only when the project needs durable change history outside its version-control system.

No pull request, hosting provider, or remote CI service is required by this lifecycle.
