---
type: decision
title: "why: add outcome-oriented workflows and impact reporting"
description: "Draft captured from PR #43 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-08-19
  captured_on: 2026-08-19
  review_by: 2026-09-02
  owner: "@dantheuber"
  confidence: recorded
  anchors:
    - path: .github/workflows/why-pr-gate.yml
      lines: 29-32
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .mcp.json
      lines: "6"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .mcp.json
      lines: "10"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/anchors-are-written-from-main.md
      lines: "32"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/as-of-is-provenance.md
      lines: "31"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/as-of-must-be-an-ancestor.md
      lines: "53"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/edge-types-by-section-convention.md
      lines: "27"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: "28"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: "28"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/namespaced-why-frontmatter.md
      lines: "27"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/orphaned-as-of-is-repaired.md
      lines: "33"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/orphaned-as-of-is-repaired.md
      lines: "35"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/serve-local-ui.md
      lines: 42-43
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/serve-syntax-highlighting.md
      lines: "41"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/symlink-safe-direct-run-guard.md
      lines: "37"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/ui-data-contract.md
      lines: "19"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/ui-data-contract.md
      lines: "52"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/vscode-decoration-lanes.md
      lines: "54"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/decisions/vscode-extension-standalone.md
      lines: "47"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: .why/log.md
      lines: 3-5
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: CLAUDE.md
      lines: "7"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: DESIGN.md
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/capture.md
      lines: 41-43
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/capture.md
      lines: "81"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/ci.md
      lines: "26"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/ci.md
      lines: 48-52
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/ci.md
      lines: 84-87
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/digging.md
      lines: 7-12
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/digging.md
      lines: "28"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/future-improvements.md
      lines: 1-78
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: docs/workflows.md
      lines: 1-75
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/attempts/striped-rwlock.md
      lines: "19"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/attempts/striped-rwlock.md
      lines: "25"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/constraints/acme-45s-timeout.md
      lines: "23"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/constraints/acme-45s-timeout.md
      lines: "27"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/constraints/acme-45s-timeout.md
      lines: "31"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/47s-request-deadline.md
      lines: "28"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/47s-request-deadline.md
      lines: "32"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/47s-request-deadline.md
      lines: "36"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/queue-based-locking.md
      lines: "29"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/queue-based-locking.md
      lines: 35-36
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/decisions/queue-based-locking.md
      lines: "40"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: examples/harbor/incidents/2024-03-lock-stall.md
      lines: "29"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: HOWTO.md
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: okf.config.json
      lines: 1-8
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package-lock.json
      lines: "12"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package-lock.json
      lines: 15-16
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package-lock.json
      lines: "28"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package-lock.json
      lines: 151-153
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package.json
      lines: "39"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package.json
      lines: "42"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: package.json
      lines: 45-46
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: README.md
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/capture/SKILL.md
      lines: 12-13
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/capture/SKILL.md
      lines: "23"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/capture/SKILL.md
      lines: 94-95
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/dig-synthesize/SKILL.md
      lines: "16"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/dig/SKILL.md
      lines: "18"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/dig/SKILL.md
      lines: 29-32
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/dig/SKILL.md
      lines: 85-86
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: skills/dig/SKILL.md
      lines: "111"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/audit.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/blame.ts
      lines: 7-8
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/blame.ts
      lines: 149-154
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/bundle.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/capture.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/cli.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/export.ts
      lines: "8"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/impact.ts
      lines: 1-164
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/init.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/lint.ts
      lines: 62-64
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/okf.ts
      lines: 1-133
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/review.ts
      lines: 1-165
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: src/workflow.ts
      lines: 1-199
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/audit.test.ts
      lines: 163-164
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/audit.test.ts
      lines: 166-169
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/capture.test.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/impact.test.ts
      lines: 1-113
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/init.test.ts
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/review.test.ts
      lines: 1-62
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/skills.test.ts
      lines: 34-37
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/skills.test.ts
      lines: "54"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/skills.test.ts
      lines: "62"
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/skills.test.ts
      lines: 123-126
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
    - path: test/workflow.test.ts
      lines: 1-95
      as_of: eab8a4457252a5475f7cd367a2a25ccc3d8b9346
      state: live
---

# why: add outcome-oriented workflows and impact reporting

<!-- capture draft from PR #43 (merged 2026-08-19). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: DESIGN.md: 11 hunks collapsed into one whole-file anchor -->
<!-- capture: HOWTO.md: 9 hunks collapsed into one whole-file anchor -->
<!-- capture: README.md: 6 hunks collapsed into one whole-file anchor -->
<!-- capture: src/audit.ts: 5 hunks collapsed into one whole-file anchor -->
<!-- capture: src/bundle.ts: 7 hunks collapsed into one whole-file anchor -->
<!-- capture: src/capture.ts: 16 hunks collapsed into one whole-file anchor -->
<!-- capture: src/cli.ts: 11 hunks collapsed into one whole-file anchor -->
<!-- capture: src/init.ts: 5 hunks collapsed into one whole-file anchor -->
<!-- capture: test/capture.test.ts: 5 hunks collapsed into one whole-file anchor -->
<!-- capture: test/init.test.ts: 5 hunks collapsed into one whole-file anchor -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-43-why-add-outcome-oriented-workflows-and-impact-re.evidence.md (removed on promote) -->

> ## Summary
>
> - Add `bootstrap`, `maintain`, `review`, and `impact` workflow interfaces.
> - Add decision-impact summaries to the PR gate and GitHub job summary.
> - Update OKF v0.2 compatibility, relative links, workflow documentation, and review metadata.
> - Add workflow, impact, initialization, and review coverage.
>
> ## Testing
>
> - `npm test`
> - `npm run why -- lint`
> - `npm run why -- impact "origin/main...HEAD"`
> - Verify the PR gate emits the decision-impact summary.

— PR #43 description by @dantheuber

# Citations

[1] [PR #43: why: add outcome-oriented workflows and impact reporting](https://github.com/copperbox/why/pull/43)
[2] [merge commit eab8a44](https://github.com/copperbox/why/commit/eab8a4457252a5475f7cd367a2a25ccc3d8b9346)
