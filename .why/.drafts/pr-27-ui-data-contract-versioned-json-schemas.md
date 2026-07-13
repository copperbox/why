---
type: decision
title: "UI data contract: versioned JSON schemas"
description: "Draft captured from PR #27 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: DESIGN.md
      lines: "178"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: docs/ui-contract.md
      lines: 1-276
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: package-lock.json
      lines: "3"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: package-lock.json
      lines: "9"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: package-lock.json
      lines: "22"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: package.json
      lines: "3"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: package.json
      lines: "28"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: README.md
      lines: "106"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: schemas/coverage.schema.json
      lines: 1-64
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: schemas/graph.schema.json
      lines: 1-48
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: schemas/story.schema.json
      lines: 1-185
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: src/anchors.ts
      lines: "13"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: src/anchors.ts
      lines: 135-147
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: src/blame.ts
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: src/cli.ts
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: src/export.ts
      lines: 1-166
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/blame.test.ts
      lines: "163"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/blame.test.ts
      lines: "167"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/blame.test.ts
      lines: 169-177
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/blame.test.ts
      lines: 183-206
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/skills.test.ts
      lines: "21"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/skills.test.ts
      lines: "24"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/skills.test.ts
      lines: "34"
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
    - path: test/ui-contract.test.ts
      lines: 1-338
      as_of: 58dc0dbc32f9829a9a7dbc78dd561338a24cc05b
      state: live
---

# UI data contract: versioned JSON schemas

<!-- capture draft from PR #27 (merged 2026-07-13). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: src/blame.ts: 24 hunks collapsed into one whole-file anchor -->
<!-- capture: src/cli.ts: 6 hunks collapsed into one whole-file anchor -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-27-ui-data-contract-versioned-json-schemas.evidence.md (removed on promote) -->

