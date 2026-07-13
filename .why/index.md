---
okf_version: "0.1"
generated: false
description: Decision archive for the why tool itself — the self-hosted bundle. Seeded from PLAN.md's retired Decision log; new entries arrive via why capture and the CI recipes in docs/ci.md.
---

# why — decision archive

## Substrate and schema

* [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md) - plain OKF markdown over a bespoke store
* [Extension keys namespaced under one `why:` map](/decisions/namespaced-why-frontmatter.md) - collision-proof, round-trips through plain okf-mcp
* [Edge types by section convention, not new syntax](/decisions/edge-types-by-section-convention.md) - bundles stay valid OKF and legible anywhere

## Roadmap and process

* [Consumption before archaeology](/decisions/consumption-before-archaeology.md) - prove the read side before building dig
* [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md) - implementation delegated to the issue→PR pipeline
* [Issues are the spec surface](/decisions/issues-are-the-spec-surface.md) - testable acceptance criteria or autonomous review is meaningless
* [Circuit breaker: repeated escalation halts the loop for a chat](/decisions/escalation-circuit-breaker.md) - spec rewrites are reserved for humans

## Tool behavior

* [`why blame` warns on every expired constraint](/decisions/blame-warns-on-every-expired-constraint.md) - the §5 payoff must never be invisible
* [`why doctor` reports expired constraints as their own yellow section](/decisions/doctor-expired-constraints-section.md) - and unresolvable as_of reads stale, never healthy
