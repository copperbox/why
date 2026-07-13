---
type: decision
title: "`why` self-hosts: three CI workflows run the tool against its own bundle"
description: The repo runs why lint/anchor as a PR gate, a weekly audit that PRs
  the .why write-back, and post-merge capture onto why-drafts — all running the
  CLI from source since the repo is the package, with docs/ci.md pinned verbatim
  by test.
tags:
  - ci
  - self-hosting
timestamp: 2026-07-13T23:49:24.457Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: .github/workflows/why-pr-gate.yml
      lines: 1-22
      as_of: a735c62
      state: live
    - path: .github/workflows/why-audit.yml
      lines: 1-55
      as_of: a735c62
      state: live
    - path: .github/workflows/why-capture.yml
      lines: 1-34
      as_of: a735c62
      state: live
    - path: docs/ci.md
      lines: 1-199
      as_of: a735c62
      state: live
    - path: test/ci.test.ts
      lines: 1-118
      as_of: a735c62
      state: live
---

# `why` self-hosts: three CI workflows run the tool against its own bundle

The repository runs `why` against its own `.why/` bundle through three workflows: a PR gate (`why lint` + `why anchor --check`), a weekly audit (which opens an issue and PRs the `.why` write-back when a constraint newly expires), and post-merge capture (which drafts a concept onto the `why-drafts` branch). They run the CLI from source (`npm run why --`) rather than an installed binary, because this repo *is* the package. `docs/ci.md` documents these recipes copy-pasteably.

# Why

Recorded in the PR's "What & why" and review notes [1][2]. Dogfooding is the point: `why`'s own decision memory is maintained by `why`, so every PR exercises the tool on a real bundle and its anchors and constraints cannot silently rot — the same gate the tool asks other repos to run guards this one. The CLI runs from source because the repo is the package, so there is no published self-dependency to install. And `docs/ci.md` is guarded against drift: `test/ci.test.ts` byte-embeds each live workflow into the doc and checks that the npm scripts the docs reference actually exist, so the published recipes can never diverge from what CI really runs.

# Citations

[1] [PR #26: Steady-state operational loop: audit, capture, and CI self-hosting](https://github.com/copperbox/why/pull/26)
[2] [merge commit a735c62](https://github.com/copperbox/why/commit/a735c6205c51d846bbdf0f1b328f18bbbe17db6c)
