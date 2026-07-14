---
type: decision
title: The UI contract enforces the confidence ladder in-schema
description: story.schema.json rejects a forged hedged:false on a
  sub-corroborated hit via an if/then, validated by an independent ajv — so the
  §2 ladder holds structurally even if an upstream renderer lies.
tags:
  - schema
  - ui-contract
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: schemas/story.schema.json
      lines: 1-185
      as_of: 58dc0db
      state: live
    - path: test/ui-contract.test.ts
      lines: 1-351
      as_of: 394ff31
      state: lost
---

`story.schema.json` encodes the DESIGN §2 hedging invariant as an `if`/`then`: a payload asserting `hedged: false` on a non-`question` hit below the corroboration threshold fails validation. The contract is checked by ajv (a dev-only dependency), and the schemas' own doc examples are validated in tests.

# Why

Recorded in PR #27's description and review [1]. The UI surfaces are dumb renderers of the versioned JSON contract, so "never hedge less than the evidence supports" cannot be left to renderer code alone — a rendered surface can be forged or drift. Making the invariant *structural* means the schema itself rejects an under-hedged payload even if something upstream lies; mutation tests prove unhedged `speculative`, `inferred`, and unstated-confidence payloads are all rejected. ajv was chosen precisely because it is an independent implementation: a bug in the schema can't be masked by a hand-rolled validator that shares the same mistake. This is the §2 confidence ladder — the project's core promise — carried into the data contract rather than restated in prose [2].

# Citations

[1] [PR #27: UI data contract: versioned JSON schemas](https://github.com/copperbox/why/pull/27)
[2] [merge commit 58dc0db](https://github.com/copperbox/why/commit/58dc0dbc32f9829a9a7dbc78dd561338a24cc05b)
