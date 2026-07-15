---
type: decision
title: "`why audit` expires a constraint only on hard evidence, then walks the
  blast radius"
description: Audit flips a constraint to expired only on a non-zero check exit
  or an explicit "no longer true" answer — never on a timeout or error — then
  reports scar tissue and files deduped blast-radius questions, exiting 1 on any
  new expiry.
tags:
  - audit
  - constraints
timestamp: 2026-07-13T23:49:24.177Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/audit.ts
      as_of: a735c62
      state: live
    - path: test/audit.test.ts
      as_of: a735c62
      state: live
---

# `why audit` expires a constraint only on hard evidence, then walks the blast radius

`why audit` sweeps active constraints, runs each `verify.method: check` command in the enclosing repo (or exports `method: ask` items as a questionnaire), and flips a falsified constraint to `status: expired` with the evidence written in place. On any new expiry it walks `# Because of` edges backwards to report downstream "scar tissue" (active decisions that trace back to an expired constraint), files deduped `question` concepts for the blast radius, and exits 1 so CI notices.

# Why

Recorded in the PR's "What & why" and audit's own module header [1][2]. Evidence discipline is the load-bearing invariant, and the review notes call it out as such: a constraint flips *only* on a non-zero check exit or an explicit "no longer true" answer — **never** on a timeout, spawn failure, or other error, because a check that could not run has not falsified anything. This is the project's "never assert rationale above its evidence" rule applied to the write path: audit may only downgrade a claim on real evidence, never on the absence of it. The blast-radius walk and exit-1 exist so that when a constraint does expire, the decisions built on it become visible rather than silently outdated.

# Citations

[1] [PR #26: Steady-state operational loop: audit, capture, and CI self-hosting](https://github.com/copperbox/why/pull/26)
[2] [merge commit a735c62](https://github.com/copperbox/why/commit/a735c6205c51d846bbdf0f1b328f18bbbe17db6c)
