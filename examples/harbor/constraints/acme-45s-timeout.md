---
type: constraint
title: Acme 45s gateway timeout
description: AcmeCorp's API gateway killed any request exceeding 45 seconds — contractual latency ceiling on job submission.
tags: [customer, latency, contract]
timestamp: 2026-07-11
why:
  status: expired
  happened_on: 2024-01-08
  expired_on: 2025-06-30
  confidence: recorded
  verify:
    method: ask
    ask: "Is the AcmeCorp enterprise contract (SFDC #4471) still active, and does their gateway still enforce a 45s cap?"
---

# Acme 45s gateway timeout

AcmeCorp — at the time harbor's largest customer — fronted all traffic with a gateway that hard-killed requests at 45 seconds. Their enterprise contract (SFDC #4471) made staying under it a support-escalation matter [1].

# Why

Not a technical constraint but a commercial one: Acme's gateway was outside our control, and their retries on kill amplified load exactly when we were slowest. Every synchronous path Acme touched had to complete comfortably inside 45s, which shaped the [47s request deadline](../decisions/47s-request-deadline.md) (47s server-side so *our* timeout fires only after theirs — deliberate, see that decision).

# Still true?

**No — expired 2025-06-30.** The Acme contract ended at June 2025 renewal (they migrated to self-hosted) [2]. No other customer is known to enforce a comparable gateway cap. Downstream decisions shaped by this constraint are candidate scar tissue; see [47s request deadline](../decisions/47s-request-deadline.md).

# Led to

- [47s request deadline](../decisions/47s-request-deadline.md)

# Citations

[1] [Issue #143: Acme gateway killing long submissions](https://github.com/acme/harbor/issues/143)
[2] [Issue #612: remove Acme-specific rate tier](https://github.com/acme/harbor/issues/612)
