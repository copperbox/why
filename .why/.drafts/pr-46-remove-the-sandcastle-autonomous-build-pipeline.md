---
type: decision
title: Remove the Sandcastle autonomous build pipeline
description: "Draft captured from PR #46 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-10-28
  captured_on: 2026-10-28
  review_by: 2026-11-11
  owner: "@dantheuber"
  confidence: recorded
  anchors:
    - path: .gitignore
      lines: "8"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/autonomous-build-via-sandcastle.md
      lines: "9"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/autonomous-build-via-sandcastle.md
      lines: "11"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/autonomous-build-via-sandcastle.md
      lines: 18-19
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/autonomous-build-via-sandcastle.md
      lines: "28"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: "9"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: "11"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: 18-19
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: "32"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: "9"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: "11"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: 18-19
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: "31"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: CLAUDE.md
      lines: "32"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: package-lock.json
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: package.json
      lines: "26"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
    - path: package.json
      lines: "28"
      as_of: 591b858f2c46f7a0669f74aed6e24bb221c210b2
      state: live
---

# Remove the Sandcastle autonomous build pipeline

<!-- capture draft from PR #46 (merged 2026-10-28). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: .sandcastle/.env.example was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/.gitignore was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/CODING_STANDARDS.md was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/config.mts was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/Dockerfile was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/gate-fix-prompt.md was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/gate-review-prompt.md was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/gatekeeper.mts was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/main.mts was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/README.md was deleted by this change — nothing to anchor there -->
<!-- capture: .sandcastle/tsconfig.json was deleted by this change — nothing to anchor there -->
<!-- capture: package-lock.json: 7 hunks collapsed into one whole-file anchor -->
<!-- capture: scripts/autonomous-loop.sh was deleted by this change — nothing to anchor there -->
<!-- capture: scripts/sandcastle-loop.sh was deleted by this change — nothing to anchor there -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-46-remove-the-sandcastle-autonomous-build-pipeline.evidence.md (removed on promote) -->

> Removes the Sandcastle autonomous build pipeline. CLAUDE.md already described it as optional, with nothing shipped depending on it.
>
> - Deletes `.sandcastle/`, `scripts/sandcastle-loop.sh` and `scripts/autonomous-loop.sh`
> - Drops the four `sandcastle*` npm scripts and the `@copperbox/sandcastle-workflow` devDependency; lockfile regenerated (removals only)
> - Removes the `.sandcastle/.env` ignore and the "Repo tooling" section from CLAUDE.md
>
> **`.why/` changes.** Three decisions were anchored to `.sandcastle/README.md`: `autonomous-build-via-sandcastle`, `escalation-circuit-breaker` and `issues-are-the-spec-surface`. Deleting that file makes the PR gate fail on destroyed anchors. Leaving the anchors as `state: lost` would fail `test/ci.test.ts`, because doctor has to report zero lost anchors on the self-hosted bundle. So each of the three decisions now:
>
> - has `status: reversed` and a one-line note saying why
> - has no anchor; the last-known location is kept as a citation pinned to `.sandcastle/README.md` at fa87a3b
>
> Ran locally: `why lint` reports no findings, `why anchor --check --allow-drift` exits 0 with 0 lost (6 pre-existing drifts, which the why-anchor job re-stamps from main), `npm run typecheck` passes, and `npm test` passes 265/265.

— PR #46 description by @dantheuber

> Typecheck passes. One test, the `/api/blame` author assertion in `test/serve.test.ts`, fails identically on the reviewed head 0fa0fa2 in this environment because an exported `GIT_AUTHOR_NAME` overrides the fixture's `user.name`. It is unrelated to this change.

— PR #46 comment by @cb-jeeves (2026-10-28)

# Citations

[1] [PR #46: Remove the Sandcastle autonomous build pipeline](https://github.com/copperbox/why/pull/46)
[2] [merge commit 591b858](https://github.com/copperbox/why/commit/591b858f2c46f7a0669f74aed6e24bb221c210b2)
