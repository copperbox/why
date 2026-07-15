---
type: decision
title: Anchors are written from main by CI, so the PR gate stops failing on drift
description: A why-anchor job re-stamps anchors on every push to main, and the PR
  gate runs --allow-drift, failing only on an anchor the change destroyed.
tags:
  - anchoring
  - ci
timestamp: 2026-07-15
why:
  status: active
  happened_on: 2026-07-15
  confidence: recorded
  anchors:
    - path: .github/workflows/why-anchor.yml
      as_of: 0f75578
      state: live
    - path: .github/workflows/why-pr-gate.yml
      as_of: 0f75578
      state: live
    - path: docs/ci.md
      as_of: 0f75578
      state: live
---

`why anchor` runs in CI on every push to `main` and PRs the frontmatter-only result back on the `why-anchors` branch. Contributors do not run it on their branches, and the PR gate no longer asks them to: it runs `why anchor --check --allow-drift`, which reports drift and exits 1 only on an anchor the change *destroyed*.

# Why

The gate caused the bug it was meant to prevent. `why-pr-gate.yml` failed on any anchor drift, and its own comment said "run `why anchor` locally and commit the result" — but a contributor's HEAD is exactly what a squash merge discards. Following the instruction stamped an `as_of` that named nothing a day later. Both orphans in this bundle were created that way: `518bf47` by [1] (a `why anchor` run on `why-drafts`), and `44d4118` by [2]. Every `as_of` CI has ever written is a clean ancestor, because `why capture` already reads the merge commit from `main` — the one component doing this correctly was proof the approach works before it was generalized.

So the gate was demanding the one thing that cannot be done correctly from a branch. Ancestry gating and the verified merge-base stamp ([as_of must be an ancestor](/decisions/as-of-must-be-an-ancestor.md)) contain the damage, but they cannot prevent it: when a branch *is* what changed a span — or when a file is *born* on the branch, as `.sandcastle/README.md` was — no surviving commit holds that span, so the only truthful stamp is a HEAD the squash then throws away. Running from `main` dissolves that case rather than mitigating it: the merge commit both exists and contains the code.

Squashing the `why-anchors` PR does not re-orphan anything, which is the crux and the natural objection. A squash rewrites *commits*; the `as_of` **values** inside the files name `main` commits and survive the squash as ordinary content.

# Costs

Accepted deliberately, because the alternative is a gate that teaches people to corrupt the archive:

- **The bundle becomes eventually consistent.** Between a merge and the re-anchor PR landing, `main`'s anchors can be stale. They degrade honestly (`lost` or `unverified`), never to a wrong span, so §2's promise holds — but `why blame` can be briefly out of date, and the anchor update no longer rides in the same review as the code change.
- **The gate is weaker.** Drift merges. A destroyed anchor still blocks, which keeps the part worth keeping: you cannot delete the code a concept describes without being told.
- **It is a convention until enforced.** Nothing stops a human running `why anchor` on a branch. The stamping rule limits the blast radius, and `CLAUDE.md` and `CONTRIBUTING.md` say not to.

Rejected: keeping the strict gate (it cannot be satisfied honestly from a branch); pushing straight to `main` from CI (works, and is defensible for a frontmatter-only diff, but breaks branch protection for adopters copying the recipe).

# Citations

[1] [4f7d259 — the `why anchor` run on why-drafts that stamped an orphaned as_of](https://github.com/copperbox/why/commit/4f7d2594da7110c4de539406389733756194866f)
[2] [7391fd7 — the same mechanism recurring on release-prep](https://github.com/copperbox/why/commit/7391fd70d006f779dba69a4121780f7ef826c78d)
