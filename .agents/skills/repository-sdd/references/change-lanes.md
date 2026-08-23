# Change lanes

Choose the lowest lane that covers the real risk. Unresolved technical uncertainty can
raise the lane until it is clarified; an unresolved material product decision stops
implementation and follows [decision-protocol.md](decision-protocol.md).

The conditional [design protocol](design-protocol.md) resolves product and experience
direction before production implementation. It is not a fourth lane and does not make
a change Critical. After direction is clear, classify the implementation by observable
behavior and risk as usual.

## Fast

Behavior and owned contracts do not change. Examples: formatting, comments, or a proven internal refactor.

Required: the focused edit and proportionate evidence. Code-affecting refactors
need the smallest relevant application test; cosmetic/docs-only edits need only
relevant lint or structure checks. If no Fast command is configured, run any needed
focused check separately. No change card or reviewer by default.

## Standard

Observable behavior changes inside one bounded domain.

A vertical slice may touch UI, API, and storage and still be Standard when those
technical layers implement one bounded behavior without a coupled high-risk invariant.

Required: one compact change card, explicit acceptance criteria, current-spec
reconciliation, relevant tests, direct `Outcome:` evidence for every criterion, one
resolved `Experience:` row, and Standard verification. For user-facing work, the
experience evidence covers the affected journey, state, input mode, and target
viewport; for internal work it records a concrete local reason that no surface changed.
The card is a route marker for one bounded outcome, not a project plan. Carry this
bookkeeping without a process announcement once the observable outcome is clear.

## Critical

Use for authentication/authorization, money, privacy, public compatibility,
migration, destructive operations, regulatory impact, choices expensive to reverse,
or a coupled invariant whose failure crosses an ownership, security, compatibility,
or atomicity boundary.

Required: the full Critical card, resolved impact and risks, rollout/recovery,
decision-owner approval before implementation, configured repository verification,
risk-specific local evidence, and a newly started read-only reviewer after
implementation. Before implementation, give one concise warning that names the
material risk, affected boundary, recovery path, and exact decision requested.
Blanket approval is insufficient: record the exact approved action and target,
affected boundary, accepted recovery path, Decision-Owner identity, and approval date.
An empty `verification.critical` means there is no extra configured command; it
does not waive targeted checks or evidence for the material risks. Completed
Critical cards record passing Outcome and Experience evidence plus at least one
`Risk: ... | pass | local: ...` evidence row.
