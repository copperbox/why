---
type: decision
title: Autonomous build via Sandcastle + gatekeeper
description: Phases 1–4 are implemented by an issue→PR pipeline with an agent
  gatekeeper replacing the human merge gate.
tags: [ process, autobuild ]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: .sandcastle/README.md
      as_of: fa87a3b
      state: live
---

# Autonomous build via Sandcastle + gatekeeper

Implementation is delegated to the Sandcastle issue→PR pipeline; an agent gatekeeper reviews, remediates in-gate, and merges. Chat sessions do architecture — DESIGN.md, issue specs, and the gate itself — not implementation.

# Why

Recorded at project bootstrap [1]: remediation happens in the gate rather than through the workflow's responder (which ignores its own login's feedback), and phase labels plus gate promotion enforce PLAN.md's ordering mechanically. The full rationale and risk register were written down in AUTOBUILD.md at decision time [2].

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
[2] [AUTOBUILD.md as of the bootstrap commit (now .sandcastle/README.md)](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/AUTOBUILD.md)
