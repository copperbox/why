---
type: attempt
title: Striped RwLock
description: Per-shard striped RwLocks for dispatch — the obvious design; deadlocked under load.
tags: [locking, concurrency]
timestamp: 2026-07-11
why:
  status: failed
  happened_on: 2023-09-20
  confidence: corroborated
---

# Striped RwLock

The original dispatch-locking design: one RwLock per shard stripe, readers for dispatch, writers for rebalance and cross-shard moves. Shipped September 2023, removed March 2024.

# Why

It was the textbook answer and benchmarked well [1]. The failure mode wasn't performance — it was lock-ordering discipline across independently evolving call sites. Two orderings crept in via separate PRs ([2], [3]), each locally reasonable, jointly deadlock-prone. The [2024-03 stall](/incidents/2024-03-lock-stall.md) was the bill.

The durable lesson recorded in the replacement PR: *"any scheme where correctness depends on every future contributor acquiring locks in the same order is a scheme that fails eventually"* [4]. That sentence is why the fix was a redesign, not an ordering audit.

# Led to

- [2024-03 lock stall](/incidents/2024-03-lock-stall.md)

# Citations

[1] [PR #61: striped shard locks](https://github.com/acme/harbor/pull/61)
[2] [PR #114: rebalance in shard-id order](https://github.com/acme/harbor/pull/114)
[3] [PR #171: cross-shard move locks source first](https://github.com/acme/harbor/pull/171)
[4] [PR #212 description](https://github.com/acme/harbor/pull/212)
