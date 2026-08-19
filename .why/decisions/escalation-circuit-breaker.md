---
type: decision
title: "Circuit breaker: repeated escalation halts the loop for a chat"
description: An issue's second gate escalation removes it from the queue, labels
  it needs-chat, and the gate exits HALTED instead of promoting past the hole.
tags: [ process, autobuild ]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-12
  confidence: recorded
  anchors:
    - path: .sandcastle/README.md
      as_of: 44d4118
      state: live
---

# Circuit breaker: repeated escalation halts the loop for a chat

When an issue escalates out of the gate twice, it leaves the queue with a `needs-chat` label and a chat-agenda comment, and the gate exits HALTED (5) at the phase boundary rather than promoting past the hole.

# Why

Recorded at decision time [1]: rewriting a failing spec is the one act the pipeline reserves for humans+chat, and the breaker enforces that mechanically instead of advising it in prose. Details live in AUTOBUILD.md [2].

# Because of

- [Autonomous build via Sandcastle + gatekeeper](autonomous-build-via-sandcastle.md)

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-12](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
[2] [AUTOBUILD.md as of the bootstrap commit (now .sandcastle/README.md)](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/AUTOBUILD.md)
