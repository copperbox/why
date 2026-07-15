---
type: decision
title: Merge-time capture emits lint-gated drafts into a dot-directory that
  never serves
description: why capture drafts a concept from a merged PR into .why/.drafts/ —
  a dot-dir okf-mcp's walk skips, so machine output never serves — with
  confidence recorded only when rationale text was found, and promotion out is
  atomic and lint-gated.
tags:
  - capture
  - drafts
timestamp: 2026-07-13T23:49:24.313Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/capture.ts
      as_of: a735c62
      state: live
    - path: docs/capture.md
      as_of: a735c62
      state: live
    - path: skills/capture/SKILL.md
      as_of: a735c62
      state: live
---

# Merge-time capture emits lint-gated drafts into a dot-directory that never serves

`why capture` turns a merged or closed PR (or a bare commit) into a draft concept written to `.why/.drafts/`: rationale quoted verbatim with attribution, type guessed from the outcome, anchors derived from the merge commit's zero-context diff, and an evidence-pack sidecar. Drafts leave the queue only through the editorial, lint-gated `why capture --promote`, which moves the draft into its type directory atomically — rolling back on any error-severity finding. The judgment half lives in `skills/capture/SKILL.md`.

# Why

Recorded in the PR's "What & why" and capture's own module header [1][2]. Two invariants fix the shape. First, **drafts must never serve**: okf-mcp's bundle walk skips dot-directories only, so `.why/.drafts/` — deliberately a dot-dir, not the issue's suggested plain `drafts/` — keeps unedited machine output out of the served bundle, `why blame`, `lint`, `doctor`, and the anchor cache until a human or agent promotes it. Second, **never assert rationale above its evidence**: capture pre-fills `confidence: recorded` only when it actually found rationale text in the PR; finding none, it leaves confidence unset rather than overstating. Promotion is atomic and lint-gated so a draft can only leave the queue as a valid concept, never as raw machine output.

# Citations

[1] [PR #26: Steady-state operational loop: audit, capture, and CI self-hosting](https://github.com/copperbox/why/pull/26)
[2] [merge commit a735c62](https://github.com/copperbox/why/commit/a735c6205c51d846bbdf0f1b328f18bbbe17db6c)
