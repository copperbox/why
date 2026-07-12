---
type: question
title: Why is retry jitter disabled?
description: retry_jitter defaults to off despite the code comment calling jitter "essential" — no recoverable rationale.
tags: [retries, config]
timestamp: 2026-07-11
why:
  status: open
  happened_on: 2024-06-02
  anchors:
    - path: config/defaults.toml
      lines: 31
      as_of: 51be07d
      state: live
---

# Why is retry jitter disabled?

`retry_jitter = false` in the default config, yet the comment above the retry loop in `src/retry.rs` calls jitter "essential to avoid thundering herds." The flag was flipped off in commit `9e02c1f` ("disable jitter for now") [1] and never revisited.

# Why

Unknown — this is what an honest gap looks like instead of a confident guess. The commit message says only "for now"; there is no linked PR or issue, and the author left in 2025. Plausible stories (a flaky test sensitive to retry timing? a customer needing deterministic retries?) have **no supporting evidence**, so per the confidence rules this is a `question`, not a `speculative` decision.

Answering it: check whether any test fails with jitter enabled; ask in #harbor-dev whether anyone remembers June 2024; check support tickets from that window. If an answer surfaces, this concept becomes a `decision` with real citations and this file gets a `# Superseded by` pointer.

# Citations

[1] [commit 9e02c1f: disable jitter for now](https://github.com/acme/harbor/commit/9e02c1f)