> <!-- sandcastle-feature: {"slug":"ui-data-contract","branch":"sandcastle/feature-ui-data-contract","members":[{"id":"20","title":"UI data contract: versioned JSON schemas for story, coverage, and graph"}]} -->
>
> **Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.
>
> ### Issues in this feature
> - [x] #20 UI data contract: versioned JSON schemas for story, coverage, and graph
>
> ### Release
> `v0.7.0` (minor bump)
>
> ### Summary
> ## What & why
>
> Adds a versioned, stable UI data contract — JSON Schemas for `story`, `coverage`, and `graph` — that the upcoming `serve` and VS Code UIs render from as dumb renderers. This formalizes and extends what `why blame --json` had started, and adds `why export ui-index` / `why export graph` to produce coverage and dependency-graph data from the anchor index.
>
> ## Changes
>
> - **Schemas** (`schemas/{story,coverage,graph}.schema.json`, JSON Schema 2020-12): each carries a `schemaVersion`; `story.schema.json` makes the §2 hedging invariant structural via an `if`/`then`, so a payload asserting `hedged:false` on a non-`question` below the corroboration threshold fails validation even if forged upstream.
> - **`why blame --json`** restructured into the story contract (hits, edges grouped by relation, citations as label+url); human-readable output is byte-identical to `main` across all three output paths.
> - **`why export ui-index`**: coverage from the anchor index at HEAD — files sorted by path, whole-file claims first then ranged spans by start, each span resolving type/status/confidence + a precomputed glyph. Only live, parseable claims paint spans (lost anchors are last-known locations; unparseable `lines` are left to lint W103). No resolvable HEAD is a hard error (exit 1) rather than an unstamped payload.
> - **`why export graph`**: nodes (all concepts) + typed edges from the four §3 relation sections, deduped and sorted; unresolved links stay lint's job, never a dangling edge.
> - **`docs/ui-contract.md`**: new doc covering examples, versioning policy, glyph vocabulary, and status→treatment table. Its three JSON examples are extracted and validated against the schemas in tests, so doc and schemas can't drift.
> - **Validation**: ajv added as a dev-only dependency (an independent implementation, so a schema bug can't be masked by a matching hand-rolled validator); the contract's `schemaVersion` marker is registered as a keyword to keep ajv in strict mode.
> - **Follow-up refactor** (`a61f0a7`): consolidated the duplicated "anchor index names unknown concept" invariant into `anchors.ts::indexedConcept`, and typed `glyphFor`'s return / `CoverageSpan.glyph` / `GraphEdge.relation` against the closed vocabularies the schemas enforce. No behavior change.
>
> ## Review notes
>
> - Worth scrutinizing: the hedging if/then in `story.schema.json` — it's the structural enforcement of the confidence-ladder invariant from DESIGN.md §2, so it's worth confirming the vocab/threshold boundaries match intent.
> - The claim that human-rendered `blame` output is byte-identical pre/post-refactor was verified by diffing all three output paths against `main` — reviewer may want to spot-check rather than re-derive.
> - Test status: `npm run verify` green, 222/222 tests (includes 13 new UI-contract tests plus additions to `blame.test.ts` and `skills.test.ts`).
> - Next iteration note left in the commit: `why serve` (issue 502) should call `buildUiIndex`/`buildGraph`/`buildBlameReport` directly rather than reimplementing; any schema gap should be closed additively first.
>
> Closes #20

— PR #27 description by @dantheuber

> The PR delivers the versioned UI data contract exactly as issue #20 specifies: three JSON Schemas validated against real engine outputs over examples/harbor, the §2 hedging invariant made structural (schema rejects hedged:false on sub-corroborated hits, proven by mutation tests), why export ui-index/graph with honest lost-anchor and no-HEAD handling, and a docs/ui-contract.md whose examples are themselves schema-validated in tests — with DESIGN.md amended in the same diff and ajv justified in the PR body. It fails on a single defect: src/export.ts embeds two raw NUL bytes as a template-literal separator, so git permanently classifies the source file as binary (confirmed by probe: edits produce 'Binary files differ' with no hunks, and no .gitattributes overrides it), which breaks all future diff review of the module and silently degrades this repo's own capture/dig pipelines that derive anchors and evidence from per-file hunks.
>
> 1. src/export.ts:155 (buildGraph's dedup key, `const key = `${concept.id}…${relation}…${link.resolvedId}``) uses two literal U+0000 characters inside the template literal, making git treat the entire source file as binary — `git diff` emits 'Binary files a/src/export.ts and b/src/export.ts differ' with no hunks, so GitHub review, `why capture --pr`'s per-hunk anchor derivation, and dig evidence-pack per-file diffs all break for this file forever. Replace the raw NUL characters with the six-character escape sequence \^@ in the source (the compiled string is byte-identical, so behavior and the existing graph tests are unchanged), and confirm `git diff --stat` no longer reports the file as 'Bin'. Alternatively use a printable separator that cannot appear in concept ids or relations (e.g. '\n'), but the escape-sequence fix is the minimal one.

— PR #27 comment by @dantheuber (2026-07-13)

> This PR delivers issue #20 faithfully: three versioned JSON Schemas (story/coverage/graph) in schemas/, a new `why export ui-index|graph` subcommand plus the reshaped `why blame --json` story payload, hedging precomputed into the data as `hedged` + `renderedRationale` with the §2 invariant additionally enforced structurally by the schema (verified by direct ajv probing: unhedged speculative, inferred, and unstated-confidence payloads are all rejected), and docs/ui-contract.md whose examples are themselves validated in tests. All four acceptance criteria are demonstrably met by tests that would fail if the feature broke — real harbor outputs including the expired-constraint warning and blast radius, a temp-repo ui-index stamped with the real HEAD, hand-mutation rejection tests for every schema, and doc-example validation. Coverage correctly excludes lost and unparseable anchors, exporting without a resolvable HEAD is a loud error, DESIGN.md and README are amended in the same diff, and the ajv dependency is dev-only and justified. No invariant violations and no unrequested scope.

— PR #27 comment by @dantheuber (2026-07-13)

# Citations

[1] [PR #27: UI data contract: versioned JSON schemas](https://github.com/copperbox/why/pull/27)
[2] [merge commit 58dc0db](https://github.com/copperbox/why/commit/58dc0dbc32f9829a9a7dbc78dd561338a24cc05b)
