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

## Operational loop

* [`why audit` expires a constraint only on hard evidence](/decisions/audit-expires-on-evidence-only.md) - flip on a non-zero check or explicit "no longer true", never on a timeout; then walk the blast radius
* [Merge-time capture emits lint-gated drafts into a dot-directory](/decisions/capture-drafts-in-a-dot-directory.md) - `.why/.drafts/` never serves; confidence is `recorded` only when rationale was found
* [`why` self-hosts its CI](/decisions/why-self-hosts-its-ci.md) - PR gate, weekly audit, post-merge capture, all running the tool on its own bundle

## Tool behavior

* [`why blame` warns on every expired constraint](/decisions/blame-warns-on-every-expired-constraint.md) - the §5 payoff must never be invisible
* [`why doctor` reports expired constraints as their own yellow section](/decisions/doctor-expired-constraints-section.md) - and unresolvable as_of reads stale, never healthy

## UI — serve & extension

* [UI ⇄ backend is a versioned JSON data contract](/decisions/ui-data-contract.md) - story/coverage/graph payloads; UIs are dumb renderers and the §2 hedging invariant is structural in the schema
* [`why serve` is a read-only, foreground, localhost-only viewer](/decisions/serve-local-ui.md) - the one deliberate exception to the no-daemon rule; wraps the CLI's own library calls
* [The VS Code extension is a standalone package that shells out to the CLI](/decisions/vscode-extension-standalone.md) - own release cadence; electron-free core renders from the contract JSON
* [Syntax highlighting lives in the client renderer, not the data contract](/decisions/serve-syntax-highlighting.md) - hand-rolled, zero-CDN, and never alters the code it colors
* [The CLI direct-run guard resolves the entry path's symlinks](/decisions/symlink-safe-direct-run-guard.md) - so symlinked launches (npm bins, the VS Code extension) still run `main()`
