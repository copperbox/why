---
type: decision
title: Consumption before archaeology
description: Build the read side (Phase 1 CLI over hand-written bundles) before the dig pipeline (Phase 3).
tags: [roadmap]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: PLAN.md
      as_of: 9f0dc16
      state: live
---

# Consumption before archaeology

The phase order puts `why lint` + `why blame` over hand-written bundles (Phase 1) ahead of `why dig` (Phase 3).

# Why

Recorded at project bootstrap [1]: a CLI over hand-written bundles proves the read-side value cheaply and gives dig a target to hit; digging into a format nobody has felt the value of risks building the hard part for an unproven payoff.

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
