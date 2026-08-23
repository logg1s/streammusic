# Decision protocol

Use this only when a missing product decision could materially change user experience,
data, architecture, cost, compatibility, risk, or an external action.

## Resolve before asking

1. Inspect the product map, current specs, code, contracts, tests, and existing decisions.
2. If the ambiguity is minor, reversible, and local, state the assumption when useful
   and continue. Do not ask the user to choose SDD metadata, IDs, lanes, file names, or
   routine implementation details.
3. If the answer is open-ended discovery rather than a choice among known alternatives,
   ask one concise free-form question.

## Present a real choice

When one material decision has two or three viable, mutually exclusive options:

- Use the harness's native structured user-input mechanism when it is available.
- In Codex, call `request_user_input` when that tool is exposed; do not imitate the
  choice UI in prose while the native tool is available.
- Normally ask one decision at a time. Group at most three questions only when their
  answers are tightly coupled and separating them would mislead the user.
- Offer two or three options. Put the recommended option first and label it as the
  recommendation (for label-based UIs, suffix it with `(Recommended)`); explain its
  effect or trade-off in one short sentence.
- Keep a free-form path for a different answer. Do not add a duplicate `Other` option
  when the interface already provides one.
- Do not disguise a predetermined answer as a choice. The options must lead to
  meaningfully different product outcomes.

If structured input is unavailable, present the same compact choice in ordinary text.
Do not continue past a material unresolved decision merely because the harness lacks a
special UI.

## Preserve the answer

Record the selected option and concise rationale where it needs to remain true:

- in the working change's Intent when it is local to that change;
- in the current product or domain spec when it defines current behavior;
- in an ADR only when an architectural choice must outlive the change.

Critical approval remains a separate explicit authorization. A structured selection
can capture that authorization only when the prompt clearly states the material risk,
affected boundary, recovery path, and exact action being approved.
