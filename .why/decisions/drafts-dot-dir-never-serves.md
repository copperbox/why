---
type: decision
title: Capture drafts live in a dot-dir so they never serve
description: why capture writes drafts to .why/.drafts/ (a dot-dir, not drafts/)
  so okf-mcp's bundle walk skips them — nothing unpromoted reaches why blame,
  the served bundle, or the anchor cache.
tags:
  - capture
  - architecture
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/capture.ts
      as_of: a735c62
      state: live
---

`why capture` writes its lint-gated drafts (and their `.evidence.md` sidecars) into `.why/.drafts/` — a leading-dot directory, not the `drafts/` the issue suggested. Drafts are inert until promoted: nothing in `.why/.drafts/` is reachable by `why blame`, the mounted bundle, or the anchor cache.

# Why

Recorded in PR #26's review notes and the capture commit message [1]. A draft carries pre-filled `confidence: recorded` and hunk-derived anchors that have *not* yet been judged — if it were served it would assert rationale above its evidence, the one thing the archive must never do. The dot-dir placement was verified against okf-mcp's bundle walk, which skips dot-entries, so an unpromoted draft provably cannot leak into the served bundle or the anchor index. The `drafts/` name the issue proposed would have been walked like any other concept directory. This is what lets the capture skill promote deliberately rather than race the server: the draft is a workspace, not a published concept, until a human folds or promotes it [2].

# Citations

[1] [PR #26: Steady-state operational loop: audit, capture, and CI self-hosting](https://github.com/copperbox/why/pull/26)
[2] [merge commit a735c62](https://github.com/copperbox/why/commit/a735c6205c51d846bbdf0f1b328f18bbbe17db6c)
