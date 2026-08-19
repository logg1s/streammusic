# Change lanes

Choose the lowest lane that covers the real risk. Unresolved uncertainty raises the lane until it is clarified.

## Fast

Behavior and owned contracts do not change. Examples: formatting, comments, or a proven internal refactor.

Required: the focused edit and relevant checks. No change card or reviewer by default.

## Standard

Observable behavior changes inside one bounded domain.

Required: one compact change card, explicit acceptance criteria, current-spec reconciliation, relevant tests, and Standard verification. The card is a route marker, not a project plan.

## Critical

Use for authentication/authorization, money, privacy, public compatibility, migration, destructive operations, cross-domain invariants, regulatory impact, or choices expensive to reverse.

Required: the full Critical card, resolved impact and risks, rollout/recovery, decision-owner approval before implementation, Critical verification, and a newly started read-only reviewer after implementation.
