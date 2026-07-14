---
type: decision
title: The UI ⇄ backend boundary is a versioned JSON data contract; UIs are dumb
  renderers
description: story, coverage, and graph are JSON-Schema'd payloads carrying
  schemaVersion; the §2 hedging invariant is enforced structurally in the
  schema, and UIs render precomputed data without re-deriving it.
tags:
  - ui
  - schema
  - serve
timestamp: 2026-07-13T23:43:50.022Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: DESIGN.md
      lines: 178
      as_of: 58dc0db
      state: lost
    - path: docs/ui-contract.md
      lines: 1-287
      as_of: 518bf47
      state: live
    - path: schemas/story.schema.json
      lines: 1-185
      as_of: 58dc0db
      state: live
    - path: schemas/coverage.schema.json
      lines: 1-64
      as_of: 58dc0db
      state: live
    - path: schemas/graph.schema.json
      lines: 1-48
      as_of: 58dc0db
      state: live
    - path: src/export.ts
      lines: 1-166
      as_of: 58dc0db
      state: live
    - path: src/blame.ts
      as_of: 58dc0db
      state: live
---

# The UI ⇄ backend boundary is a versioned JSON data contract; UIs are dumb renderers

The `serve` and VS Code UIs render from a versioned JSON contract — `story`, `coverage`, and `graph` payloads, each with a `schemaVersion` and a JSON Schema (2020-12) in `schemas/`. `why blame --json` emits the story payload; `why export ui-index` and `why export graph` emit coverage and the dependency graph from the anchor index. The UIs are dumb renderers: they paint precomputed fields (glyphs, `hedged`/`renderedRationale`) and re-derive nothing.

# Why

Recorded in the PR's "What & why" [1]. A stable, versioned contract lets the UIs stay renderers rather than re-implement engine logic, and it formalizes and extends what `why blame --json` had already started. Two invariants shaped it. First, **the confidence ladder is enforced in the data, not just the view**: `story.schema.json` encodes the §2 hedging rule as a structural `if`/`then`, so a payload asserting `hedged:false` on a non-`question` hit below the corroboration threshold fails validation even if forged upstream. Second, **validation uses an independent implementation**: `ajv` is a dev-only dependency precisely so a schema bug cannot be masked by a matching hand-rolled validator. Export is honest by construction — lost and unparseable anchors never paint spans, and exporting without a resolvable HEAD is a hard error rather than an unstamped payload.

# Because of

- [Consumption before archaeology](/decisions/consumption-before-archaeology.md)

# Citations

[1] [PR #27: UI data contract: versioned JSON schemas](https://github.com/copperbox/why/pull/27)
[2] [merge commit 58dc0db](https://github.com/copperbox/why/commit/58dc0dbc32f9829a9a7dbc78dd561338a24cc05b)
