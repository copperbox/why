---
type: decision
title: as_of is only readable as history when it is an ancestor of HEAD
description: why anchor gates every read of history through as_of on ancestry,
  stamps the surviving merge-base when it can verify the span there, and
  degrades an unreadable as_of to `unverified` instead of `lost`.
tags:
  - anchoring
  - doctor
timestamp: 2026-07-15
why:
  status: active
  happened_on: 2026-07-14
  confidence: recorded
  anchors:
    - path: src/anchor.ts
      symbol: historyOrigin
      as_of: 0f75578
      state: live
    - path: src/anchor.ts
      symbol: stampFor
      as_of: 0f75578
      state: live
    - path: test/anchor.test.ts
      as_of: 0f75578
      state: live
    - path: README.md
      as_of: 0f75578
      state: live
---

An anchor's `as_of` is used two ways, and both are now gated:

- **Reading.** `historyOrigin` accepts an `as_of` as a history origin only when it resolves *and* is an ancestor of HEAD. Rename-following and blame-tracing refuse to read through anything else.
- **Writing.** `stampFor` stamps HEAD by default, but when HEAD is not contained in the integration branch (`refs/remotes/origin/HEAD`) it prefers the merge-base — the newest commit certain to survive a squash — and only when the identical span verifiably holds there.

An `as_of` that fails the read gate while its path still resolves is reported `unverified`, not `lost`: nothing is rewritten and `why doctor` names the gap.

# Why

This repo squash-merges, and `why anchor` stamped `git.headShort` unconditionally. Running it on `why-drafts` produced [1], which stamped `as_of: 518bf47` onto seven anchors; the squash landed that work as `0f75578` and discarded `518bf47`. The same mechanism re-armed on `release-prep`, stamping `44d4118` onto four more.

Two findings forced this design, both measured rather than reasoned:

**Ancestry, not reachability, is the real gate.** `git blame --reverse` needs `as_of` to be an ancestor, so the orphan failed identically in a fresh clone and locally — no divergence, which is why the bug read as merely cosmetic. But `renamedTo` uses `git diff as_of HEAD`, which git answers between *any two commits in the object store*. With a whole-file anchor on a file renamed after the branch point, the same bundle at the same commit reported `moved` locally and `lost` in a `--no-local` clone of `main` — and `why anchor` would have written the two clones different bundles. That is the operator-dependent answer, and it is the one path that could emit a rename detected *through a commit that never landed*: silently wrong, not merely lost.

**The line ranges were not the cause.** [2] attributed five rotted anchors to fragile `lines: 1-N` whole-file ranges. Isolating the variables on a fresh clone of `0f75578` refutes that: keeping `lines: 1-35` and swapping only `as_of` to a real ancestor resolves the anchor (`already current`), and re-stamping the orphaned `as_of` cleared all five with the ranges left intact. `git blame --reverse` silently clamps an over-long `-L` end to the file length at `as_of`, so a whole-file range was self-healing. Dropping the ranges did fix the symptom, but by removing the code path that consults `as_of` — masking the dangling sha rather than repairing it. The dangling `as_of` was necessary and sufficient; the ranges were neither.

**Why the merge-base stamp must verify.** `git blame --reverse` interprets `-L` against the `as_of` revision, not HEAD (`-L35,35` against a 34-line `as_of` errors). So stamping an unverified merge-base with HEAD-valid lines would re-point the anchor at whatever text held those line numbers back then — the exact failure this module exists to prevent. For a span the branch just changed, the merge-base is precisely where it is *not* valid, so an unverifiable merge-base loses to a truthful HEAD, orphan and all.

**Why `unverified` rather than `lost`.** Path and symbol resolution are stronger evidence about where code lives than `as_of` ever was. Downgrading a live, path-confirmed anchor to `lost` because its provenance is unreadable asserts *below* the evidence — the mirror of the sin the ladder forbids — and false `lost` is how a health report gets ignored, which is the product.

Migration: eleven anchors carried a non-ancestor `as_of`. Eight were re-stamped to `0f75578` only after verifying the claim there (path present, or the line span byte-identical to HEAD). Three anchoring `.sandcastle/README.md` were left at `44d4118`: that file was born on `release-prep`, so no surviving commit contained it at the time and there was no honest `as_of` to move them to. Leaving them was sound; leaving them *permanently* was not — after the squash they would flag `not-ancestor` yellow with nothing able to clear it (a whole-file anchor resolves by path at HEAD and never consults `as_of`, so re-anchoring walks past it). [orphaned as_of is repaired](/decisions/orphaned-as-of-is-repaired.md) closes that gap: the post-merge run on `main` re-stamps them to the squash commit, which does contain the file. [as_of is provenance](/decisions/as-of-is-provenance.md) still holds for what it protects — a stable anchor's clean-ancestor `as_of` is never re-stamped.

# Citations

[1] [4f7d259 — the `why anchor` run on why-drafts that stamped the orphan](https://github.com/copperbox/why/commit/4f7d2594da7110c4de539406389733756194866f)
[2] [7391fd7 — fix: green the self-hosted gate, whose line-range diagnosis this corrects](https://github.com/copperbox/why/commit/7391fd70d006f779dba69a4121780f7ef826c78d)
