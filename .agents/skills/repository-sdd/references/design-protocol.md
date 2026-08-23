# Product and experience design protocol

Use this protocol only for a new product, a major user journey or redesign, a
materially unclear experience, or an explicit ideation, wireframe, mockup, or prototype
request. Skip it for a bounded change with an established direction and for internal
work with no user-facing consequence. This protocol resolves direction before the
normal implementation lane; it is not a lane or an approval ceremony.

## Discover just enough

Inspect the product map, system map, current domain behavior, existing design system,
runtime, and relevant user evidence before asking questions. Build a compact discovery
snapshot:

- primary user, context, and job to be done;
- problem, desired outcome, and observable success;
- constraints and explicit non-goals;
- target platforms, viewports, input modes, content, and accessibility needs;
- the few assumptions or decisions that could materially change the solution.

Infer safely from repository evidence. Ask one focused question only when the answer
would change navigation, information architecture, workflow, platform behavior, cost,
or visual direction. Use the decision protocol for two or three viable options; keep
open-ended discovery conversational.

## Explore real directions

When direction is materially open, produce two or three genuinely distinct product or
experience directions—not cosmetic variants. Compare each against user value,
simplicity, reversibility, growth path, implementation cost, and material risk. Put the
simplest adequate recommendation first and explain the trade-off in product language.
Use structured user input when the harness provides it and obtain a selection before
production implementation when the choice materially affects the product.

Do not manufacture alternatives when one direction is already supported by the request
and repository. State that direction and proceed.

## Make the smallest faithful artifact

Before production code for a broad user-facing change, create the lowest-cost artifact
that resolves the remaining ambiguity:

- a flow or wireframe when sequence or information structure is uncertain;
- a runnable HTML, framework, or native prototype when interaction and layout matter;
- generated imagery only for mood, visual exploration, or assets—not as the functional
  source of truth for exact interface behavior.

Use the harness capabilities already available; do not require a particular design
service. Cover the main journey plus the states relevant to the decision, such as
loading, empty, error, validation, success, and destructive confirmation. Exercise the
target viewport and input model (keyboard, touch, remote/D-pad) and check readable
hierarchy, focus, contrast, labels, and basic accessibility. Reuse the product's design
system before inventing new patterns.

Show the artifact and request focused feedback on the decisions it was built to test.
Require explicit selection only when the answer changes a material direction. If the
user requested only ideation, a mockup, or a review, deliver that artifact and stop;
do not infer authorization to implement the product.

## Preserve only accepted direction

Draft alternatives are working material, not live specifications. Record the selected
direction and rationale in the narrowest durable place:

- use the change intent, acceptance criteria, or evidence for a bounded change;
- use `specs/design/<area>/design.md`, based on
  `specs/templates/design-brief.md`, only when the accepted direction must guide a new
  product, multiple features, or a broad experience over time;
- use an ADR only for an architectural decision whose rationale must outlive the change.

Link accepted mockups or prototypes instead of duplicating them. A durable accepted
artifact must use a repository-relative path or stable shared URL, never a machine-local
or temporary harness path. A broad UI card may add a
`Design: <selected direction or artifact>` evidence row, but the existing
`Outcome:` and `Experience:` requirements remain authoritative.

## Implement and reconcile

After direction is accepted, classify the implementation normally and build the
smallest useful vertical slice. Compare the clean runtime journey with the requested
outcome and accepted design. Record intentional differences and seek feedback only
when they materially change the next slice. Update current domain specs with delivered
behavior, not unimplemented screens or draft ideas.
