---
type: incident
title: 2024-03 lock stall
description: Full queue stall for 41 minutes under peak load; shard locks deadlocked.
tags: [locking, outage, sev1]
timestamp: 2026-07-11
why:
  status: resolved
  happened_on: 2024-03-11
  confidence: recorded
  anchors:
    - path: src/lock.rs
      as_of: 8c1d44a
      state: live
---

# 2024-03 lock stall

Sev-1: harbor stopped dispatching jobs for 41 minutes during the Monday-morning peak. Root cause: lock-ordering deadlock in the striped RwLock scheme when a rebalance overlapped with a burst of cross-shard moves.

# Why

The postmortem [1] found that `rebalance()` acquired shard locks in shard-id order while `move_job()` acquired source-then-destination. Under normal load the race window was microseconds; the Monday burst held both paths open long enough to interleave. Recovery required a full process restart because the deadlock detector only covered the storage layer, not the dispatch locks.

The on-call annotation "we got lucky in Feb — same signature, self-resolved" upgraded this from a one-off to a design problem.

# Led to

- [Queue-based locking](../decisions/queue-based-locking.md)

# Citations

[1] [Postmortem: 2024-03-11 dispatch stall](https://github.com/acme/harbor/blob/main/docs/postmortems/2024-03-11-dispatch-stall.md)
[2] [Issue #198: dispatcher hung, all shards idle](https://github.com/acme/harbor/issues/198)
