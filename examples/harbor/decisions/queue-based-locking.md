---
type: decision
title: Queue-based locking
description: Serialize all shard mutations through a single ordered command queue instead of striped RwLocks.
tags: [locking, concurrency, architecture]
timestamp: 2026-07-11
why:
  status: active
  happened_on: 2024-03-14
  confidence: recorded
  anchors:
    - path: src/lock.rs
      symbol: acquire_shared
      lines: 41-58
      as_of: a3f9c2e
      state: live
    - path: src/dispatch/queue.rs
      symbol: CommandQueue
      as_of: a3f9c2e
      state: live
---

# Queue-based locking

All shard mutations (dispatch claims, moves, rebalances) are serialized through one ordered command queue per dispatcher; reads go through `acquire_shared`, which never blocks on the queue. There is deliberately no fine-grained locking to get wrong.

# Why

Written in PR #212's description at the time [1]: after the [March stall](/incidents/2024-03-lock-stall.md), the team concluded the striped design's failure was structural — correctness depended on lock-ordering discipline across every future call site. The queue trades peak parallelism for a design where deadlock is impossible by construction. Benchmarks in the PR showed p99 dispatch latency rising ~8%, judged acceptable against a sev-1 class eliminated outright.

The 8% regression is why `acquire_shared` exists as a separate read path — pulling reads out of the queue clawed most of it back [2].

# Because of

- [2024-03 lock stall](/incidents/2024-03-lock-stall.md)
- [Striped RwLock](/attempts/striped-rwlock.md)

# Instead of

- [Striped RwLock](/attempts/striped-rwlock.md) — deadlocked under load; ordering discipline doesn't survive contributors
- Full actor-per-shard rewrite — rejected in review as a quarter-long migration for the same guarantee [1]

# Citations

[1] [PR #212: replace striped locks with command queue](https://github.com/acme/harbor/pull/212)
[2] [PR #219: lock-free read path](https://github.com/acme/harbor/pull/219)
