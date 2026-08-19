# Improvements to revisit

The workflow, review-pressure, and diff-impact improvements are implemented in
[`docs/workflows.md`](workflows.md). The following changes are intentionally
deferred; each changes trust semantics or the security model and deserves its
own design review rather than being folded into workflow plumbing.

## Product-quality evaluation

Mechanical tests prove that the archive behaves consistently, not that the
recovered rationale is useful. Build a benchmark of repositories with known
historical decisions and measure reconstruction precision, important decisions
missed, human edit/acceptance rate, false anchor continuity/loss, answer time,
and draft age/promotion rate. Use those results to decide whether archaeology
is a reliable adoption wedge or primarily migration assistance for capture.

## Claim-level evidence

A concept can contain a recorded intention, an inferred causal claim, and a
measured outcome with different support. Explore claim-level evidence and two
separate dimensions—source provenance and corroboration—without making the
plain-Markdown interface unreadable. Preserve the rule that no renderer may
show a claim more confidently than its evidence permits.

## Warning scope at large bundle sizes

`why blame` currently broadcasts every expired constraint. Measure warning
fatigue on bundles with hundreds of concepts. Likely direction: connected
expiry remains prominent, unrelated expiry becomes a compact health count, and
only explicitly critical constraints broadcast globally. `why impact` already
uses the connected-only behavior as an experiment.

## Evidence security and retention

PR discussions and imported chat/postmortem exports can contain secrets or
sensitive material; `verify.method: check` also executes repository-authored
commands. Design redaction hooks, evidence retention/access rules, and an
explicit trust policy or sandbox for audit checks before recommending `why` for
untrusted repositories or broad organizational ingestion.

## Human-confirmed successor anchors

Whole-subsystem rewrites can preserve a decision while destroying its original
symbol. Add an explicit, reviewable successor operation that links the old and
new anchors without weakening the existing refusal to guess. Evaluate stable
symbol identities and content fingerprints as evidence, but require human
confirmation for semantic succession.

## OKF v0.2 trust in the editorial queue

Why now preserves and reads OKF v0.2 `generated`, `sources`, `verified`,
`stale_after`, and lifecycle fields, but it does not collapse them into the
existing `why.confidence` or `why.review_by` fields. Those concepts answer
different questions: evidence strength, human/machine verification, content
freshness, and editorial scheduling. Extend `why review` to show these as
separate signals, then consider explicit verify/stale filters after user
testing proves the display is understandable.

## Archive migration and richer config composition

Keep existing v0.1 archives readable and migrate them only through an
explicit, reviewed operation. Once upstream migration edge cases are fixed,
add a `why doctor` recommendation that previews `okf-mcp migrate` rather than
silently rewriting history. Config discovery also makes it possible to mount
team policy, product, and personal bundles alongside `.why`; explore
cross-bundle decision impact without assuming every mounted source is writable
or equally trusted.

## Upstream OKF MCP review follow-ups

The 1.3.0 review found issues to resolve upstream before Why relies on the
affected guarantees: project-config writability checks need realpath-aware
symlink containment; partial migrations must not stamp a bundle v0.2;
verification-only updates must preserve generation provenance by default;
malformed verifier records must not raise trust; and nested config typos should
warn. The review also identified duplicated startup/reload config resolution,
an overly broad repair export, inconsistent actor typing, and one source
commit without its required paired test change.
