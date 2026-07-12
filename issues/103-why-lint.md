# `why lint` — schema checks on top of OKF validation
Labels: Sandcastle, phase:1

## Context

DESIGN.md §3 ends with the `why lint` contract. OKF conformance is okf-mcp's job; this command enforces the `why`-schema layer above it, using the loaded bundle + diagnostics from the CLI-foundation issue.

## Scope

Rules, each with a stable id (`W###`), a severity (error/warning), file, and message:

- `why:` field validity: unknown `status` for the concept's type, unknown `confidence`, malformed `anchors` entries, malformed `verify` blocks (exact vocab tables: DESIGN.md §2).
- Required sections: `# Why` on every `decision`; `# Citations` on any concept with confidence `inferred` or `speculative`; `# Still true?` on every `constraint`.
- Edge-section targets: links under `# Because of` / `# Instead of` / `# Superseded by` / `# Led to` must resolve to concepts of the types the DESIGN.md §3 table allows.
- Consistency: `status: superseded` ⇔ a `# Superseded by` section with ≥1 link; `status: expired` on a constraint requires `expired_on`.
- Output: human-readable by default (grouped by file), `--json` for machines; exit 0 clean, 1 on any error-severity finding, 2 on usage errors.

## Acceptance criteria

- [ ] `why lint examples/harbor` (or with `--bundle`) exits 0 with no findings — and if it doesn't, the fix is to this command or (only with clear justification in the PR body) to the example bundle.
- [ ] Tests include a fixtures directory of deliberately-broken concepts (built by the tests in a temp dir, not committed to `examples/`), covering every rule id at least once, asserting rule id + severity + file.
- [ ] `--json` output round-trips through `JSON.parse` and carries the same findings.

## Out of scope

Anchor liveness (that's `why doctor`), OKF-level conformance (delegate to okf-mcp, surface its findings pass-through under a distinct rule id).
