---
type: decision
title: Planning docs retired once the build completed
description: Remove PLAN.md and NOTES.md now the build is done; HOWTO.md is the operator guide and the .why/ bundle is the decision memory.
tags: [roadmap, docs]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: HOWTO.md
      as_of: 83607dc
      state: live
---

# Planning docs retired once the build completed

`PLAN.md` (phased roadmap + session protocol) and `NOTES.md` (implementation
findings) were build scaffolding. With every phase shipped and the CLI
functional, both were removed; `HOWTO.md` was added as the operator's guide,
and the `.why/` bundle is now the project's decision memory.

# Why

Recorded at the time of the change. PLAN.md existed to track which phase was
current and to carry the session protocol; NOTES.md existed to feed DESIGN.md
decisions. Once the build was complete and functional both were stale — a
"current phase" is meaningless when there are none left, and NOTES.md's
findings had already landed in DESIGN.md. Kept around, they would only invite
drift and blur the question "is this built?".

Their durable content survives elsewhere, so nothing was lost: NOTES.md's
findings live in DESIGN.md, PLAN.md's Decision log was migrated into this
`.why/` bundle at bootstrap, and the per-task phase specs remain in `issues/`.
Going forward DESIGN.md is the source of truth and `.why/` is where decisions
are recorded — there is no separate plan file to keep in sync.

# Citations

[1] [docs cleanup — remove PLAN.md/NOTES.md, add HOWTO.md](https://github.com/copperbox/why/commits/main)
