---
okf_version: "0.1"
description: "Decision archive for harbor (fictional job-queue service) — the `why` schema demonstration bundle. One causal story: incident → failed attempt → decision → constraint → expired-constraint fallout → open question."
generated: false
---

# harbor — decision archive

## The story, in causal order

* [2024-03 lock stall](/incidents/2024-03-lock-stall.md) - Sev-1: dispatch stalled 41 minutes; shard locks deadlocked under peak load
* [Striped RwLock](/attempts/striped-rwlock.md) - the obvious locking design, and why it failed — ordering discipline doesn't survive contributors
* [Queue-based locking](/decisions/queue-based-locking.md) - the redesign: serialize mutations through one queue; deadlock impossible by construction
* [Acme 45s gateway timeout](/constraints/acme-45s-timeout.md) - ⚠ EXPIRED — the contractual latency ceiling that shaped the deadline below
* [47s request deadline](/decisions/47s-request-deadline.md) - the magic number (45+2, so Acme's timeout fired first); now candidate scar tissue
* [Why is retry jitter disabled?](/questions/why-retry-jitter-disabled.md) - an honest gap: rationale unrecoverable, recorded as a question instead of a guess
