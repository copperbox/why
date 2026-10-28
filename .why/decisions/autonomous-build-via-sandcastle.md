---
type: decision
title: Autonomous build via Sandcastle + gatekeeper
description: Phases 1–4 are implemented by an issue→PR pipeline with an agent
  gatekeeper replacing the human merge gate.
tags: [ process, autobuild ]
timestamp: 2026-07-13
why:
  status: reversed
  happened_on: 2026-07-11
  confidence: recorded
---

# Autonomous build via Sandcastle + gatekeeper

Implementation is delegated to the Sandcastle issue→PR pipeline; an agent gatekeeper reviews, remediates in-gate, and merges. Chat sessions do architecture — DESIGN.md, issue specs, and the gate itself — not implementation.

Reversed: the Sandcastle pipeline, gatekeeper, and loop scripts were removed from the repo once the initial build was done; changes now go through ordinary PRs. Its last-known anchor was `.sandcastle/README.md` as of fa87a3b [3].

# Why

Recorded at project bootstrap [1]: remediation happens in the gate rather than through the workflow's responder (which ignores its own login's feedback), and phase labels plus gate promotion enforce PLAN.md's ordering mechanically. The full rationale and risk register were written down in AUTOBUILD.md at decision time [2].

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
[2] [AUTOBUILD.md as of the bootstrap commit (now .sandcastle/README.md)](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/AUTOBUILD.md)
[3] [.sandcastle/README.md as of fa87a3b, before the pipeline was removed](https://github.com/copperbox/why/blob/fa87a3b49ff4d7bf41df7178b7e02e45bcc28b0a/.sandcastle/README.md)
