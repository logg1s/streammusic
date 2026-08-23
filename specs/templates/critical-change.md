# `CHG-YYYYMMDD-xxxxxxxx-short-slug`

Change-ID: `CHG-YYYYMMDD-xxxxxxxx`
Status: draft
Lane: critical
Owner: `<change-owner>`
Decision-Owner: `<product-or-technical-decision-owner>`
Affected-Specs: `<DOMAIN-001, DOMAIN-002, or new>`

## Intent

Describe the user or business outcome, material assumption/non-goal, and why this risk is justified.

## Behavior Change

- Before: `<observable current behavior>`
- After: `<observable intended behavior>`

## Acceptance Criteria

- [ ] `AC-CHG-YYYYMMDD-xxxxxxxx-01`: Given `<context>`, when `<event>`, then `<result>`.
- [ ] `AC-CHG-YYYYMMDD-xxxxxxxx-02`: Given `<failure case>`, when `<event>`, then `<safe outcome>`.

## Impact

- Contracts: `<change or N/A with reason>`
- Data/migration: `<change or N/A with reason>`
- Security/privacy: `<change or N/A with reason>`

## Risks

- `<material risk and mitigation>`

## Rollout and Recovery

- Rollout: `<safe rollout or N/A with reason>`
- Rollback/recovery: `<recovery action or N/A with reason>`

## Plan

- [ ] Update affected current specs or contracts.
- [ ] Implement and test the smallest complete behavior.
- [ ] Run configured repository verification and risk-specific local checks.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `Outcome: AC-CHG-YYYYMMDD-xxxxxxxx-01, AC-CHG-YYYYMMDD-xxxxxxxx-02` | pending | `<local runtime/test evidence that directly exercises the criteria>` |
| `Experience: <journey/input/viewport, or N/A - reason>` | pending | `<clean runtime evidence, or local: why no user-facing surface changed>` |
| `<Standard repository check>` | pending | `<summary or link>` |
| `Risk: <risk-specific local check>` | pending | `local: <risk exercised and result>` |

Remote CI or review links may supplement this local evidence; they do not replace it.

## Open Questions

- `<decision to resolve before implementation, or None>`

## Review

- Decision: pending
- Approved action: `<exact operation and target being approved>`
- Affected boundary: `<data, system, compatibility, or ownership boundary>`
- Recovery accepted: `<specific recovery path accepted by the decision owner>`
- Approval record: `<Decision-Owner, YYYY-MM-DD>`
- Fresh-context review: pending
