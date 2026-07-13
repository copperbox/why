# Evidence pack: pr-27

- commits: 58dc0db
- files touched: DESIGN.md, docs/ui-contract.md, package-lock.json, package.json, README.md, schemas/coverage.schema.json, schemas/graph.schema.json, schemas/story.schema.json, src/anchors.ts, src/blame.ts, src/cli.ts, src/export.ts, test/blame.test.ts, test/skills.test.ts, test/ui-contract.test.ts
- references: PR #27

## Commits

### commit 58dc0db

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-12

UI data contract: versioned JSON schemas (#27)

* RALPH: UI data contract — versioned schemas for story, coverage, graph (issue #20 / issues/501, DESIGN.md §7)

The stable surface both coming UIs (serve, VS Code) render from as dumb
renderers: schemas/{story,coverage,graph}.schema.json (JSON Schema
2020-12, each carrying a top-level schemaVersion), docs/ui-contract.md
(examples, versioning policy, glyph vocabulary, status→treatment table),
and the engine outputs to match.

Key decisions:
- `why blame --json` restructured into the story contract (schemaVersion,
  hits, edges grouped by relation becauseOf/insteadOf/supersededBy,
  citations as label+url) — the issue formalizes what blame --json
  started, so v1 is the moment to shape it; the human rendering is
  byte-identical (verified by diffing all three output paths against
  main), per the out-of-scope rule.
- Hedging lives in the data AND the schema: hits carry hedged +
  renderedRationale precomputed by the engine, and story.schema.json
  makes the §2 invariant structural with an if/then — a payload claiming
  hedged:false on a non-question below corroborated fails validation, so
  even a forged payload can't sneak unhedged speculation past a
  contract-conformance check. Asserted in tests (inferred → hedged:true,
  "likely — " prefix; the same payload mutated to hedged:false rejected).
- `why export ui-index`: coverage from the anchor index at HEAD, files
  sorted by path, whole-file claims first then ranged spans by start,
  each span resolving type/status/confidence + the precomputed glyph
  (glyphFor now shared from blame.ts). Only live, parseable claims paint
  spans: lost anchors are last-known locations, unparseable `lines`
  can't verifiably cover anything (lint W103 owns reporting them) —
  documented in the doc, pinned in a test. No resolvable HEAD is an
  operational error (exit 1), never an unstamped payload — the sha is
  the staleness-detection contract.
- `why export graph`: nodes (all concepts, sorted by id) + typed edges
  from resolved links in the four §3 edge sections (becauseOf/insteadOf/
  supersededBy/ledTo), deduped and sorted; unresolved edge links stay
  lint's broken-link finding, never a dangling edge.
- Validation via ajv (devDependency, tests only): an implementation
  independent of this codebase, so a schema bug can't be masked by a
  matching hand-rolled-validator bug. The contract's own schemaVersion
  marker is registered as a keyword so ajv stays in strict mode.
- docs/ui-contract.md's three JSON examples are extracted and validated
  against their schemas in the test, so doc and schemas cannot drift;
  the doc joined skills.test.ts's DOC_PATHS guard and `export` joined
  IMPLEMENTED_SUBCOMMANDS.
- Acceptance covered: story for harbor src/lock.rs:47 validates with the
  expired-Acme warning + downstream blast radius; ui-index runs over a
  temp git repo whose files match the harbor anchors (head = that repo's
  HEAD); hand-mutated payloads (wrong version, off-vocabulary glyph/
  relation/confidence, unknown keys, missing fields) all fail.

Files: schemas/ (new, 3 schemas), docs/ui-contract.md (new),
src/export.ts (new), src/blame.ts (story shape, hedging precomputed,
glyphFor exported), src/cli.ts (export command, --out),
test/ui-contract.test.ts (new, 13 tests), test/blame.test.ts (json
contract + hedged-data test), test/skills.test.ts (doc guards),
DESIGN.md §8, README.md Status, package.json (+ajv dev).
npm run verify: 222/222.

Notes for next iteration: `why serve` (issue 502) should reuse
buildUiIndex/buildGraph/buildBlameReport directly — endpoints stay thin;
if the UI needs data the contract lacks, extend the schema first
(additive = no bump) per the policy in docs/ui-contract.md.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* Refine UI-contract export code: shared invariant helper, closed vocab types

- Consolidate the duplicated "anchor index names unknown concept" invariant
  from blame.ts and export.ts into anchors.ts (indexedConcept) — the index
  module owns the index↔bundle pairing guarantee.
- Type glyphFor's return and CoverageSpan.glyph as the closed Glyph
  vocabulary the coverage schema enforces, and GraphEdge.relation as the
  four §3 relation names, so the compiler carries what the schemas assert.

No behavior change; npm run verify green (222 tests).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* chore(release): v0.7.0 (minor)

* fix: replace raw NUL bytes in graph dedup key with \u0000 escapes

The two literal U+0000 characters in buildGraph dedup-key template
literal made git classify src/export.ts as binary, breaking diff review
and the per-hunk anchor/evidence pipelines for this file. The compiled
string is byte-identical, so graph behavior is unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

---------

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>

## Pull requests

### PR #27 — UI data contract: versioned JSON schemas

by @dantheuber

<!-- sandcastle-feature: {"slug":"ui-data-contract","branch":"sandcastle/feature-ui-data-contract","members":[{"id":"20","title":"UI data contract: versioned JSON schemas for story, coverage, and graph"}]} -->

**Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.

### Issues in this feature
- [x] #20 UI data contract: versioned JSON schemas for story, coverage, and graph

### Release
`v0.7.0` (minor bump)

### Summary
## What & why

Adds a versioned, stable UI data contract — JSON Schemas for `story`, `coverage`, and `graph` — that the upcoming `serve` and VS Code UIs render from as dumb renderers. This formalizes and extends what `why blame --json` had started, and adds `why export ui-index` / `why export graph` to produce coverage and dependency-graph data from the anchor index.

## Changes

- **Schemas** (`schemas/{story,coverage,graph}.schema.json`, JSON Schema 2020-12): each carries a `schemaVersion`; `story.schema.json` makes the §2 hedging invariant structural via an `if`/`then`, so a payload asserting `hedged:false` on a non-`question` below the corroboration threshold fails validation even if forged upstream.
- **`why blame --json`** restructured into the story contract (hits, edges grouped by relation, citations as label+url); human-readable output is byte-identical to `main` across all three output paths.
- **`why export ui-index`**: coverage from the anchor index at HEAD — files sorted by path, whole-file claims first then ranged spans by start, each span resolving type/status/confidence + a precomputed glyph. Only live, parseable claims paint spans (lost anchors are last-known locations; unparseable `lines` are left to lint W103). No resolvable HEAD is a hard error (exit 1) rather than an unstamped payload.
- **`why export graph`**: nodes (all concepts) + typed edges from the four §3 relation sections, deduped and sorted; unresolved links stay lint's job, never a dangling edge.
- **`docs/ui-contract.md`**: new doc covering examples, versioning policy, glyph vocabulary, and status→treatment table. Its three JSON examples are extracted and validated against the schemas in tests, so doc and schemas can't drift.
- **Validation**: ajv added as a dev-only dependency (an independent implementation, so a schema bug can't be masked by a matching hand-rolled validator); the contract's `schemaVersion` marker is registered as a keyword to keep ajv in strict mode.
- **Follow-up refactor** (`a61f0a7`): consolidated the duplicated "anchor index names unknown concept" invariant into `anchors.ts::indexedConcept`, and typed `glyphFor`'s return / `CoverageSpan.glyph` / `GraphEdge.relation` against the closed vocabularies the schemas enforce. No behavior change.

## Review notes

- Worth scrutinizing: the hedging if/then in `story.schema.json` — it's the structural enforcement of the confidence-ladder invariant from DESIGN.md §2, so it's worth confirming the vocab/threshold boundaries match intent.
- The claim that human-rendered `blame` output is byte-identical pre/post-refactor was verified by diffing all three output paths against `main` — reviewer may want to spot-check rather than re-derive.
- Test status: `npm run verify` green, 222/222 tests (includes 13 new UI-contract tests plus additions to `blame.test.ts` and `skills.test.ts`).
- Next iteration note left in the commit: `why serve` (issue 502) should call `buildUiIndex`/`buildGraph`/`buildBlameReport` directly rather than reimplementing; any schema gap should be closed additively first.

Closes #20

Comments:

- **dantheuber** (2026-07-13):
  <!-- gatekeeper round:1 verdict:request-changes -->
  ## Gatekeeper — round 1: request-changes
  
  The PR delivers the versioned UI data contract exactly as issue #20 specifies: three JSON Schemas validated against real engine outputs over examples/harbor, the §2 hedging invariant made structural (schema rejects hedged:false on sub-corroborated hits, proven by mutation tests), why export ui-index/graph with honest lost-anchor and no-HEAD handling, and a docs/ui-contract.md whose examples are themselves schema-validated in tests — with DESIGN.md amended in the same diff and ajv justified in the PR body. It fails on a single defect: src/export.ts embeds two raw NUL bytes as a template-literal separator, so git permanently classifies the source file as binary (confirmed by probe: edits produce 'Binary files differ' with no hunks, and no .gitattributes overrides it), which breaks all future diff review of the module and silently degrades this repo's own capture/dig pipelines that derive anchors and evidence from per-file hunks.
  
  1. src/export.ts:155 (buildGraph's dedup key, `const key = `${concept.id}…${relation}…${link.resolvedId}``) uses two literal U+0000 characters inside the template literal, making git treat the entire source file as binary — `git diff` emits 'Binary files a/src/export.ts and b/src/export.ts differ' with no hunks, so GitHub review, `why capture --pr`'s per-hunk anchor derivation, and dig evidence-pack per-file diffs all break for this file forever. Replace the raw NUL characters with the six-character escape sequence \^@ in the source (the compiled string is byte-identical, so behavior and the existing graph tests are unchanged), and confirm `git diff --stat` no longer reports the file as 'Bin'. Alternatively use a printable separator that cannot appear in concept ids or relations (e.g. '\n'), but the escape-sequence fix is the minimal one.
- **dantheuber** (2026-07-13):
  <!-- gatekeeper round:2 verdict:merge -->
  ## Gatekeeper — round 2: merge
  
  This PR delivers issue #20 faithfully: three versioned JSON Schemas (story/coverage/graph) in schemas/, a new `why export ui-index|graph` subcommand plus the reshaped `why blame --json` story payload, hedging precomputed into the data as `hedged` + `renderedRationale` with the §2 invariant additionally enforced structurally by the schema (verified by direct ajv probing: unhedged speculative, inferred, and unstated-confidence payloads are all rejected), and docs/ui-contract.md whose examples are themselves validated in tests. All four acceptance criteria are demonstrably met by tests that would fail if the feature broke — real harbor outputs including the expired-constraint warning and blast radius, a temp-repo ui-index stamped with the real HEAD, hand-mutation rejection tests for every schema, and doc-example validation. Coverage correctly excludes lost and unparseable anchors, exporting without a resolvable HEAD is a loud error, DESIGN.md and README are amended in the same diff, and the ajv dependency is dev-only and justified. No invariant violations and no unrequested scope.
  
  Verified with `npm run verify` on the branch before merging.


## Diffs

### diff of commit 58dc0db

````diff
diff --git a/DESIGN.md b/DESIGN.md
index 437f9f7..7a46bab 100644
--- a/DESIGN.md
+++ b/DESIGN.md
@@ -175,7 +175,7 @@ Same data over MCP: agents mount the bundle via okf-mcp and get story-of-this-co
 ## 8. Implementation shape
 
 - **Language:** TypeScript (Node), matching okf-mcp; depends on okf-mcp as a library where possible rather than shelling out.
-- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | init`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it.
+- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | export | init`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
 - **Agent integration:** dig/audit agent prompts ship as Claude Code skills in `skills/`; the CLI's `--episodes`/`--evidence` subcommands are the deterministic tools those skills call.
 - **No daemon.** Everything is a run-to-completion command suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly).
````

````diff
diff --git a/README.md b/README.md
index 79e2147..bf3109f 100644
--- a/README.md
+++ b/README.md
@@ -103,7 +103,7 @@ npx -y @copperbox/okf-mcp --bundle why=.why inspect
 
 ## Status
 
-Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all eight subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>/.cache/` keyed by bundle contents + repo HEAD — the cache directory ignores itself via its own `.gitignore`, so `why init` needs no gitignore handling and existing bundles get the same behavior. `why lint` works: it delegates OKF conformance to okf-mcp and enforces the `why`-schema layer above it (DESIGN.md §2 vocab tables, required sections, edge-target types, status/section consistency) as stable `W###` rules — human-readable by default or `--json`, exit 1 on any error-severity finding. `why anchor` works: it re-resolves every anchor claim against HEAD (symbol-first, then blame-trace, then honestly `lost` — never a guess) and rewrites only the `why.anchors` frontmatter entries, leaving every other byte of the concept untouched; `--check` is the CI mode (resolve, write nothing, exit 1 on drift) and `--concept <id>` scopes a run. It currently carries its own minimal internal resolvers; standalone, more capable resolvers now exist alongside it and are next in line to replace them behind the same seam — a blame-trace resolver ([src/trace-range.ts](src/trace-range.ts)) that traces an anchored line range from its as-of commit to HEAD, or proves it `lost`, and a symbol resolver ([src/find-symbol.ts](src/find-symbol.ts)) that finds a named symbol at HEAD (tree-sitter WASM grammars for TypeScript/JavaScript, Rust, Python and Go; a lower-confidence line-regex heuristic elsewhere), following a symbol into another file only when git history connects it to the anchored one, and answering `ambiguous` rather than guessing between duplicate declarations. The anchor resolver's survival rate is measured by a torture harness ([test/torture/](test/torture/README.md)) that replays a repo's history commit by commit through the real `why anchor` command and fails on any silently-wrong anchor — `npm run test:torture` runs the built-in scenario, and it can be pointed at a real repo with seeded anchors. `why doctor` works: a read-only bundle health report — lost anchors and lint errors are red (exit 1); stale `as_of`s, overdue `review-by` constraints, `status: unknown` and expired constraints, and open questions (age-sorted) are yellow (exit 0) — human-readable by default or `--json`; it now also opens with a dig-freshness line (commits since the last dig on the current branch). `why dig --episodes` works — the deterministic half of archaeology (DESIGN.md §6 step 1): it walks git history (high-water mark → HEAD when `<bundle>/.dig-state.json` carries one; full history otherwise), clusters commits into episodes (merge/PR boundaries first, then same-author/<48h/file-overlap clustering for direct commits), and flags tells — reverts, fix-chains, sudden churn on old-quiet files, comment tells — per episode and in a global summary; `--json` or `--out <file>` emit a stable, documented JSON report ([docs/dig-episodes.md](docs/dig-episodes.md)). `why dig --evidence <episodes.json>` works: it assembles one deterministic evidence pack per episode — full commit messages, PR/issue threads via `gh` (degrading to explicit `[unavailable: …]` markers when there's no remote or no `gh`), local exported context via `--evidence-dir`, and per-file-clipped diffs under a `--max-chars` budget with `[clipped: …]` markers naming what was cut — packs land in the self-ignoring `<bundle>/.cache/evidence/` by default; format documented in [docs/dig-evidence.md](docs/dig-evidence.md). The judgment half of the dig pipeline ships as Claude Code skills, not code: [skills/dig/SKILL.md](skills/dig/SKILL.md) (per-episode reconstruction — schema contract, the verbatim confidence ladder, cite-everything, prefer-`question`-over-`speculative`, update-don't-duplicate) and [skills/dig-synthesize/SKILL.md](skills/dig-synthesize/SKILL.md) (cross-episode merge/supersede/promote pass ending in clean `lint` + `doctor`), with the end-to-end runbook — the era-chunked cold-start order and a dry walkthrough of the harbor story included — in [docs/digging.md](docs/digging.md). Incremental dig state is in place ([src/dig-state.ts](src/dig-state.ts)): `.why/.dig-state.json` holds a per-branch high-water mark, advanced atomically only after a successful episode emission and safe to delete (re-dig everything; synthesis dedupes), with `--from <rev>`/`--full` honored as range overrides by `why dig --episodes`. `why audit` works — the DESIGN.md §5 payoff: it sweeps every `active` constraint, running `verify.method: check` commands (confined to the repo directory, with a timeout and captured output), exporting `method: ask` items as an agent questionnaire (`--questions-out`; the CLI never calls an LLM — apply the filled-in answers with `--answers`), and flagging overdue `review_by` dates; a failed check or a no-longer-true answer flips the constraint to `status: expired` (frontmatter patch + evidence appended to `# Still true?`, the rest of the file byte-for-byte intact), walks `# Because of` edges backwards, and files a `question` concept for every still-active decision downstream unless an open question already links the pair — human report or `--json`, exit 1 whenever anything newly expired (the CI signal that the archive learned something). Constraints already expired before the run stay report-only: their downstream candidacy is listed, never re-flagged. `why capture` works — merge-time capture, the steady state that eventually makes digging rare (DESIGN.md open problem #5): `--pr <n>` assembles a merged/closed PR's evidence via `gh` (reusing the dig evidence module) and emits a draft concept into `.why/.drafts/` — type guessed from merge-vs-close (`decision`/`attempt`), `happened_on` from the merge time, anchors derived per hunk from the merge commit's zero-context diff, citations to the PR, and rationale candidates quoted verbatim with attribution, alongside an evidence-pack sidecar; `--commit <sha>` is the gh-free fallback. Drafts live in a dot-directory precisely so okf-mcp never serves them, and leave it only through the lint-gated editorial step `why capture --promote <draft>` (errors roll the write back and keep the draft). The judgment step ships as a third skill, [skills/capture/SKILL.md](skills/capture/SKILL.md), and the post-merge CI recipe is [docs/capture.md](docs/capture.md).
+Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all nine subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>
[clipped: diff of README.md in 58dc0db — showing 8000 of 15029 chars]
````

````diff
diff --git a/docs/ui-contract.md b/docs/ui-contract.md
new file mode 100644
index 0000000..329880b
--- /dev/null
+++ b/docs/ui-contract.md
@@ -0,0 +1,276 @@
+# The UI data contract
+
+Every `why` UI — the local web UI (issue 502) and the VS Code extension
+(issue 503) — is a *dumb renderer* over the three versioned JSON payloads
+documented here. Anchor resolution, confidence semantics, and hedging stay in
+the engine; a presentation layer contains no logic that could drift from
+DESIGN.md. The schemas are JSON Schema (draft 2020-12) documents in
+[schemas/](../schemas/), and [test/ui-contract.test.ts](../test/ui-contract.test.ts)
+validates the engine's real outputs (and this document's examples) against
+them on every run.
+
+| Payload | Produced by | Schema |
+|---|---|---|
+| story | `why blame <target> --json` | [schemas/story.schema.json](../schemas/story.schema.json) |
+| coverage | `why export ui-index [--out <file>]` | [schemas/coverage.schema.json](../schemas/coverage.schema.json) |
+| graph | `why export graph [--out <file>]` | [schemas/graph.schema.json](../schemas/graph.schema.json) |
+
+## Versioning policy
+
+Each schema document and each payload carry a `schemaVersion` — an integer
+naming the **major** version of that payload's shape.
+
+- **Additive changes are minor**: a new optional field updates the schema
+  document in place without bumping `schemaVersion`. A renderer must ignore
+  fields it does not recognize (the schemas here are strict —
+  `additionalProperties: false` — so *producer* tests catch accidental
+  fields; consumers should not re-validate payloads at runtime).
+- **Breaking changes are major**: renaming, removing, or retyping a field, or
+  changing its semantics, bumps the `schemaVersion` const in the schema and
+  the value the engine emits. A renderer that sees a `schemaVersion` above
+  the one it was built for must say so rather than guess.
+
+## Renderer guidance
+
+**Hedging lives in the data, not the renderer.** Every story hit carries
+`renderedRationale` — the one-line rationale with its mandatory hedge prefix
+already baked in (`likely — ` for `inferred`; `speculation, thin evidence — `
+for `speculative` *and* for an unstated confidence, which never hedges less
+than the evidence supports) — plus a boolean `hedged`. Display
+`renderedRationale` verbatim; never reconstruct it from `description` +
+`confidence`. A renderer that ignores confidence entirely still cannot show
+unhedged speculation, and the story schema enforces the invariant
+structurally: a payload claiming `hedged: false` on an `inferred` hit fails
+validation.
+
+```jsonc
+// a hedged hit, abbreviated
+{
+  "confidence": "inferred",
+  "hedged": true,
+  "description": "The cache is sized to fit one shard.",
+  "renderedRationale": "likely — The cache is sized to fit one shard."
+}
+```
+
+**Glyph vocabulary** (precomputed into coverage spans; stories derive the same
+way from `type` + `status`):
+
+| Glyph | Meaning |
+|---|---|
+| `●` | live concept — a decision, constraint, attempt, or incident in a non-warning status |
+| `⚠` | warning — an `expired` constraint or a `superseded` decision |
+| `?` | question — an honest gap; there is no rationale to render |
+
+**Status → treatment** (statuses are per-type, DESIGN.md §2):
+
+| Status | On | Treatment |
+|---|---|---|
+| `active` | decision, constraint | normal emphasis — this is why the code is shaped this way |
+| `superseded` | decision | de-emphasize; link onward via the `supersededBy` edges |
+| `reversed` | decision | de-emphasize; historical |
+| `expired` | constraint | loud warning treatment; always show the `downstream` blast radius ("may now be scar tissue") |
+| `unknown` | constraint | uncertainty badge; suggest `why audit` |
+| `failed` / `abandoned` / `partial` | attempt | muted, historical — the road not taken |
+| `resolved` | incident | normal, historical |
+| `recurring` | incident | warning-adjacent — it will happen again |
+| `open` | question | prominent — an unanswered gap invites the reader |
+| `answered` | question | muted |
+
+## Story — `why blame --json`
+
+The decision story behind a file or line range: the resolved `target`, the
+narrowest covering anchor `span`, `hits` (concepts anchored on the target,
+newest first), `warnings` (every expired constraint not already among the
+hits — the DESIGN.md §5 payoff is never invisible, each with its `downstream`
+blast radius), and `nearby` — the fallback list of the nearest anchored
+concepts when nothing covers the target, so output is never empty. Each hit
+carries its anchors as written, outgoing edges grouped by relation
+(`becauseOf`, `insteadOf`, `supersededBy`), citations as label + url, and the
+precomputed `hedged` / `renderedRationale` pair described above.
+
+Example (`why blame src/lock.rs:47 --json` over [examples/harbor](../examples/harbor/), abbreviated to one hit):
+
+```json
+{
+  "schemaVersion": 1,
+  "target": { "path": "src/lock.rs", "lines": { "start": 47, "end": 47 } },
+  "span": "src/lock.rs:41-58 · acquire_shared",
+  "hits": [
+    {
+      "id": "decisions/queue-based-locking",
+      "title": "Queue-based locking",
+      "type": "decision",
+      "status": "active",
+      "happened_on": "2024-03-14",
+      "confidence": "recorded",
+      "description": "Serialize all shard mutations through a single ordered command queue instead of striped RwLocks.",
+      "hedged": false,
+      "renderedRationale": "Serialize all shard mutations through a single ordered command queue instead of striped RwLocks.",
+      "anchors": [
+        { "path": "src/lock.rs", "symbol": "acquire_shared", "lines": "41-58", "as_of": "a3f9c2e", "state": "live" }
+      ],
+      "edges": {
+        "becauseOf": [
+          { "title": "2024-03 lock stall", "id": "incidents/2024-03-lock-stall", "type": "incident", "status": "resolved" }
+        ],
+        "insteadOf": [
+          { "title": "Striped RwLock", "id": "attempts/striped-rwlock", "type": "attempt", "status": "failed" }
+        ],
+        "supersededBy": []
+      },
+      "citations": [
+        { "label": "PR #212: replace striped locks with command queue", "url": "https://github.com/acme/harbor/pull/212" }
+      ],
+      "evidence": ["PR #212"],
+      "downstream": []
+    }
+  ],
+  "warnings": [
+    {
+      "id": "constraints/acme-45s-timeout",
+      "title": "Acme 45s gateway timeout",
+      "type": "constraint",
+      "status": "expired",
+      "happened_on": "2024-01-08",
+      "expired_on": "2025-06-30",
+      "confidence": "recorded",
+      "description": "AcmeCorp's API gateway killed any request exceeding 45 seconds — contractual latency ceiling on job submission.",
+      "hedged": false,
+      "renderedRationale": "AcmeCorp's API gateway killed any request exceeding 45 seconds — contractual latency ceiling on job submission.",
+      "anchors": [],
+      "edges": { "becauseOf": [], "insteadOf": [], "supersededBy": [] },
+      "citations": [
+        { "label": "Issue #612: remove Acme-specific rate tier", "url": "https://github.com/acme/harbor/issues/612" }
+      ],
+      "evidence": ["Issue #612"],
+      "downstream": [
+        { "title": "47s request deadline", "id": "decisions/47s-request-deadline", "type": "decision", "status": "active" }
+      ]
+    }
+  ],
+  "nearby": []
+}
+```
+
+Notes:
+
+- `warnings` entries share the hit shape; their `anchors` list is empty when
+  no anchor of theirs covers the target, and `downstream` lists the still-
+  `active` decisions reachable via their led-to edges — render each as
+  "may now be scar tissue".
+- On an uncovered target, `hits` and `warnings` behave as above and `nearby`
+  lists up to five anchored concepts ranked by directory distance, each with
+  the anchor that placed it — never empty output for a bundle with anchors.
+- `evidence` is derived convenience (citation labels clipped at the first
+  colon, deduplicated) for one-line rendering; `cita
[clipped: diff of docs/ui-contract.md in 58dc0db — showing 8000 of 11745 chars]
````

````diff
diff --git a/package-lock.json b/package-lock.json
index edfb2b4..cb00a58 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "@copperbox/why",
-  "version": "0.6.0",
+  "version": "0.7.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "@copperbox/why",
-      "version": "0.6.0",
+      "version": "0.7.0",
       "license": "MIT",
       "dependencies": {
         "@copperbox/okf-mcp": "^0.19.1",
@@ -19,6 +19,7 @@
       "devDependencies": {
         "@copperbox/sandcastle-workflow": "^0.4.2",
         "@types/node": "^22.10.0",
+        "ajv": "^8.20.0",
         "tsx": "^4.19.0",
         "typescript": "^5.7.0",
         "yaml": "^2.9.0"
````

````diff
diff --git a/package.json b/package.json
index e1bbecd..e5ccbb6 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@copperbox/why",
-  "version": "0.6.0",
+  "version": "0.7.0",
   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
   "type": "module",
   "license": "MIT",
@@ -25,6 +25,7 @@
   "devDependencies": {
     "@copperbox/sandcastle-workflow": "^0.4.2",
     "@types/node": "^22.10.0",
+    "ajv": "^8.20.0",
     "tsx": "^4.19.0",
     "typescript": "^5.7.0",
     "yaml": "^2.9.0"
````

````diff
diff --git a/schemas/coverage.schema.json b/schemas/coverage.schema.json
new file mode 100644
index 0000000..ce8aada
--- /dev/null
+++ b/schemas/coverage.schema.json
@@ -0,0 +1,64 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/coverage.schema.json",
+  "title": "why coverage (ui-index)",
+  "description": "Output of `why export ui-index`: the per-file coverage map — which concepts anchor which spans — computed from the anchor index at HEAD. docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "head", "files"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "head": {
+      "description": "Full sha of the repo HEAD the index was computed at — consumers compare it to their checkout to detect staleness.",
+      "type": "string",
+      "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
+    },
+    "files": {
+      "description": "Files carrying at least one live anchor claim, ordered by path.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/file" }
+    }
+  },
+  "$defs": {
+    "file": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["path", "spans"],
+      "properties": {
+        "path": { "type": "string" },
+        "spans": {
+          "description": "Whole-file claims first, then ranged spans ordered by start — non-overlapping where possible, but two concepts may honestly claim overlapping spans.",
+          "type": "array",
+          "minItems": 1,
+          "items": { "$ref": "#/$defs/span" }
+        }
+      }
+    },
+    "span": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["conceptId", "type", "glyph"],
+      "properties": {
+        "conceptId": { "type": "string" },
+        "type": { "enum": ["decision", "constraint", "attempt", "incident", "question"] },
+        "status": { "type": "string" },
+        "confidence": { "enum": ["recorded", "corroborated", "inferred", "speculative"] },
+        "glyph": {
+          "description": "Status glyph, precomputed by the engine — same vocabulary `why blame` renders (docs/ui-contract.md).",
+          "enum": ["●", "⚠", "?"]
+        },
+        "lines": {
+          "description": "1-based inclusive line range; absent = a whole-file claim.",
+          "type": "object",
+          "additionalProperties": false,
+          "required": ["start", "end"],
+          "properties": {
+            "start": { "type": "integer", "minimum": 1 },
+            "end": { "type": "integer", "minimum": 1 }
+          }
+        }
+      }
+    }
+  }
+}
````

````diff
diff --git a/schemas/graph.schema.json b/schemas/graph.schema.json
new file mode 100644
index 0000000..ede3fde
--- /dev/null
+++ b/schemas/graph.schema.json
@@ -0,0 +1,48 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/graph.schema.json",
+  "title": "why graph",
+  "description": "Output of `why export graph`: the bundle as nodes and typed edges (relation names from DESIGN.md §3), suitable for direct rendering. docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "nodes", "edges"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "nodes": {
+      "description": "Every concept in the bundle, ordered by id.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/node" }
+    },
+    "edges": {
+      "description": "Resolved links in the four §3 edge sections, ordered by (from, relation, to).",
+      "type": "array",
+      "items": { "$ref": "#/$defs/edge" }
+    }
+  },
+  "$defs": {
+    "node": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["id", "type", "title"],
+      "properties": {
+        "id": { "type": "string" },
+        "type": { "enum": ["decision", "constraint", "attempt", "incident", "question"] },
+        "title": { "type": "string" },
+        "status": { "type": "string" },
+        "confidence": { "enum": ["recorded", "corroborated", "inferred", "speculative"] },
+        "happened_on": { "type": "string" }
+      }
+    },
+    "edge": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["from", "to", "relation"],
+      "properties": {
+        "from": { "type": "string" },
+        "to": { "type": "string" },
+        "relation": { "enum": ["becauseOf", "insteadOf", "supersededBy", "ledTo"] }
+      }
+    }
+  }
+}
````

````diff
diff --git a/schemas/story.schema.json b/schemas/story.schema.json
new file mode 100644
index 0000000..c846961
--- /dev/null
+++ b/schemas/story.schema.json
@@ -0,0 +1,185 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/story.schema.json",
+  "title": "why story",
+  "description": "Output of `why blame --json`: the decision story behind a file or line range, including the nearest-concepts fallback for uncovered targets. DESIGN.md §7 governs semantics; docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "target", "hits", "warnings", "nearby"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "target": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["path"],
+      "properties": {
+        "path": { "type": "string" },
+        "lines": { "$ref": "#/$defs/lineRange" }
+      }
+    },
+    "span": {
+      "description": "Narrowest covering anchor span, e.g. \"src/lock.rs:41-58 · acquire_shared\" — present only when something hit.",
+      "type": "string"
+    },
+    "hits": {
+      "description": "Concepts anchored on the target, newest first.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/hit" }
+    },
+    "warnings": {
+      "description": "Expired constraints not already among the hits — never invisible (DESIGN.md §7), each carrying its downstream blast radius.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/hit" }
+    },
+    "nearby": {
+      "description": "The fallback when nothing hits: anchored concepts nearest the target's directory, nearest first.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/nearbyConcept" }
+    }
+  },
+  "$defs": {
+    "lineRange": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["start", "end"],
+      "properties": {
+        "start": { "type": "integer", "minimum": 1 },
+        "end": { "type": "integer", "minimum": 1 }
+      }
+    },
+    "conceptType": { "enum": ["decision", "constraint", "attempt", "incident", "question"] },
+    "confidence": { "enum": ["recorded", "corroborated", "inferred", "speculative"] },
+    "anchor": {
+      "description": "An anchor claim exactly as written in frontmatter (DESIGN.md §4).",
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["path"],
+      "properties": {
+        "path": { "type": "string" },
+        "symbol": { "type": "string" },
+        "lines": { "type": "string" },
+        "as_of": { "type": "string" },
+        "state": { "enum": ["live", "lost"] }
+      }
+    },
+    "edge": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["title"],
+      "properties": {
+        "title": { "type": "string" },
+        "id": { "type": "string" },
+        "type": { "$ref": "#/$defs/conceptType" },
+        "status": { "type": "string" }
+      }
+    },
+    "citation": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["label", "url"],
+      "properties": {
+        "label": { "type": "string" },
+        "url": { "type": "string" }
+      }
+    },
+    "hit": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": [
+        "id",
+        "title",
+        "type",
+        "description",
+        "hedged",
+        "renderedRationale",
+        "anchors",
+        "edges",
+        "citations",
+        "evidence",
+        "downstream"
+      ],
+      "properties": {
+        "id": { "type": "string" },
+        "title": { "type": "string" },
+        "type": { "$ref": "#/$defs/conceptType" },
+        "status": { "type": "string" },
+        "happened_on": { "type": "string" },
+        "expired_on": { "type": "string" },
+        "confidence": { "$ref": "#/$defs/confidence" },
+        "description": {
+          "description": "The one-line rationale as written — render renderedRationale instead.",
+          "type": "string"
+        },
+        "hedged": {
+          "description": "True when confidence sits below corroborated (questions never hedge). Constrained structurally below — a payload cannot claim an unhedged inferred/speculative rationale.",
+          "type": "boolean"
+        },
+        "renderedRationale": {
+          "description": "The rationale with its mandatory hedge prefix baked in (DESIGN.md §2). Renderers display this verbatim and never re-derive hedging. Empty when there is no rationale to show.",
+          "type": "string"
+        },
+        "anchors": {
+          "description": "Anchors of this concept that cover the target (empty on warning entries).",
+          "type": "array",
+          "items": { "$ref": "#/$defs/anchor" }
+        },
+        "edges": {
+          "description": "Outgoing typed edges, grouped by relation (DESIGN.md §3).",
+          "type": "object",
+          "additionalProperties": false,
+          "required": ["becauseOf", "insteadOf", "supersededBy"],
+          "properties": {
+            "becauseOf": { "type": "array", "items": { "$ref": "#/$defs/edge" } },
+            "insteadOf": { "type": "array", "items": { "$ref": "#/$defs/edge" } },
+            "supersededBy": { "type": "array", "items": { "$ref": "#/$defs/edge" } }
+          }
+        },
+        "citations": { "type": "array", "items": { "$ref": "#/$defs/citation" } },
+        "evidence": {
+          "description": "Short citation labels (text before the first colon), deduplicated — the one-line evidence rendering.",
+          "type": "array",
+          "items": { "type": "string" }
+        },
+        "downstream": {
+          "description": "Expired constraints only: active decisions reachable via led-to — the blast radius, candidate scar tissue.",
+          "type": "array",
+          "items": { "$ref": "#/$defs/edge" }
+        }
+      },
+      "allOf": [
+        {
+          "$comment": "The §2 invariant made structural: hedged is true exactly when the concept is a non-question below corroborated, and a hedged rationale starts with a hedge prefix (or is empty when there is no rationale).",
+          "if": {
+            "anyOf": [
+              { "properties": { "type": { "const": "question" } } },
+              {
+                "required": ["confidence"],
+                "properties": { "confidence": { "enum": ["recorded", "corroborated"] } }
+              }
+            ]
+          },
+          "then": { "properties": { "hedged": { "const": false } } },
+          "else": {
+            "properties": {
+              "hedged": { "const": true },
+              "renderedRationale": { "pattern": "^$|^likely — |^speculation, thin evidence — " }
+            }
+          }
+        }
+      ]
+    },
+    "nearbyConcept": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["id", "title", "type", "anchor"],
+      "properties": {
+        "id": { "type": "string" },
+        "title": { "type": "string" },
+        "type": { "$ref": "#/$defs/conceptType" },
+        "status": { "type": "string" },
+        "anchor": { "$ref": "#/$defs/anchor" }
+      }
+    }
+  }
+}
````

````diff
diff --git a/src/anchors.ts b/src/anchors.ts
index 268d1db..b5f95ea 100644
--- a/src/anchors.ts
+++ b/src/anchors.ts
@@ -10,7 +10,7 @@ import { spawnSync } from "node:child_process";
 import { createHash } from "node:crypto";
 import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
 import { join } from "node:path";
-import type { Anchor, WhyBundle } from "./bundle.js";
+import type { Anchor, WhyBundle, WhyConcept } from "./bundle.js";
 
 export interface LineRange {
   start: number;
@@ -132,6 +132,19 @@ export function buildAnchorIndex(bundle: WhyBundle, head?: string): AnchorIndex
   return index;
 }
 
+/**
+ * Resolve an indexed concept id back to its concept. The cache key ties an
+ * index to exact bundle contents, so a miss means the caller paired an index
+ * with some other bundle.
+ */
+export function indexedConcept(bundle: WhyBundle, id: string): WhyConcept {
+  const concept = bundle.concepts.get(id);
+  if (!concept) {
+    throw new Error(`anchor index names unknown concept "${id}" — it was not built from this bundle`);
+  }
+  return concept;
+}
+
 /** Whether an indexed entry's span covers the queried span. */
 function covers(entry: IndexEntry, query: SpanQuery): boolean {
   if (entry.anchor.lines === undefined) return true; // whole-file claim
````

````diff
diff --git a/src/blame.ts b/src/blame.ts
index e3bdaeb..0c6f8e7 100644
--- a/src/blame.ts
+++ b/src/blame.ts
@@ -7,6 +7,7 @@
 import { deriveTitle, extractCitations } from "@copperbox/okf-mcp";
 import {
   buildAnchorIndex,
+  indexedConcept,
   lookupAnchors,
   parseLineRange,
   type AnchorHit,
@@ -57,6 +58,19 @@ export interface BlameEdge {
   status?: string;
 }
 
+/** Typed edges out of a story hit, grouped by relation (docs/ui-contract.md). */
+export interface BlameEdges {
+  becauseOf: BlameEdge[];
+  insteadOf: BlameEdge[];
+  supersededBy: BlameEdge[];
+}
+
+/** One `# Citations` entry: display label plus the link target. */
+export interface BlameCitation {
+  label: string;
+  url: string;
+}
+
 /** One concept in the story, fully resolved for rendering or `--json`. */
 export interface BlameBlock {
   id: string;
@@ -66,13 +80,21 @@ export interface BlameBlock {
   happened_on?: string;
   expired_on?: string;
   confidence?: Confidence;
-  /** The one-line rationale as written; the renderer adds hedges on top. */
+  /** The one-line rationale as written; `renderedRationale` is the hedged form. */
   description: string;
+  /** True when confidence sits below `corroborated` (questions never hedge). */
+  hedged: boolean;
+  /**
+   * The rationale with its mandatory hedge prefix baked in (DESIGN.md §2 made
+   * structural): renderers display this verbatim and must not re-derive
+   * hedging — a renderer that ignores `confidence` still cannot show
+   * unhedged speculation. Empty when there is no rationale to show.
+   */
+  renderedRationale: string;
   /** Anchors of this concept that cover the target (empty on warning blocks). */
   anchors: Anchor[];
-  because_of: BlameEdge[];
-  instead_of: BlameEdge[];
-  superseded_by: BlameEdge[];
+  edges: BlameEdges;
+  citations: BlameCitation[];
   /** Short citation labels — the `evidence ▸` line. */
   evidence: string[];
   /** Expired constraints only: active decisions reachable via `# Led to`. */
@@ -87,12 +109,16 @@ export interface NearbyConcept {
   anchor: Anchor;
 }
 
+/** Major version of the story payload — see docs/ui-contract.md for the policy. */
+export const STORY_SCHEMA_VERSION = 1;
+
 export interface BlameReport {
+  schemaVersion: typeof STORY_SCHEMA_VERSION;
   target: BlameTarget;
   /** Narrowest covering anchor span — the output header. */
   span?: string;
   /** Concepts anchored on the target, newest first. */
-  matches: BlameBlock[];
+  hits: BlameBlock[];
   /** Expired constraints not already matched: never invisible (DESIGN.md §7). */
   warnings: BlameBlock[];
   /** When nothing matches: anchored concepts nearest the target's directory. */
@@ -118,28 +144,60 @@ function edgesIn(bundle: WhyBundle, concept: WhyConcept, section: string): Blame
     .map((link) => edgeFrom(bundle, link));
 }
 
-/** `PR #212: replace striped locks…` reads as `PR #212` on one evidence line. */
-function citationLabels(bundle: WhyBundle, concept: WhyConcept): string[] {
+function citationsOf(bundle: WhyBundle, concept: WhyConcept): BlameCitation[] {
   const { citations } = extractCitations(concept.body, concept.path, (id) => bundle.concepts.has(id));
-  const labels = citations.map((c) => c.text.split(":")[0]!.trim()).filter((label) => label !== "");
+  return citations.map((c) => ({ label: c.text, url: c.target }));
+}
+
+/** `PR #212: replace striped locks…` reads as `PR #212` on one evidence line. */
+function evidenceLabels(citations: BlameCitation[]): string[] {
+  const labels = citations.map((c) => c.label.split(":")[0]!.trim()).filter((label) => label !== "");
   return [...new Set(labels)];
 }
 
+/**
+ * Hedging is engine logic, precomputed into the payload: anything below
+ * `corroborated` hedges, and an unstated confidence hedges hardest — the data
+ * may never hedge less than the evidence supports. Questions carry no
+ * rationale to hedge.
+ */
+function hedgePrefix(type: string, confidence: Confidence | undefined): string {
+  if (type === "question") return "";
+  switch (confidence) {
+    case "recorded":
+    case "corroborated":
+      return "";
+    case "inferred":
+      return "likely — ";
+    default:
+      return "speculation, thin evidence — ";
+  }
+}
+
 function isExpiredConstraint(type: string, status: string | undefined): boolean {
   return type === "constraint" && status === "expired";
 }
 
 function toBlock(bundle: WhyBundle, concept: WhyConcept, anchors: Anchor[]): BlameBlock {
+  const type = concept.frontmatter.type;
+  const description = oneLiner(concept);
+  const hedge = hedgePrefix(type, concept.why.confidence);
+  const citations = citationsOf(bundle, concept);
   const block: BlameBlock = {
     id: concept.id,
     title: deriveTitle(concept),
-    type: concept.frontmatter.type,
-    description: oneLiner(concept),
+    type,
+    description,
+    hedged: hedge !== "",
+    renderedRationale: description === "" ? "" : `${hedge}${description}`,
     anchors,
-    because_of: edgesIn(bundle, concept, "because of"),
-    instead_of: edgesIn(bundle, concept, "instead of"),
-    superseded_by: edgesIn(bundle, concept, "superseded by"),
-    evidence: citationLabels(bundle, concept),
+    edges: {
+      becauseOf: edgesIn(bundle, concept, "because of"),
+      insteadOf: edgesIn(bundle, concept, "instead of"),
+      supersededBy: edgesIn(bundle, concept, "superseded by"),
+    },
+    citations,
+    evidence: evidenceLabels(citations),
     downstream: [],
   };
   if (concept.why.status !== undefined) block.status = concept.why.status;
@@ -226,19 +284,14 @@ export function buildBlameReport(
     else hitsByConcept.set(hit.conceptId, [hit]);
   }
   const matched = [...hitsByConcept.entries()].map(([id, hits]) => {
-    const concept = bundle.concepts.get(id);
-    if (!concept) {
-      // The cache key ties an index to exact bundle contents; disagreeing
-      // here means the caller mixed an index with some other bundle.
-      throw new Error(`anchor index names unknown concept "${id}" — it was not built from this bundle`);
-    }
+    const concept = indexedConcept(bundle, id);
     hits.sort((a, b) => a.anchorIndex - b.anchorIndex); // anchors in written order
     return { concept, anchors: hits.map((hit) => hit.anchor) };
   });
   matched.sort((a, b) => newestFirst(a.concept, b.concept));
 
-  const matches = matched.map(({ concept, anchors }) => toBlock(bundle, concept, anchors));
-  const matchedIds = new Set(matches.map((block) => block.id));
+  const hits = matched.map(({ concept, anchors }) => toBlock(bundle, concept, anchors));
+  const matchedIds = new Set(hits.map((block) => block.id));
   const warnings = [...bundle.concepts.values()]
     .filter(
       (concept) =>
@@ -247,10 +300,10 @@ export function buildBlameReport(
     .sort(newestFirst)
     .map((concept) => toBlock(bundle, concept, []));
 
-  const report: BlameReport = { target, matches, warnings, nearby: [] };
+  const report: BlameReport = { schemaVersion: STORY_SCHEMA_VERSION, target, hits, warnings, nearby: [] };
   const span = spanOf(matched.flatMap((m) => m.anchors));
   if (span !== undefined) report.span = span;
-  if (matches.length === 0) report.nearby = nearestAnchored(bundle, target);
+  if (hits.length === 0) report.nearby = nearestAnchored(bundle, target);
   return report;
 }
 
@@ -258,30 +311,15 @@ export function buildBlameReport(
 
 const TITLE_COLUMN = 40;
 
-function glyphFor(type: string, status: string | undefined): string {
+/** Status glyph vocabulary — shared with `why export ui-index` (docs/ui-contract.md). */
+export type Glyph = "●" | "⚠" | "?";
+
+export function glyphFor(type: string, status: string | undefined): Glyph {
   if (type === "question") return "?";
   if (status === "expired" || status === "superseded") return "⚠";
   return "●";
 }
 
-/**
- * Hedging is mandatory rendering logic: anything below `corroborated` hedges,
- * and an unstated confidence hedges hardest — rendering may never hedge less
- * tha
[clipped: diff of src/blame.ts in 58dc0db — showing 8000 of 10534 chars]
````

````diff
diff --git a/src/cli.ts b/src/cli.ts
index 2e48d87..52b4062 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -21,10 +21,11 @@ import { DigError, extractEpisodes, plural, renderEpisodesReport } from "./dig.j
 import { DigStateError, withDigState, type DigRange, type DigRangeOverrides } from "./dig-state.js";
 import { buildDoctorReport, renderDoctorReport } from "./doctor.js";
 import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
+import { buildGraph, buildUiIndex, EXPORT_TARGETS, ExportError } from "./export.js";
 import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
 import { lintBundle, renderFindings } from "./lint.js";
 
-export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture"] as const;
+export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export"] as const;
 export type Command = (typeof COMMANDS)[number];
 
 /** Where a command's output goes; injectable so tests can capture it. */
@@ -56,6 +57,7 @@ export function usage(): string {
     "  dig      reconstruct decisions from git/PR history",
     "  audit    re-verify constraints; flag expired ones",
     "  capture  draft a concept from a merged PR while the why is fresh",
+    "  export   emit versioned UI-contract JSON (docs/ui-contract.md)",
     "",
     "Options:",
     "  --bundle <path>     bundle root to use instead of the nearest .why/",
@@ -76,6 +78,7 @@ export function usage(): string {
     "  --pr <n>            (capture) draft from a merged/closed PR via gh into .why/.drafts/",
     "  --commit <sha>      (capture) gh-free fallback — draft from a local commit",
     "  --promote <draft>   (capture) lint-gate a draft and move it into its type directory",
+    "  --out <file>        (export) write the payload to a file instead of stdout",
   ].join("\n");
 }
 
@@ -410,6 +413,46 @@ async function runCapture({ values, positionals, bundle, cwd, io }: CommandConte
   }
 }
 
+const EXPORT_USAGE = "usage: why export <ui-index|graph> [--out <file>]";
+
+/**
+ * `why export` — the UI data contract payloads (docs/ui-contract.md):
+ * `ui-index` (per-file coverage map from the anchor index at HEAD) and
+ * `graph` (the bundle as nodes/typed edges). The story payload is
+ * `why blame --json`.
+ */
+async function runExport({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
+  const target = positionals.length === 1 ? positionals[0] : undefined;
+  if (!isOneOf(EXPORT_TARGETS, target)) {
+    io.err(`why export: pass what to export — ${EXPORT_USAGE}`);
+    return 2;
+  }
+  try {
+    let payload: unknown;
+    if (target === "ui-index") {
+      const { index } = await loadAnchorIndex(bundle!);
+      payload = buildUiIndex(bundle!, index);
+    } else {
+      payload = buildGraph(bundle!);
+    }
+    const json = JSON.stringify(payload, null, 2);
+    if (values.out === undefined) {
+      io.out(json);
+    } else {
+      const out = resolve(cwd, values.out as string);
+      await writeFile(out, json + "\n", "utf8");
+      io.out(`wrote ${target} to ${out}`);
+    }
+    return 0;
+  } catch (e) {
+    if (e instanceof ExportError) {
+      io.err(`why export: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
 function renderCapture(result: CaptureResult, io: CliIo): number {
   io.out(`drafted ${result.type}: ${result.draftPath}`);
   io.out(`  evidence pack: ${result.evidencePath}`);
@@ -482,6 +525,11 @@ const COMMAND_SPECS: Record<Command, CommandSpec> = {
     needsBundle: true,
     run: runCapture,
   },
+  export: {
+    options: { ...BUNDLE_OPTIONS, out: { type: "string" } },
+    needsBundle: true,
+    run: runExport,
+  },
 };
 
 /** Exit codes: 0 ok, 1 operational error (e.g. no bundle), 2 usage error. */
````

````diff
diff --git a/src/export.ts b/src/export.ts
new file mode 100644
index 0000000..ee47eb7
--- /dev/null
+++ b/src/export.ts
@@ -0,0 +1,166 @@
+// `why export` — the UI data contract payloads (docs/ui-contract.md): the
+// per-file coverage map (`ui-index`) and the bundle graph, both versioned so
+// dumb renderers can consume them without re-deriving semantics. The story
+// payload is `why blame --json` (src/blame.ts); this module owns the other
+// two. Schemas live in schemas/ and are validated against real outputs in
+// test/ui-contract.test.ts.
+
+import { deriveTitle } from "@copperbox/okf-mcp";
+import { indexedConcept, type AnchorIndex, type LineRange } from "./anchors.js";
+import { glyphFor, type Glyph } from "./blame.js";
+import type { Confidence, WhyBundle } from "./bundle.js";
+
+/** An export cannot make its honesty guarantees — operational, not a bug. */
+export class ExportError extends Error {}
+
+/** Major versions of the payloads — see docs/ui-contract.md for the policy. */
+export const COVERAGE_SCHEMA_VERSION = 1;
+export const GRAPH_SCHEMA_VERSION = 1;
+
+export const EXPORT_TARGETS = ["ui-index", "graph"] as const;
+export type ExportTarget = (typeof EXPORT_TARGETS)[number];
+
+// --- Coverage (`why export ui-index`) ----------------------------------------
+
+/** One live anchor claim, resolved to the concept it paints the span for. */
+export interface CoverageSpan {
+  conceptId: string;
+  type: string;
+  status?: string;
+  confidence?: Confidence;
+  /** Status glyph — same vocabulary `why blame` renders (docs/ui-contract.md). */
+  glyph: Glyph;
+  /** Absent = a whole-file claim. */
+  lines?: LineRange;
+}
+
+export interface CoverageFile {
+  path: string;
+  /** Whole-file claims first, then ranged spans by start — overlaps possible. */
+  spans: CoverageSpan[];
+}
+
+export interface CoverageReport {
+  schemaVersion: typeof COVERAGE_SCHEMA_VERSION;
+  /** The HEAD the anchor index was computed at — compare to detect staleness. */
+  head: string;
+  files: CoverageFile[];
+}
+
+function spanOrder(a: CoverageSpan, b: CoverageSpan): number {
+  return (
+    (a.lines?.start ?? 0) - (b.lines?.start ?? 0) ||
+    (a.lines?.end ?? 0) - (b.lines?.end ?? 0) ||
+    a.conceptId.localeCompare(b.conceptId)
+  );
+}
+
+/**
+ * The per-file coverage map, from the anchor index at HEAD. Only live,
+ * parseable claims paint spans: `lost` anchors are last-known locations, not
+ * live claims, and an anchor whose `lines` value does not parse cannot
+ * verifiably cover any span (`why lint` W103 reports it) — both are excluded
+ * rather than guessed at.
+ */
+export function buildUiIndex(bundle: WhyBundle, index: AnchorIndex): CoverageReport {
+  const head = index.head;
+  if (head === undefined) {
+    throw new ExportError(
+      "ui-index carries the repo HEAD so consumers can detect staleness, and no HEAD resolved here — run inside a git repository with at least one commit",
+    );
+  }
+  const files: CoverageFile[] = [];
+  for (const [path, bucket] of index.paths) {
+    const spans: CoverageSpan[] = [];
+    for (const entry of [...bucket.wholeFile, ...bucket.intervals]) {
+      const concept = indexedConcept(bundle, entry.conceptId);
+      const span: CoverageSpan = {
+        conceptId: entry.conceptId,
+        type: concept.frontmatter.type,
+        glyph: glyphFor(concept.frontmatter.type, concept.why.status),
+      };
+      if (concept.why.status !== undefined) span.status = concept.why.status;
+      if (concept.why.confidence !== undefined) span.confidence = concept.why.confidence;
+      if (entry.range) span.lines = { start: entry.range.start, end: entry.range.end };
+      spans.push(span);
+    }
+    if (spans.length === 0) continue; // only lost/unparseable claims on this path
+    spans.sort(spanOrder);
+    files.push({ path, spans });
+  }
+  files.sort((a, b) => a.path.localeCompare(b.path));
+  return { schemaVersion: COVERAGE_SCHEMA_VERSION, head, files };
+}
+
+// --- Graph (`why export graph`) -----------------------------------------------
+
+export type GraphRelation = "becauseOf" | "insteadOf" | "supersededBy" | "ledTo";
+
+/** Edge-section heading → contract relation name (DESIGN.md §3). */
+const GRAPH_RELATIONS = new Map<string, GraphRelation>([
+  ["because of", "becauseOf"],
+  ["instead of", "insteadOf"],
+  ["superseded by", "supersededBy"],
+  ["led to", "ledTo"],
+]);
+
+export interface GraphNode {
+  id: string;
+  type: string;
+  title: string;
+  status?: string;
+  confidence?: Confidence;
+  happened_on?: string;
+}
+
+export interface GraphEdge {
+  from: string;
+  to: string;
+  relation: GraphRelation;
+}
+
+export interface GraphReport {
+  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
+  nodes: GraphNode[];
+  edges: GraphEdge[];
+}
+
+/**
+ * The bundle as nodes and typed edges, suitable for direct rendering. Only
+ * links in the four §3 edge sections become edges, and only when they resolve
+ * to a concept in the bundle — an unresolved edge link is `why lint`'s
+ * broken-link finding, not a renderable edge.
+ */
+export function buildGraph(bundle: WhyBundle): GraphReport {
+  const nodes: GraphNode[] = [...bundle.concepts.values()]
+    .map((concept) => {
+      const node: GraphNode = {
+        id: concept.id,
+        type: concept.frontmatter.type,
+        title: deriveTitle(concept),
+      };
+      if (concept.why.status !== undefined) node.status = concept.why.status;
+      if (concept.why.confidence !== undefined) node.confidence = concept.why.confidence;
+      if (concept.why.happened_on !== undefined) node.happened_on = concept.why.happened_on;
+      return node;
+    })
+    .sort((a, b) => a.id.localeCompare(b.id));
+
+  const edges: GraphEdge[] = [];
+  const seen = new Set<string>();
+  for (const concept of bundle.concepts.values()) {
+    for (const link of concept.links) {
+      const relation = link.section === undefined ? undefined : GRAPH_RELATIONS.get(link.section.toLowerCase());
+      if (relation === undefined || link.resolvedId === undefined) continue;
+      const key = `${concept.id}\u0000${relation}\u0000${link.resolvedId}`;
+      if (seen.has(key)) continue; // the same link written twice is one edge
+      seen.add(key);
+      edges.push({ from: concept.id, to: link.resolvedId, relation });
+    }
+  }
+  edges.sort(
+    (a, b) =>
+      a.from.localeCompare(b.from) || a.relation.localeCompare(b.relation) || a.to.localeCompare(b.to),
+  );
+  return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes, edges };
+}
````

````diff
diff --git a/test/blame.test.ts b/test/blame.test.ts
index b4e31a5..13a65eb 100644
--- a/test/blame.test.ts
+++ b/test/blame.test.ts
@@ -160,19 +160,50 @@ test("a lost anchor never matches — a last-known location is not a live claim"
   }
 });
 
-test("--json emits the resolved structure", async () => {
+test("--json emits the versioned story contract (docs/ui-contract.md)", async () => {
   const { code, out } = await blame(["src/lock.rs:47", ...HARBOR, "--json"]);
   assert.equal(code, 0);
   const report = JSON.parse(out);
+  assert.equal(report.schemaVersion, 1);
   assert.deepEqual(report.target, { path: "src/lock.rs", lines: { start: 47, end: 47 } });
-  assert.equal(report.matches[0].id, "decisions/queue-based-locking");
-  assert.equal(report.matches[0].because_of.length, 2);
-  assert.equal(report.matches[0].instead_of[0].title, "Striped RwLock");
+  const hit = report.hits[0];
+  assert.equal(hit.id, "decisions/queue-based-locking");
+  assert.equal(hit.edges.becauseOf.length, 2);
+  assert.equal(hit.edges.insteadOf[0].title, "Striped RwLock");
+  assert.equal(hit.hedged, false, "recorded confidence must not hedge");
+  assert.equal(hit.renderedRationale, hit.description, "unhedged rationale is the description verbatim");
+  const pr = hit.citations.find((c: { label: string }) => c.label.startsWith("PR #212"));
+  assert.ok(pr, `citations must carry label + url:\n${JSON.stringify(hit.citations)}`);
+  assert.equal(pr.url, "https://github.com/acme/harbor/pull/212");
   const acme = report.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
   assert.ok(acme, "expired constraint missing from warnings");
   assert.equal(acme.downstream[0].title, "47s request deadline");
 });
 
+test("--json precomputes hedging into the data: inferred hits carry hedged + the prefix", async () => {
+  const root = await makeBundle({
+    "decisions/hunch.md": concept({
+      type: "decision",
+      title: "Hunch",
+      description: "The cache is sized to fit one shard.",
+      confidence: "inferred",
+      anchor: "    - path: src/cache.ts\n      lines: 1-10",
+    }),
+  });
+  try {
+    const { out } = await blame(["src/cache.ts:5", "--bundle", root, "--json"]);
+    const hit = JSON.parse(out).hits[0];
+    assert.equal(hit.hedged, true, "inferred confidence must be hedged in the data");
+    assert.ok(
+      hit.renderedRationale.startsWith("likely — "),
+      `renderedRationale must carry the hedge prefix:\n${hit.renderedRationale}`,
+    );
+    assert.equal(hit.renderedRationale, "likely — The cache is sized to fit one shard.");
+  } finally {
+    await rm(root, { recursive: true, force: true });
+  }
+});
+
 test("blame without a target, or with a backwards range, is a usage error", async () => {
   const missing = await blame([...HARBOR]);
   assert.equal(missing.code, 2);
````

````diff
diff --git a/test/skills.test.ts b/test/skills.test.ts
index f606fe5..886d2cd 100644
--- a/test/skills.test.ts
+++ b/test/skills.test.ts
@@ -18,10 +18,10 @@ const SKILL_PATHS = [
   "skills/dig-synthesize/SKILL.md",
   "skills/capture/SKILL.md",
 ];
-const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md", "docs/capture.md", "docs/ci.md"];
+const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md", "docs/capture.md", "docs/ci.md", "docs/ui-contract.md"];
 
 /** `why <sub>` may only name subcommands implemented by this point in the
- * plan (all of Phases 1–4 now: audit and capture are real). */
+ * plan (Phases 1–4 plus the Phase 5 UI data contract's `export`). */
 const IMPLEMENTED_SUBCOMMANDS = new Set([
   "init",
   "lint",
@@ -31,6 +31,7 @@ const IMPLEMENTED_SUBCOMMANDS = new Set([
   "dig",
   "audit",
   "capture",
+  "export",
 ]);
 
 /** snake_case tokens in the docs that are schema fields, example symbols, or
````

````diff
diff --git a/test/ui-contract.test.ts b/test/ui-contract.test.ts
new file mode 100644
index 0000000..8cb3212
--- /dev/null
+++ b/test/ui-contract.test.ts
@@ -0,0 +1,338 @@
+// The UI data contract (issue 501, docs/ui-contract.md): the schemas in
+// schemas/ must validate the real payloads the engine emits, mutated payloads
+// must fail (the schemas actually constrain), and hedging must live in the
+// data — a renderer that ignores confidence still cannot display unhedged
+// speculation. Validation runs through ajv, an implementation independent of
+// this codebase, so a schema bug can't be masked by a matching validator bug.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { cp, readFile, rm } from "node:fs/promises";
+import { join } from "node:path";
+import { fileURLToPath } from "node:url";
+import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
+import { main } from "../src/cli.ts";
+import { capture, git, makeBundle, makeRepo, write } from "./helpers.ts";
+
+const root = fileURLToPath(new URL("..", import.meta.url));
+const HARBOR = join(root, "examples/harbor");
+
+const ajv = new Ajv2020({ allErrors: true });
+// The contract's own top-level version marker (each schema document carries
+// one), not a JSON Schema keyword — registered so ajv stays in strict mode.
+ajv.addKeyword("schemaVersion");
+
+function compile(schemaFile: string): ValidateFunction {
+  return ajv.compile(JSON.parse(readFileSync(join(root, "schemas", schemaFile), "utf8")));
+}
+
+const validateStory = compile("story.schema.json");
+const validateCoverage = compile("coverage.schema.json");
+const validateGraph = compile("graph.schema.json");
+
+function assertValid(validate: ValidateFunction, payload: unknown, label: string): void {
+  assert.ok(
+    validate(payload),
+    `${label} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}\n\npayload:\n${JSON.stringify(payload, null, 2)}`,
+  );
+}
+
+async function runJson(args: string[], cwd = root): Promise<any> {
+  const { io, out, err } = capture();
+  const code = await main(args, cwd, io);
+  assert.equal(code, 0, `why ${args.join(" ")} exited ${code}:\n${err.join("\n")}`);
+  return JSON.parse(out.join("\n"));
+}
+
+// --- story -------------------------------------------------------------------
+
+test("story: real blame --json over harbor validates, expired warning included", async () => {
+  const story = await runJson(["blame", "src/lock.rs:47", "--bundle", HARBOR, "--json"]);
+  assertValid(validateStory, story, "blame src/lock.rs:47");
+  assert.equal(story.schemaVersion, 1);
+  assert.equal(story.hits[0].id, "decisions/queue-based-locking");
+  const acme = story.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
+  assert.ok(acme, "the expired Acme constraint must warn on src/lock.rs:47");
+  assert.equal(acme.status, "expired");
+  assert.deepEqual(acme.downstream[0], {
+    title: "47s request deadline",
+    id: "decisions/47s-request-deadline",
+    type: "decision",
+    status: "active",
+  });
+});
+
+test("story: the nearest-concepts fallback for uncovered targets validates too", async () => {
+  const story = await runJson(["blame", "does/not/exist.rs", "--bundle", HARBOR, "--json"]);
+  assertValid(validateStory, story, "blame does/not/exist.rs");
+  assert.equal(story.hits.length, 0);
+  assert.ok(story.nearby.length > 0, "fallback must list nearby anchored concepts, never nothing");
+});
+
+test("hedging lives in the data: an inferred hit carries hedged + the prefix, schema-enforced", async () => {
+  const bundle = await makeBundle({
+    "decisions/hunch.md": [
+      "---",
+      "type: decision",
+      "title: Hunch",
+      "description: The cache is sized to fit one shard.",
+      "why:",
+      "  status: active",
+      "  happened_on: 2024-01-01",
+      "  confidence: inferred",
+      "  anchors:",
+      "    - path: src/cache.ts",
+      "      lines: 1-10",
+      "---",
+      "",
+      "# Hunch",
+      "",
+      "# Why",
+      "",
+      "Body.",
+    ].join("\n"),
+  });
+  try {
+    const story = await runJson(["blame", "src/cache.ts:5", "--bundle", bundle, "--json"]);
+    assertValid(validateStory, story, "inferred-hit story");
+    const hit = story.hits[0];
+    assert.equal(hit.hedged, true);
+    assert.ok(hit.renderedRationale.startsWith("likely — "), hit.renderedRationale);
+
+    // The invariant is structural, not just producer behavior: the same
+    // payload claiming an unhedged inferred rationale must fail the schema.
+    hit.hedged = false;
+    assert.equal(validateStory(story), false, "schema must reject hedged: false on an inferred hit");
+  } finally {
+    await rm(bundle, { recursive: true, force: true });
+  }
+});
+
+test("story: hand-mutated payloads fail validation", async () => {
+  const pristine = await runJson(["blame", "src/lock.rs:47", "--bundle", HARBOR, "--json"]);
+  const mutate = (change: (s: any) => void): boolean => {
+    const copy = JSON.parse(JSON.stringify(pristine));
+    change(copy);
+    return validateStory(copy) as boolean;
+  };
+  assert.equal(mutate(() => {}), true, "the unmutated payload must validate");
+  assert.equal(mutate((s) => (s.schemaVersion = 2)), false, "wrong schemaVersion");
+  assert.equal(mutate((s) => delete s.hits[0].renderedRationale), false, "missing renderedRationale");
+  assert.equal(mutate((s) => (s.hits[0].confidence = "certain")), false, "off-ladder confidence");
+  assert.equal(mutate((s) => (s.hits[0].surprise = 1)), false, "unknown key on a hit");
+  assert.equal(mutate((s) => (s.target.lines.start = 0)), false, "0-based line range");
+  assert.equal(mutate((s) => delete s.warnings), false, "missing warnings");
+});
+
+// --- coverage (`why export ui-index`) -----------------------------------------
+
+test("coverage: ui-index over a temp repo matching the harbor anchors validates", async () => {
+  const repo = await makeRepo("why-ui-index-");
+  try {
+    const line = (n: number) => `// line ${n}\n`;
+    const body = (n: number) => Array.from({ length: n }, (_, i) => line(i + 1)).join("");
+    await write(repo, "src/lock.rs", body(80));
+    await write(repo, "src/dispatch/queue.rs", body(30));
+    await write(repo, "src/server/deadline.rs", body(20));
+    await write(repo, "config/defaults.toml", body(40));
+    git(repo, "add", ".");
+    git(repo, "commit", "-q", "-m", "files matching the harbor anchors");
+    await cp(HARBOR, join(repo, ".why"), { recursive: true });
+
+    const coverage = await runJson(["export", "ui-index"], repo);
+    assertValid(validateCoverage, coverage, "ui-index");
+    assert.equal(coverage.head, git(repo, "rev-parse", "HEAD"), "head must be the temp repo's HEAD");
+
+    assert.deepEqual(
+      coverage.files.map((f: { path: string }) => f.path),
+      ["config/defaults.toml", "src/dispatch/queue.rs", "src/lock.rs", "src/server/deadline.rs"],
+      "files ordered by path",
+    );
+    const defaults = coverage.files.find((f: { path: string }) => f.path === "config/defaults.toml");
+    assert.deepEqual(defaults.spans, [
+      {
+        conceptId: "decisions/47s-request-deadline",
+        type: "decision",
+        glyph: "●",
+        status: "active",
+        confidence: "corroborated",
+        lines: { start: 22, end: 24 },
+      },
+      {
+        conceptId: "questions/why-retry-jitter-disabled",
+        type: "question",
+        glyph: "?",
+        status: "open",
+        lines: { start: 31, end: 31 },
+      },
+    ]);
+    const lock = coverage.files.find((f: { path: string }) => f.path === "src/lock.rs");
+    assert.equal(lock.spans[0].conceptId, "incidents/2024-03-lock-stall");
+    assert.equal(lock.spans[0].lines, undefined, "whole-file claims come first, without lines");
+    assert.deepEqual(lock.spans[1].lines, { start: 41, end: 58 });
+  } finally {
+    await rm(repo, { recurs
[clipped: diff of test/ui-contract.test.ts in 58dc0db — showing 8000 of 14830 chars]
````
