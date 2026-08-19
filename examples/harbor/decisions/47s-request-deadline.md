---
type: decision
title: 47s request deadline
description: Server-side request deadline pinned at 47 seconds — 2s past Acme's gateway cap, so their timeout always fires first.
tags: [latency, timeout, config]
timestamp: 2026-07-11
why:
  status: active
  happened_on: 2024-01-15
  confidence: corroborated
  anchors:
    - path: config/defaults.toml
      lines: 22-24
      as_of: 51be07d
      state: live
    - path: src/server/deadline.rs
      symbol: REQUEST_DEADLINE
      as_of: 51be07d
      state: live
---

# 47s request deadline

`request_deadline = 47s` in the default config — the magic number people ask about. It is 45 + 2, not an arbitrary choice.

# Why

Set two seconds *past* the [Acme gateway's 45s kill](../constraints/acme-45s-timeout.md), deliberately: if our deadline fired first, Acme's gateway saw a clean error and retried immediately, doubling load during slowdowns. Letting *their* timeout fire first meant their retry logic backed off instead. The 2s margin covers clock skew and gateway jitter.

Confidence is `corroborated` rather than `recorded`: the commit message says only "bump deadline 30→47s for Acme" [1], but the linked issue thread contains the fire-first reasoning [2], and the two agree.

**⚠ Upstream constraint expired.** The [Acme constraint](../constraints/acme-45s-timeout.md) ended 2025-06-30. Nothing else is known to depend on the specific value 47. This decision is candidate scar tissue: the deadline could likely revert to a value chosen on our own merits. Filed for review — an audit should confirm no other customer inherited a similar cap before changing it.

# Because of

- [Acme 45s gateway timeout](../constraints/acme-45s-timeout.md)

# Citations

[1] [commit 51be07d: bump deadline 30→47s for Acme](https://github.com/acme/harbor/commit/51be07d)
[2] [Issue #143, comment thread on retry amplification](https://github.com/acme/harbor/issues/143#issuecomment-1877401)
