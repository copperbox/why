---
type: decision
title: an orphaned as_of on a claim verified at HEAD is repaired, not kept
description: why anchor re-stamps an as_of that no clone of the integration
  branch can read — but only when the claim re-verified at HEAD without it, and
  only to a commit that survives a squash.
tags:
  - anchoring
  - doctor
timestamp: 2026-07-15
why:
  status: active
  happened_on: 2026-07-15
  confidence: recorded
  anchors:
    - path: src/anchor.ts
      symbol: repairOrphan
      as_of: 0f75578
      state: live
    - path: test/anchor.test.ts
      as_of: 0f75578
      state: live
---

# an orphaned as_of on a claim verified at HEAD is repaired, not kept

`why anchor` repairs an **orphaned** `as_of` — one that does not resolve, or resolves to a non-ancestor of HEAD — on an anchor whose claim re-verified at HEAD *without reading `as_of` at all*: a whole-file path that is present, or a symbol re-found at its recorded span. The repair stamp must be durable: HEAD when the integration branch contains it (or git records no integration branch), the merge-base on a diverged branch and only when the span verifiably holds there, and otherwise nothing — the orphan is left reported for the post-merge run rather than re-stamped to a branch HEAD the next squash would discard and re-orphan.

A bare `path + lines` claim with an unreadable `as_of` is untouched: nothing verified those lines, so re-stamping would assert a span above its evidence. It stays `unverified`, and clearing it takes a human or a re-dig.

# Why

[as_of must be an ancestor](as-of-must-be-an-ancestor.md) fixed the *reading* half of the squash-orphan problem and deliberately left three anchors on `.sandcastle/README.md` at `44d4118` — a branch commit no surviving commit could replace at the time. Measured after simulating that squash: `why doctor` flagged all three `not-ancestor` yellow, and **nothing could clear them**. A whole-file anchor resolves by path at HEAD and never consults `as_of`, so it classifies `current` and write-mode `why anchor` walks straight past it; the post-merge `why-anchor` job re-stamps only drift, so it walked past too.

That is the exact pathology [as_of is provenance](as-of-is-provenance.md) was written to kill — un-clearable yellows draining the signal from the whole report — recreated three anchors at a time. That decision kept `not-ancestor` on the explicit grounds that it is "genuinely actionable"; nothing had yet made it actionable. Repair does, and it *completes* the provenance rule rather than overriding it: a clean-ancestor `as_of` means the span survived unchanged since that commit and is still never rewritten, while an orphaned `as_of` means nothing any clone of the integration branch can read — there is no provenance left to preserve. The provenance decision's scope was amended to say so.

Two honesty gates, both covered by tests:

- **Repair never guesses.** It fires only when the claim was verified at HEAD without `as_of` — path existence or a re-found symbol. A bare line claim reaches `unverified` instead and is left byte-for-byte, because `git blame --reverse` reads `-L` against the `as_of` revision and no surviving commit verifiably contains those lines.
- **Repair never churns.** On a branch diverged from the integration branch, a repair that could only stamp branch HEAD is declined — the next squash would re-orphan it. The merge-base is stamped only when the identical span verifiably holds there (`spanHoldsAt`, span identity via reverse blame, not text equality).

Verified end-to-end on a `--no-local` clone with the squash of `release-prep` simulated: three `stale as_of` yellows, repaired to the squash commit in one write-mode run, `why doctor` at zero, and a second run re-derives every stamp (`64 already current`).

# Citations

[1] [PR #39 — release-prep: fixed reading through orphans, deferred this repair](https://github.com/copperbox/why/pull/39)
