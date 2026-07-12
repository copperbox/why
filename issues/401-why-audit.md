# `why audit` — constraint re-verification and the scar-tissue report
Labels: phase:4

## Context

DESIGN.md §5 — the payoff feature: constraints must be falsifiable, and expiry must propagate to the decisions downstream. This is the command that tells a team "the wound healed; you can simplify now."

## Scope

- Sweep `active` constraints: run `verify.method: check` commands (sandboxed to the repo dir, with a timeout, output captured); collect `method: ask` items into an agent-consumable questionnaire (`--questions-out`, markdown) rather than calling an LLM from the CLI; flag overdue `review_by` dates.
- A failed `check` (or an `--answers` file marking an `ask` as no-longer-true) flips the constraint: `status: expired`, `expired_on` set, `# Still true?` section appended with the evidence — via the frontmatter/section-patch write path, preserving the rest of the file.
- Blast radius: for each newly-expired constraint, walk `# Because of` edges backwards; every `active` decision reached gets (a) a line in the audit report and (b) a generated `question` concept ("constraint X expired — is decision Y still needed?") linking both, unless an equivalent open question already exists (dedupe by link pair).
- Report: human summary + `--json`; exit 1 when anything expired (CI signal for "the archive learned something").

## Acceptance criteria

- [ ] Temp-bundle tests: passing check (no change), failing check (flip + blast radius + question generated), duplicate-question suppression, overdue review_by flagged, `ask` items exported not executed.
- [ ] `examples/harbor`: audit must NOT double-flag the already-expired Acme constraint but should detect the 47s decision's existing candidacy (assert the report mentions it without writing a duplicate question).
- [ ] Byte-preservation test: an audited-but-unchanged concept file is untouched.

## Out of scope

Automatically changing code or reverting decisions — audit reports, humans/agents act.
