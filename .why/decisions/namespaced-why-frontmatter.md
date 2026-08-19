---
type: decision
title: Extension keys namespaced under one `why:` map
description: All why-specific frontmatter lives under a single `why:` key instead of flat top-level keys.
tags: [schema, okf]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: src/bundle.ts
      as_of: b758a4a
      state: live
---

# Extension keys namespaced under one `why:` map

Everything `why`-specific in a concept's frontmatter (`status`, `confidence`, `anchors`, `verify`, …) nests under a single `why:` extension map; there are no flat `why_*` top-level keys.

# Why

Recorded at project bootstrap [1]: one namespaced key is collision-proof against future OKF versions, and because OKF preserves unknown keys, a plain okf-mcp server round-trips a `why` bundle byte-for-byte with zero changes.

# Because of

- [OKF/okf-mcp as the substrate](okf-as-substrate.md)

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
