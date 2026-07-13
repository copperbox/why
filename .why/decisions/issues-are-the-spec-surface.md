---
type: decision
title: Issues are the spec surface
description: Each Phase 1–4 task is a self-contained issue with testable acceptance criteria; implementers and the gate judge against issue text.
tags: [process, autobuild]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: AUTOBUILD.md
      as_of: 9f0dc16
      state: live
---

# Issues are the spec surface

Every delegated task became a self-contained issue in `issues/` with testable acceptance criteria, and those issue bodies — not chat context — are what the pipeline's implementers and the gatekeeper judge against.

# Why

Recorded at project bootstrap [1]: the pipeline's implementers and the gate both judge against issue text, so vague issues make autonomous review meaningless. The same entry anticipated this bundle: "When `why` can run on its own repo, these migrate into `.why/` — until then this section *is* the bundle."

# Because of

- [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md)

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
