---
type: decision
title: "Steady-state operational loop: audit, capture, and CI self-hosting"
description: "Draft captured from PR #26 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: .github/workflows/why-audit.yml
      lines: 1-55
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .github/workflows/why-capture.yml
      lines: 1-34
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .github/workflows/why-pr-gate.yml
      lines: 1-22
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/autonomous-build-via-sandcastle.md
      lines: 1-28
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/blame-warns-on-every-expired-constraint.md
      lines: 1-28
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/consumption-before-archaeology.md
      lines: 1-27
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/doctor-expired-constraints-section.md
      lines: 1-28
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/edge-types-by-section-convention.md
      lines: 1-31
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/escalation-circuit-breaker.md
      lines: 1-32
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/issues-are-the-spec-surface.md
      lines: 1-31
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/namespaced-why-frontmatter.md
      lines: 1-31
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/decisions/okf-as-substrate.md
      lines: 1-27
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/index.md
      lines: 1-25
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: .why/log.md
      lines: 1-4
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: DESIGN.md
      lines: "178"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: docs/capture.md
      lines: 1-109
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: docs/ci.md
      lines: 1-199
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package-lock.json
      lines: "3"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package-lock.json
      lines: "9"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package-lock.json
      lines: 23-24
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package.json
      lines: "3"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package.json
      lines: "14"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: package.json
      lines: 29-30
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: PLAN.md
      lines: 13-14
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: PLAN.md
      lines: "49"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: PLAN.md
      lines: 83-88
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: README.md
      lines: 88-103
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: README.md
      lines: "106"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: README.md
      lines: "115"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: skills/capture/SKILL.md
      lines: 1-107
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: src/audit.ts
      lines: 1-640
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: src/capture.ts
      lines: 1-610
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: src/cli.ts
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: src/evidence.ts
      lines: "297"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: src/evidence.ts
      lines: 355-356
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/audit.test.ts
      lines: 1-460
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/capture.test.ts
      lines: 1-409
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/ci.test.ts
      lines: 1-124
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/cli.test.ts
      lines: "54"
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/cli.test.ts
      lines: 56-57
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
    - path: test/skills.test.ts
      as_of: a735c6205c51d846bbdf0f1b328f18bbbe17db6c
      state: live
---

# Steady-state operational loop: audit, capture, and CI self-hosting

<!-- capture draft from PR #26 (merged 2026-07-13). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: src/cli.ts: 11 hunks collapsed into one whole-file anchor -->
<!-- capture: test/skills.test.ts: 5 hunks collapsed into one whole-file anchor -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-26-steady-state-operational-loop-audit-capture-and.evidence.md (removed on promote) -->

> <!-- sandcastle-feature: {"slug":"operational-loop","branch":"sandcastle/feature-operational-loop","members":[{"id":"15","title":"`why audit` — constraint re-verification and the scar-tissue report"},{"id":"16","title":"Merge-time capture: record decisions while they're fresh"},{"id":"17","title":"CI recipes and the self-hosting switch"}]} -->
>
> **Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.
>
> ### Issues in this feature
> - [x] #15 `why audit` — constraint re-verification and the scar-tissue report
> - [x] #16 Merge-time capture: record decisions while they're fresh
> - [x] #17 CI recipes and the self-hosting switch
>
> ### Release
> `v0.6.0` (minor bump)
>
> ### Summary
> ## What & why
>
> Closes out PLAN.md Phase 4: `why` gains a full re-verification/capture loop and becomes self-hosting.
>
> - **`why audit`** — sweeps active constraints, runs their `verify.method: check` commands (or exports `method: ask` items as a questionnaire), flips falsified constraints to `expired` with evidence written in-place, and reports downstream "scar tissue" (active decisions that trace back to an expired constraint) plus dedup'd questions for blast-radius pairs.
> - **`why capture`** — turns a merged/closed PR (or a bare commit) into a lint-gated draft concept: classifies outcome via `gh`, pulls rationale candidates from the PR body/comments/reviews with attribution, derives anchors from the merge commit's zero-context diff, and promotes drafts atomically (rollback on any error-severity lint finding).
> - **CI recipes** — `why` now runs against its own repo: PR gate (lint + anchor --check), weekly audit (opens an issue + PRs the `.why` write-back on newly-expired constraints), and post-merge capture (drafts PR on `why-drafts`). The repo's own Decision log is retired in favor of `.why/decisions/` — nine entries migrated as real concepts.
>
> ## Changes
>
> - `src/audit.ts`, `src/capture.ts` (new) + `cli.ts` wiring for `audit`/`capture` subcommands — all seven subcommands are now implemented, no more `notImplemented` stub.
> - `.github/workflows/{why-pr-gate,why-audit,why-capture}.yml` + `docs/ci.md` documenting them; workflows run the CLI from source (`npm run why --`) since this repo *is* the package.
> - `.why/` bundle (index + 9 migrated decisions) replacing PLAN.md's Decision log (PLAN.md keeps the heading as a pointer).
> - `docs/capture.md` (post-merge recipe, folded into `docs/ci.md` per issue #17), `skills/capture/SKILL.md`.
> - Minor cleanups: dedup'd helpers (`isPlainMap`, `plural`), de-nested ternaries, `README.md`/`DESIGN.md` updates, stale CLI exit-code comment removed.
>
> ## Review notes
>
> - Evidence discipline is the load-bearing invariant in both features: audit only flips a constraint on a non-zero exit or an explicit "no longer true" answer (never on a timeout/error); capture only pre-fills `confidence: recorded` when it found actual rationale text, otherwise leaves it unset. Worth double-checking against `test/audit.test.ts` / `test/capture.test.ts`.
> - `.why/.drafts/` (dot-dir, not the issue's suggested `drafts/`) is deliberate — verified against okf-mcp's bundle walk to avoid leaking draft output into the served bundle/anchor cache; see the capture commit message for the reasoning.
> - CI docs are guarded against drift: `test/ci.test.ts` byte-embeds each live workflow into `docs/ci.md` and checks npm scripts referenced actually exist.
> - Test status: `npm run verify` green throughout (208/208 as of the last functional commit); this commit only bumps `package.json`/`package-lock.json` to v0.6.0, no test re-run needed.
>
> Closes #15
> Closes #16
> Closes #17

— PR #26 description by @dantheuber

> This PR delivers the steady-state operational loop: `why audit` (constraint re-verification with check/ask/review-by methods, expiry flips through okf-mcp's byte-preserving patch path, transitive # Because of blast-radius walk filing deduped question concepts, exit 1 on new expiry), `why capture` (PR/commit → lint-gated drafts in the dot-dir `.why/.drafts/` that provably never serve, verbatim rationale quotes, hunk-derived anchors, editorial promotion with rollback), and the CI recipes plus self-hosting switch (three tested workflows, docs/ci.md pinned verbatim, the nine PLAN.md Decision log entries converted into honest recorded decision concepts that lint clean and read healthy to doctor). Every acceptance criterion across issues #15/#16/#17 has corresponding code and a test that would fail if the feature broke; the repo invariants hold (no rationale above evidence, all writes stay valid OKF via okf-mcp, DESIGN.md amended for the capture command); live probes confirm `why anchor --check` and `why audit` pass on the new self-hosted bundle so the activated PR gate is safe.

— PR #26 comment by @dantheuber (2026-07-13)

# Citations

[1] [PR #26: Steady-state operational loop: audit, capture, and CI self-hosting](https://github.com/copperbox/why/pull/26)
[2] [merge commit a735c62](https://github.com/copperbox/why/commit/a735c6205c51d846bbdf0f1b328f18bbbe17db6c)
