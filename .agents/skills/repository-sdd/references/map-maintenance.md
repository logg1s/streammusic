# Map maintenance

Read this only when `spec_check.py` reports a map hotspot or an affected current spec
has become expensive to navigate.

Keep `specs/domains/<domain>/spec.md` as the domain index, purpose, invariants, and
metadata owner. Move cohesive requirement blocks without rewriting them into optional
`specs/domains/<domain>/parts/<capability>.md` files. A part inherits `Spec-ID`, `Owner`,
`Status`, and `Last-Reviewed` from `../spec.md`; do not repeat that metadata.

Preserve requirement and acceptance IDs, links, wording, and behavior during the split.
Each requirement and all of its acceptance criteria stay in the same file. Group by a
capability an agent can load independently, not by technical layer or arbitrary size.
Update the index with short links to the parts, run `python scripts/spec_check.py`, and
do not create a product change card for this behavior-preserving map maintenance.
