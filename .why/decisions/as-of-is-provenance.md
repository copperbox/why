---
type: decision
title: as_of is provenance, so doctor does not flag clean-ancestor anchors
description: A live anchor whose as_of is a clean ancestor of HEAD is stable,
  not stale; why doctor only flags unresolved or diverged as_ofs.
tags: [ anchoring, doctor ]
timestamp: 2026-07-15
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/doctor.ts
      as_of: 830a5f0
      state: live
---

# as_of is provenance, so doctor does not flag clean-ancestor anchors

`why doctor`'s `stale as_of` check flags an anchor only when its `as_of` names
a commit unrelated to HEAD (diverged/rebased history) or one the repository
cannot resolve at all. A live anchor whose `as_of` is a clean ancestor of HEAD
is left alone — it is healthy provenance, not a problem.

**Scope, amended 2026-07-15:** the rule protects a *readable* `as_of` — a
clean ancestor, which is evidence the span survived unchanged since that
commit. An `as_of` that is a non-ancestor (or does not resolve) carries no
such meaning, and "never re-stamp a stable anchor" does not extend to it:
`why anchor` repairs such an orphan when the claim re-verifies at HEAD without
reading `as_of` — see
[orphaned as_of is repaired](orphaned-as-of-is-repaired.md). That
repair is what makes the `not-ancestor` finding this decision kept genuinely
actionable.

# Why

`why anchor` and `why doctor` were built against inconsistent readings of what
`as_of` means. `why anchor` treats it as provenance — it preserves `as_of` on
a stable anchor and only re-stamps it when the anchor actually moves — matching
DESIGN §2/§4 ("the commit at which path+lines were valid"). `why doctor`,
built separately, flagged any `as_of` behind HEAD as `behind-head` yellow with
the advice "run `why anchor`". But `why anchor` never rewrites a stable
anchor's `as_of`, so that advice was a dead end: in steady state the yellow
fired forever for essentially every healthy anchor in the bundle, draining the
signal from the whole report.

Resolved in doctor's favor of the provenance reading: an old `as_of` on a
still-resolving anchor is the anchor having *survived unchanged* since that
commit — a feature, not drift. Doctor keeps the two reasons that are genuinely
actionable (`unresolved`, `not-ancestor`) and drops `behind-head`. Found while
dogfooding: after retiring the planning docs, `why doctor` showed nine
un-clearable yellows and running `why anchor` cleared none of them.

# Citations

[1] [830a5f0 — doctor: stop flagging clean-ancestor as_of as stale](https://github.com/copperbox/why/commit/830a5f0bbe71700ca14cc914773be6b582f41034)
