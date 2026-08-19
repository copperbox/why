---
type: decision
title: Edge types by section convention, not new syntax
description: A link's meaning comes from the section it appears in (# Because of, # Instead of, …), keeping bundles plain OKF.
tags: [schema, okf]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-11
  confidence: recorded
  anchors:
    - path: src/lint.ts
      as_of: b758a4a
      state: live
---

# Edge types by section convention, not new syntax

OKF links are untyped; `why` gives an edge meaning by the heading of the section its link sits under. `why lint` enforces the section→target-type table; the markdown itself stays ordinary.

# Why

Recorded at project bootstrap [1]: section conventions keep bundles valid OKF and legible in plain Obsidian. The alternative — a typed-link syntax — would fork the format and break the "any editor" property.

# Because of

- [OKF/okf-mcp as the substrate](okf-as-substrate.md)

# Citations

[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
