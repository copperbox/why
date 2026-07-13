---
type: decision
title: "`why doctor` reports expired constraints as their own yellow section"
description: Doctor carries an expiredConstraints section, and a live anchor whose as_of doesn't resolve reports stale rather than being skipped.
tags: [doctor, rendering]
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-12
  confidence: recorded
  anchors:
    - path: src/doctor.ts
      as_of: 845df0e
      state: live
---

# `why doctor` reports expired constraints as their own yellow section

Doctor's report includes an `expiredConstraints` section (yellow), and a live anchor whose `as_of` doesn't resolve in the enclosing repo is reported stale with reason `unresolved` rather than skipped.

# Why

Recorded when doctor shipped [1]: the issue-205 scope list names lost anchors, stale `as_of`s, overdue `review-by`s, `status: unknown`, open questions, and lint errors — but its acceptance criteria pin harbor's by-design *expired* constraint producing a yellow finding, which no listed section would catch (harbor's verify method is `ask`, not `review-by`). The section matches doctor's usage line ("lost anchors and stale constraints") and PLAN.md's "audit-overdue constraints" wording; the DESIGN.md §5 blast-radius walk stays `why audit`'s job. The stale-over-skip call follows from the same session: a claim the repo can't verify must not read as healthy — which is why doctor on `examples/harbor` shows six stale anchors citing the fictional harbor repo's commits.

# Citations

[1] [PR #19: anchor maintenance — re-resolution, health report, torture harness](https://github.com/copperbox/why/pull/19)
[2] [issue spec 205 in the bootstrap backlog](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/issues/205-why-doctor.md)
