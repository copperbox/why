---
type: decision
title: "`why blame` warns on every expired constraint"
description: Expired-constraint warnings render on every blame query, not only when an edge connects the constraint to the matched code.
tags: [blame, rendering]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-12
  confidence: recorded
  anchors:
    - path: src/blame.ts
      as_of: b758a4a
      state: live
---

# `why blame` warns on every expired constraint

Every expired constraint in the bundle renders its warning on every `why blame` query, upstream of the matched concepts or not.

# Why

Recorded when blame shipped [1]: the README example (the issue-104 rendering target) shows the Acme warning under `src/lock.rs:47`, a file no edge connects to that constraint, and the acceptance criteria pin that behavior. The expired-constraint report is the tool's payoff (DESIGN.md §5) and must stay visible until resolved; scoping it to upstream edges would hide it on most queries. DESIGN.md §7 was updated in the same session, along with the exact hedge prefixes ("likely — ", "speculation, thin evidence — "; unstated confidence hedges hardest).

# Citations

[1] [PR #18: why CLI Phase 1 — foundation, init, lint, blame](https://github.com/copperbox/why/pull/18)
[2] [issue spec 104 in the bootstrap backlog](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/issues/104-why-blame-static.md)
