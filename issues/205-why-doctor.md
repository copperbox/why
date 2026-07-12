# `why doctor` — bundle health report
Labels: phase:2

## Context

DESIGN.md §4 (lost anchors surface here) and §8. The maintenance dashboard: one command that says whether the archive can be trusted right now.

## Scope

Report, grouped and counted: lost anchors (with concept + last-known location), stale `as_of`s (anchor live but `as_of` ≠ HEAD ancestor-of check), constraints with `verify.method: review-by` past due, constraints with `status: unknown`, open `question` concepts (age-sorted), and lint errors (reuse `why lint` internals — do not re-implement rules).

- Human output default; `--json` for machines; exit 0 healthy / 1 any red-severity item (lost anchors and lint errors are red; the rest yellow).
- Keep it read-only.

## Acceptance criteria

- [ ] Temp-bundle test with one of each condition asserts every section appears with the right count and severity.
- [ ] `examples/harbor` (which contains an expired constraint and an open question by design) produces yellow findings for those and exits per the severity rules — pin this in a test so the example and the command stay in sync.
- [ ] `--json` schema is stable and tested.

## Out of scope

Fixing anything (doctor diagnoses; `anchor`/`audit` treat).
