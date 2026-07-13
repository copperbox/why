---
type: decision
title: OKF/okf-mcp as the substrate
description: Bundles are plain OKF markdown served by okf-mcp, not a bespoke store.
tags: [architecture, okf]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: package.json
      as_of: 9f0dc16
      state: live
---

# OKF/okf-mcp as the substrate

Every `why` bundle is a valid OKF v0.1 bundle served by okf-mcp; `why` adds a schema and tooling on top rather than inventing a store.

# Why

Recorded at project bootstrap [1]: decisions are naturally documents (structured frontmatter plus narrative), the format serves a dual human/agent audience, MCP consumption comes for free, and the archive gets git-visible history. Origin: this project was conceived in conversation alongside okf-mcp. The alternative — a bespoke database or format — would have forfeited "browse it in any editor" and required a custom viewer.

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
