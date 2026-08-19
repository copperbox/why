# Update Log

## 2026-08-17
* Repair sweep (okf-mcp repair): absolute-links-to-relative (14 files)

## 2026-07-15
* re-point anchor: repairStamp renamed to repairOrphan (call-site const made the symbol ambiguous to the grep resolver)
* retitle: drop brackets from title so the generated index bullet stays lintable (W001)
* amend as-of-must-be-an-ancestor: the .sandcastle orphans are now repaired post-merge (orphaned-as-of-is-repaired)
* amend as-of-is-provenance: scope the never-re-stamp rule to readable (clean-ancestor) as_of; orphans are repairable
* decision: why anchor repairs orphaned as_of when the claim verifies at HEAD (durable stamps only)

## 2026-07-14
* capture: record the zero-external-asset serve UI invariant (PRs #28, #33)
* capture: record the in-schema confidence-ladder enforcement (PR #27)
* capture: record why serve as the scoped no-daemon exception (PR #28)
* capture: record the .why/.drafts/ dot-dir never-serves invariant (PR #26)
* capture: record the CLI symlink-resolving direct-run guard (PR #33)

## 2026-07-13
* why init: scaffolded the empty bundle (decisions, constraints, attempts, incidents, questions)
