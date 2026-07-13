# Evidence pack: pr-28

- commits: 61a4e85
- files touched: .gitignore, DESIGN.md, docs/ui-contract.md, docs/vscode.md, package-lock.json, package.json, README.md, schemas/doctor.schema.json, schemas/files.schema.json, schemas/gitblame.schema.json, src/cli.ts, src/doctor.ts, src/serve-assets.ts, src/serve.ts, test/e2e/serve.e2e.test.ts, test/helpers.ts, test/serve-dom.test.ts, test/serve.test.ts, test/skills.test.ts, test/ui-contract.test.ts, ui/app.js, ui/graph.js, ui/story-panel.d.ts, ui/story-panel.js, ui/style.css, vscode-why/.vscodeignore, vscode-why/LICENSE, vscode-why/package-lock.json, vscode-why/package.json, vscode-why/README.md, vscode-why/src/core/cli-locate.ts, vscode-why/src/core/contract.ts, vscode-why/src/core/decorations.ts, vscode-why/src/core/hover.ts, vscode-why/src/core/story-html.ts, vscode-why/src/extension.ts, vscode-why/test-integration/run.ts, vscode-why/test-integration/suite.ts, vscode-why/test/cli-locate.test.ts, vscode-why/test/contract.test.ts, vscode-why/test/decorations.test.ts, vscode-why/test/fixtures/coverage.json, vscode-why/test/fixtures/story.json, vscode-why/test/hover.test.ts, vscode-why/test/story-html.test.ts, vscode-why/tsconfig.build.json, vscode-why/tsconfig.json
- references: PR #28

## Commits

### commit 61a4e85

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-12

Why UI surfaces: local serve UI and VS Code extension (#28)

* RALPH: why serve — standalone local UI: blame gutter + story panel + graph (issue #21 / issues/502, DESIGN.md §8, PLAN.md Phase 5)

The flagship visual: git blame and why blame side by side in the browser,
localhost-only, read-only, self-contained. The server is deliberately thin —
every endpoint wraps the same library call the CLI makes (buildUiIndex,
buildBlameReport, buildGraph, buildDoctorReport); the SPA is a dumb renderer
over UI-contract payloads only.

Key decisions:
- The UI needed three payloads the contract lacked, so the contract was
  extended first (per the issue's rule): schemas/{files,gitblame,doctor}
  .schema.json + docs/ui-contract.md sections/examples. gitblame serves file
  content AT HEAD (git blame --porcelain HEAD), not the working tree, so line
  numbers agree with coverage computed at the same HEAD — both payloads carry
  head so a consumer can prove it. The doctor summary pre-renders each finding
  to the same display line the CLI prints (formatters now shared in doctor.ts
  as ITEM_TEXT), so the renderer carries no health semantics that could drift.
- Read-only is enforced, not promised: non-GET → 405, the anchor index loads
  with write:false (no .cache is ever created — pinned byte-level in a test:
  clean git status AND no .why/.cache after exercising every endpoint).
- Assets: ui/{app,story-panel,graph}.js + style.css bundled by esbuild
  (dependency, exact-pinned) into in-memory JS/CSS at server start — always in
  sync with ui/ whether running from src/ (tsx) or dist/, nothing written to
  disk, no external URLs (self-containment test scans every built asset for
  http(s)://). esbuild was already in the tree transitively via tsx.
- Bundle-backed endpoints reload the bundle per request: an edit or a new HEAD
  shows on refresh, never a silently stale story; file view auto-refreshes
  coverage when blame.head moves past coverage.head.
- Hedging/warnings stay data: the story panel displays renderedRationale
  verbatim and derives only the documented glyph vocabulary; expired
  constraints render loud (EXPIRED badge, red card, scar-tissue downstream
  lines); gutter stripes color by confidence with distinct expired/question
  treatments per docs/ui-contract.md.
- DOM tests run without a browser: jsdom renders the story panel from real
  engine output (schema-validated fixture; asserts the "likely — " hedge
  prefix and the expired warning in the DOM), and a full-SPA smoke evals the
  actual esbuild bundle in jsdom against the live server (tree → gutter →
  click line 47 → story with the Acme warning).
- Browser tier is optional by design: npm run test:e2e (playwright, skips
  itself when playwright is absent) — verified it fails fast, not hangs, when
  chromium lacks system libs; this sandbox cannot run chromium (no root for
  install-deps), matching the issue's "CI must pass without a display".
- Manual check: `npm run why -- serve` on this repo's own .why/ starts and
  serves /, /app.js, and all six endpoints without error (doctor: 9 concepts,
  0 red) — note for the PR body.

Files: src/serve.ts, src/serve-assets.ts (new), ui/ (new: app.js,
story-panel.js + .d.ts, graph.js, style.css), schemas/ (+3),
docs/ui-contract.md, src/doctor.ts (buildDoctorSummary + shared ITEM_TEXT),
src/cli.ts (serve command, --port), test/serve.test.ts (15),
test/serve-dom.test.ts (2), test/e2e/serve.e2e.test.ts (optional tier),
test/ui-contract.test.ts (6 doc examples), test/skills.test.ts (+serve),
package.json (esbuild dep; jsdom, @types/jsdom dev; test:e2e; ui in files),
README.md Status. npm run verify: 239/239.

Notes for next iteration: the VS Code extension (issue 503) can consume the
same six payloads; if it wants doctor chips it should reuse
buildDoctorSummary rather than the raw DoctorReport.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* refactor: share the harbor-repo serve fixture via test/helpers.ts

The endpoint suite and the optional e2e browser test built the same
harbor-anchored temp repo with ~18 duplicated lines each; extract it as
makeHarborRepo(prefix) so the fixture (and its .cache-exclusion caveat)
lives in one place.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* RALPH: VS Code extension — why annotations inline, GitLens-style (issue #22 / issues/503, phase:6)

New vscode-why/ package: a pure UI-contract consumer that shells out to the
why CLI (export ui-index, blame --json) with the workspace root as cwd and
renders — zero engine logic in extension code.

Key decisions:
- Workspace isolation is structural: vscode-why/ has its own package.json /
  tsconfig / lockfile, is outside the root tsconfig include and the npm files
  whitelist, is not an npm workspace (so the release step's root `npm version`
  never touches it), and its unit tests import nothing from its node_modules —
  root verify runs them through the root tsx (`test:vscode`) and passes with
  vscode-why/node_modules absent (verified by renaming it away).
- All rendering semantics live in src/core/ (no vscode import, plain node):
  cli-locate (discovery order node_modules/.bin → PATH → why.cliPath setting;
  missing CLI → one non-modal notice per session), contract (v1 parsers; a
  newer schemaVersion is said out loud per the contract, never guessed),
  decorations (per-line treatment mirrors ui/app.js stripeClass — expired >
  question > first span's confidence; ranges clipped to the open buffer so no
  mark paints past a shorter working tree), hover (warning cards FIRST,
  renderedRationale verbatim — hedge prefix arrives in the data), story-html
  (webview doc themed via --vscode-* vars only). extension.ts is wiring:
  ThemeColor-token stripes + overview ruler, hover provider gated on covered
  lines, why: Show Story webview, debounced refresh on save/.why/**/.git/HEAD.
- Staleness: stalenessNote(coverageHead, currentHead) notes "as of <short>"
  whenever HEAD differs OR cannot be resolved — unverifiable is never fresh.
- Show Story judged trade (issue asked): reusing ui/story-panel.js would copy
  a file across the package boundary into the .vsix at build time — a
  silent-drift path; shipped a ~100-line HTML renderer over the same v1
  contract instead, ordered like the hovers (warnings first), fully escaped.
- Fixtures are copies of docs/ui-contract.md's validated examples; a unit
  test deep-equals them against the doc when run inside this repo, so the
  fixtures cannot drift silently. Sanity-ran the real pipeline end-to-end:
  parsers + hover over `why export ui-index` / `why blame --json` on a
  makeHarborRepo temp repo — lock.rs:47 hover shows the expired-Acme warning
  first with the scar-tissue line; defaults.toml:31 the open question.
- Integration test (@vscode/test-electron, no mocha) exists behind
  vscode-why's `npm run test:integration` — needs a display + network
  (xvfb in CI later), NOT part of any verify. `npm run package` (vsce
  package --no-dependencies) produces vscode-why/vscode-why-0.1.0.vsix
  (11 files) — verified in this sandbox.

Files: vscode-why/ (new: package.json, tsconfigs, .vscodeignore, LICENSE,
README, src/extension.ts, src/core/{cli-locate,contract,decorations,hover,
story-html}.ts, test/ 29 unit tests + fixtures, test-integration/),
docs/vscode.md (new: install-from-vsix + manual QA script incl. expected
lock.rs/defaults.toml hovers), package.json (test:vscode; verify runs it),
.gitignore, test/skills.test.ts (docs/vscode.md joins DOC_PATHS;
node_modules allowlisted as a non-tool token), README.md Status.
Root npm run verify: 268/268 (239 root + 29 extension), also green without
vscode-why/node_modules.

Notes for next iteration: hovers shell one `why blame` per line (cached until
refresh) — if that's slow on big bundles, a bulk story endpoint or reusing
the coverage span as the cache key would cut calls; xvfb CI wiring for
test:integration is future work.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* chore(release): v0.8.0 (minor)

* gate remediation: amend DESIGN.md §8 for serve; warnings-first story panel

- DESIGN.md §8: add serve to the CLI enumeration, describe both UI
  surfaces as dumb renderers of the ui-contract payloads, and qualify
  the no-daemon bullet (serve is an optional foreground localhost
  viewer; nothing in the pipeline depends on it).
- ui/story-panel.js: render expired-upstream warning cards before hit
  cards, matching the VS Code hover/webview order so both surfaces
  tell the same story.
- tests: serve-dom asserts the warning card precedes the hit card;
  the serve boot test asserts the first card is the warning.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

---------

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>

## Pull requests

### PR #28 — Why UI surfaces: local serve UI and VS Code extension

by @dantheuber

<!-- sandcastle-feature: {"slug":"ui-surfaces","branch":"sandcastle/feature-ui-surfaces","members":[{"id":"21","title":"`why serve` — standalone local UI: blame gutter + story panel + graph"},{"id":"22","title":"VS Code extension: why annotations inline, GitLens-style"}]} -->

**Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.

### Issues in this feature
- [x] #21 `why serve` — standalone local UI: blame gutter + story panel + graph
- [x] #22 VS Code extension: why annotations inline, GitLens-style

### Release
`v0.8.0` (minor bump)

### Summary
## What & why

Adds two new ways to consume `why` bundles beyond the CLI:

1. **`why serve`** — a standalone, localhost-only web UI showing git blame and why-blame side by side, with a story panel and constraint graph.
2. **VS Code extension (`vscode-why/`)** — inline why annotations GitLens-style: gutter stripes by confidence, hover cards, and a "Show Story" webview.

Both are pure consumers of the UI contract — no engine logic duplicated into either surface.

## Changes

**UI contract & schemas**
- Extended `docs/ui-contract.md` and added `schemas/{files,gitblame,doctor}.schema.json` to cover file content, git blame, and doctor summary payloads.
- `doctor.ts` now exposes a shared `buildDoctorSummary`/`ITEM_TEXT` so CLI and UI render identical findings text.

**`why serve` (src/serve.ts, src/serve-assets.ts, ui/)**
- Thin HTTP server wrapping existing library calls (`buildUiIndex`, `buildBlameReport`, `buildGraph`, `buildDoctorReport`); six endpoints, non-GET rejected with 405.
- Strictly read-only: no `.cache` is ever written (verified byte-level in tests).
- `gitblame` payload is served at HEAD so line numbers match coverage computed at the same HEAD.
- Assets (`ui/app.js`, `story-panel.js`, `graph.js`, `style.css`) bundled in-memory via esbuild at server start; self-containment test scans for any external URLs.
- Bundle reloads per request so edits/new HEAD show on refresh without staleness.

**VS Code extension (`vscode-why/`)**
- New standalone package: own `package.json`/tsconfig/lockfile, not an npm workspace member, excluded from root tsconfig/npm files — root `npm version` and publish never touch it.
- Shells out to the `why` CLI (`export ui-index`, `blame --json`); zero engine logic lives in the extension.
- Rendering logic isolated in `src/core/` (no `vscode` import): CLI discovery, contract parsing (schema-version aware), decoration mapping, hover cards (warnings first), story HTML rendering.
- Staleness always noted when HEAD differs from coverage HEAD or can't be resolved.
- Docs at `docs/vscode.md` (install-from-vsix + manual QA script).

**Misc**
- `test/helpers.ts`: extracted shared `makeHarborRepo` fixture used by both the serve endpoint suite and the optional e2e browser test.

## Review notes

- Worth double-checking the workspace-isolation setup for `vscode-why/` (`.gitignore`, root `package.json` `files` whitelist, tsconfig `include` exclusion) — this is what keeps the root release/publish flow from touching the extension package.
- `test:vscode` runs extension unit tests through the root `tsx` rather than the extension's own toolchain; confirms it works even with `vscode-why/node_modules` absent.
- Browser/integration tiers (`test:e2e`, `vscode-why`'s `test:integration`) are optional and skip themselves without a display/deps — not part of `npm run verify`.
- Test status: root `npm run verify` reported 268/268 (239 root + 29 extension) at the last commit before this bump; version bump commit itself changes no code.

Closes #21
Closes #22

Comments:

- **dantheuber** (2026-07-13):
  <!-- gatekeeper round:1 verdict:request-changes -->
  ## Gatekeeper — round 1: request-changes
  
  This PR delivers both UI surfaces to a high standard: `why serve` is a genuinely thin, provably read-only localhost server (endpoints wrap the same library calls the CLI uses; the read-only test asserts a byte-identical tree and no cache write), the SPA is self-contained esbuild-bundled assets with a no-http(s)-references test, the DOM/jsdom smoke tests assert the hedge prefix and loud expired-constraint warning, and the VS Code extension isolates all logic in electron-free src/core/ with substantive unit tests (discovery order, contract parsing with forward-version refusal, decoration clipping, staleness, warning-first hovers, webview escaping). I verified beyond the green verify: started `why serve` against this repo's own .why/ (every endpoint 200, doctor healthy) and ran `vsce package` in vscode-why/ (clean .vsix, 11 files), and confirmed root verify passed with vscode-why/node_modules absent. It fails on one merge-blocking repo contract: DESIGN.md §8 still enumerates nine subcommands and states 'No daemon. Everything is a run-to-completion command suitable for CI' — `why serve` is a tenth subcommand that blocks until Ctrl-C, the PR's own README edit says 'all ten subcommands', and DESIGN.md is untouched. .sandcastle/CODING_STANDARDS.md's project invariants say a deviation must change DESIGN.md in the same diff with reasoning, and precedent (PR #27 amended §8 when adding `export`) confirms the practice. One remediation round to amend DESIGN.md (plus an optional cross-surface ordering alignment) and this merges.
  
  1. DESIGN.md §8 ('Implementation shape') is not amended by this PR and now contradicts the shipped behavior twice: (1) the CLI enumeration `why dig | anchor | audit | blame | capture | lint | doctor | export | init` omits `serve` while README.md (edited in this PR) says 'all ten subcommands', and (2) the bullet '**No daemon.** Everything is a run-to-completion command suitable for CI' is false as written — `why serve` (src/serve.ts, src/cli.ts runServe) blocks until the server closes. Per .sandcastle/CODING_STANDARDS.md project invariant 'DESIGN.md is the contract... the PR must change DESIGN.md in the same diff with the reasoning, or it is wrong' (and precedent: PR #27 amended §8 when adding `export`). Correct looks like: add `serve` to the §8 CLI list, describe the two UI surfaces (`why serve` local read-only UI and the vscode-why/ extension) as dumb renderers of the docs/ui-contract.md payloads, and qualify the no-daemon bullet (e.g. 'no resident process is ever required — `why serve` is an optional, foreground, localhost-only viewer the user starts and stops; nothing in the pipeline depends on it').
  2. ui/story-panel.js:111-112 renders hits before warnings, while both VS Code surfaces render the expired-upstream warning FIRST (vscode-why/src/core/hover.ts:613 `[...story.warnings, ...story.hits]`, story-html.ts whose header comment says 'ordered like the hovers... so both surfaces tell the same story'). For the harbor lock.rs:47 story the serve panel shows the Acme expired warning below the queue-based-locking hit, the extension above it — the same story told in opposite orders across surfaces, and warnings-last undercuts issue #21's 'expired-upstream warnings visually loud'. Correct looks like: in renderStoryPanel, append warning cards before hit cards, and extend test/serve-dom.test.ts to assert the warning card precedes the hit card in the DOM (compare positions via compareDocumentPosition or child order).
- **dantheuber** (2026-07-13):
  <!-- gatekeeper round:2 verdict:merge -->
  ## Gatekeeper — round 2: merge
  
  PR #28 delivers both UI surfaces as pure consumers of the versioned UI contract: `why serve` (thin read-only 127.0.0.1 HTTP server wrapping the same library calls the CLI uses, six schema-valid JSON endpoints, self-contained esbuild-bundled SPA with blame gutter, warnings-first story panel, canvas graph, and doctor chips) and a `vscode-why/` extension (CLI shell-out only, theme-token decorations, hedge-verbatim hovers with expired-upstream warnings first, staleness notes, isolated packaging). Every acceptance criterion of issues #21 and #22 is met by identifiable code and tests that would fail if the behavior broke; DESIGN.md is amended in the same diff for the no-daemon exception. Beyond the green verify, I independently confirmed the three claims the verify run cannot prove: `why serve` on this repo's own bundle serves every endpoint with 200s, root `test:vscode` passes 29/29 with `vscode-why/node_modules` removed, and `vsce package --no-dependencies` produces the documented .vsix.
  
  Verified with `npm run verify` on the branch before merging.


## Diffs

### diff of commit 61a4e85

````diff
diff --git a/.gitignore b/.gitignore
index aa3d2b3..dbab563 100644
--- a/.gitignore
+++ b/.gitignore
@@ -1,4 +1,7 @@
 node_modules/
 dist/
 *.log
+*.vsix
+vscode-why/out/
+vscode-why/.vscode-test/
 .sandcastle/.env
\ No newline at end of file
````

````diff
diff --git a/DESIGN.md b/DESIGN.md
index 7a46bab..9efd1ca 100644
--- a/DESIGN.md
+++ b/DESIGN.md
@@ -175,9 +175,10 @@ Same data over MCP: agents mount the bundle via okf-mcp and get story-of-this-co
 ## 8. Implementation shape
 
 - **Language:** TypeScript (Node), matching okf-mcp; depends on okf-mcp as a library where possible rather than shelling out.
-- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | export | init`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
+- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | export | init | serve`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
+- **UI surfaces:** two, both dumb renderers of the contract payloads with zero engine logic of their own. `why serve` is a read-only, localhost-only viewer (blame gutter, story panel, graph) whose endpoints wrap the same library calls the CLI uses; the `vscode-why/` extension shells out to the `why` CLI and renders coverage decorations, hovers, and story webviews from the same JSON. If either surface needs data the contract lacks, the contract is extended first.
 - **Agent integration:** dig/audit agent prompts ship as Claude Code skills in `skills/`; the CLI's `--episodes`/`--evidence` subcommands are the deterministic tools those skills call.
-- **No daemon.** Everything is a run-to-completion command suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly).
+- **No daemon.** No resident process is ever required: the pipeline is run-to-completion commands suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly). `why serve` is the one deliberate exception — an optional, foreground, localhost-only viewer the user starts and stops by hand; nothing in the pipeline depends on it.
 
 ## Open problems
````

````diff
diff --git a/README.md b/README.md
index bf3109f..3eb3257 100644
--- a/README.md
+++ b/README.md
@@ -103,7 +103,7 @@ npx -y @copperbox/okf-mcp --bundle why=.why inspect
 
 ## Status
 
-Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all nine subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>/.cache/` keyed by bundle contents + repo HEAD — the cache directory ignores itself via its own `.gitignore`, so `why init` needs no gitignore handling and existing bundles get the same behavior. `why lint` works: it delegates OKF conformance to okf-mcp and enforces the `why`-schema layer above it (DESIGN.md §2 vocab tables, required sections, edge-target types, status/section consistency) as stable `W###` rules — human-readable by default or `--json`, exit 1 on any error-severity finding. `why anchor` works: it re-resolves every anchor claim against HEAD (symbol-first, then blame-trace, then honestly `lost` — never a guess) and rewrites only the `why.anchors` frontmatter entries, leaving every other byte of the concept untouched; `--check` is the CI mode (resolve, write nothing, exit 1 on drift) and `--concept <id>` scopes a run. It currently carries its own minimal internal resolvers; standalone, more capable resolvers now exist alongside it and are next in line to replace them behind the same seam — a blame-trace resolver ([src/trace-range.ts](src/trace-range.ts)) that traces an anchored line range from its as-of commit to HEAD, or proves it `lost`, and a symbol resolver ([src/find-symbol.ts](src/find-symbol.ts)) that finds a named symbol at HEAD (tree-sitter WASM grammars for TypeScript/JavaScript, Rust, Python and Go; a lower-confidence line-regex heuristic elsewhere), following a symbol into another file only when git history connects it to the anchored one, and answering `ambiguous` rather than guessing between duplicate declarations. The anchor resolver's survival rate is measured by a torture harness ([test/torture/](test/torture/README.md)) that replays a repo's history commit by commit through the real `why anchor` command and fails on any silently-wrong anchor — `npm run test:torture` runs the built-in scenario, and it can be pointed at a real repo with seeded anchors. `why doctor` works: a read-only bundle health report — lost anchors and lint errors are red (exit 1); stale `as_of`s, overdue `review-by` constraints, `status: unknown` and expired constraints, and open questions (age-sorted) are yellow (exit 0) — human-readable by default or `--json`; it now also opens with a dig-freshness line (commits since the last dig on the current branch). `why dig --episodes` works — the deterministic half of archaeology (DESIGN.md §6 step 1): it walks git history (high-water mark → HEAD when `<bundle>/.dig-state.json` carries one; full history otherwise), clusters commits into episodes (merge/PR boundaries first, then same-author/<48h/file-overlap clustering for direct commits), and flags tells — reverts, fix-chains, sudden churn on old-quiet files, comment tells — per episode and in a global summary; `--json` or `--out <file>` emit a stable, documented JSON report ([docs/dig-episodes.md](docs/dig-episodes.md)). `why dig --evidence <episodes.json>` works: it assembles one deterministic evidence pack per episode — full commit messages, PR/issue threads via `gh` (degrading to explicit `[unavailable: …]` markers when there's no remote or no `gh`), local exported context via `--evidence-dir`, and per-file-clipped diffs under a `--max-chars` budget with `[clipped: …]` markers naming what was cut — packs land in the self-ignoring `<bundle>/.cache/evidence/` by default; format documented in [docs/dig-evidence.md](docs/dig-evidence.md). The judgment half of the dig pipeline ships as Claude Code skills, not code: [skills/dig/SKILL.md](skills/dig/SKILL.md) (per-episode reconstruction — schema contract, the verbatim confidence ladder, cite-everything, prefer-`question`-over-`speculative`, update-don't-duplicate) and [skills/dig-synthesize/SKILL.md](skills/dig-synthesize/SKILL.md) (cross-episode merge/supersede/promote pass ending in clean `lint` + `doctor`), with the end-to-end runbook — the era-chunked cold-start order and a dry walkthrough of the harbor story included — in [docs/digging.md](docs/digging.md). Incremental dig state is in place ([src/dig-state.ts](src/dig-state.ts)): `.why/.dig-state.json` holds a per-branch high-water mark, advanced atomically only after a successful episode emission and safe to delete (re-dig everything; synthesis dedupes), with `--from <rev>`/`--full` honored as range overrides by `why dig --episodes`. `why audit` works — the DESIGN.md §5 payoff: it sweeps every `active` constraint, running `verify.method: check` commands (confined to the repo directory, with a timeout and captured output), exporting `method: ask` items as an agent questionnaire (`--questions-out`; the CLI never calls an LLM — apply the filled-in answers with `--answers`), and flagging overdue `review_by` dates; a failed check or a no-longer-true answer flips the constraint to `status: expired` (frontmatter patch + evidence appended to `# Still true?`, the rest of the file byte-for-byte intact), walks `# Because of` edges backwards, and files a `question` concept for every still-active decision downstream unless an open question already links the pair — human report or `--json`, exit 1 whenever anything newly expired (the CI signal that the archive learned something). Constraints already expired before the run stay report-only: their downstream candidacy is listed, never re-flagged. `why capture` works — merge-time capture, the steady state that eventually makes digging rare (DESIGN.md open problem #5): `--pr <n>` assembles a merged/closed PR's evidence via `gh` (reusing the dig evidence module) and emits a draft concept into `.why/.drafts/` — type guessed from merge-vs-close (`decision`/`attempt`), `happened_on` from the merge time, anchors derived per hunk from the merge commit's zero-context diff, citations to the PR, and rationale candidates quoted verbatim with attribution, alongside an evidence-pack sidecar; `--commit <sha>` is the gh-free fallback. Drafts live in a dot-directory precisely so okf-mcp never serves them, and leave it only through the lint-gated editorial step `why capture --promote <draft>` (errors roll the write back and keep the draft). The judgment step ships as a third skill, [skills/capture/SKILL.md](skills/capture/SKILL.md), and the post-merge CI recipe is [docs/capture.md](docs/capture.md). `why export` works — the UI data contract (DESIGN.md §7's consumers): `why blame --json` now emits the versioned story payload (hits with edges grouped by relation, citations as label + url, and hedging precomputed into the data as `hedged` + `renderedRationale`, so a renderer that ignores confidence still cannot display unhedged speculation), `why export ui-index` emits the per-file coverage map from the anchor index at HEAD (stamped with the resolved sha so consumers detect staleness), and `why export graph` emits the bundle as nodes/typed edges — all three validated against the JSON Schemas in [schemas/](schemas/) on every test run and documented with examples, the versioning policy, and renderer guidance in [docs/ui-contract.md](docs/ui-contract.md).
+Early implementation. The sc
[clipped: diff of README.md in 61a4e85 — showing 8000 of 17429 chars]
````

````diff
diff --git a/docs/ui-contract.md b/docs/ui-contract.md
index 329880b..cdf9fc6 100644
--- a/docs/ui-contract.md
+++ b/docs/ui-contract.md
@@ -1,19 +1,30 @@
 # The UI data contract
 
-Every `why` UI — the local web UI (issue 502) and the VS Code extension
-(issue 503) — is a *dumb renderer* over the three versioned JSON payloads
+Every `why` UI — the local web UI (`why serve`, issue 502) and the VS Code
+extension (issue 503) — is a *dumb renderer* over the versioned JSON payloads
 documented here. Anchor resolution, confidence semantics, and hedging stay in
 the engine; a presentation layer contains no logic that could drift from
 DESIGN.md. The schemas are JSON Schema (draft 2020-12) documents in
 [schemas/](../schemas/), and [test/ui-contract.test.ts](../test/ui-contract.test.ts)
-validates the engine's real outputs (and this document's examples) against
-them on every run.
+and [test/serve.test.ts](../test/serve.test.ts) validate the engine's real
+outputs (and this document's examples) against them on every run.
+
+The three core payloads carry the bundle's semantics:
+
+| Payload | Produced by | Schema |
+|---|---|---|
+| story | `why blame <target> --json`; `GET /api/story` | [schemas/story.schema.json](../schemas/story.schema.json) |
+| coverage | `why export ui-index [--out <file>]`; `GET /api/coverage` | [schemas/coverage.schema.json](../schemas/coverage.schema.json) |
+| graph | `why export graph [--out <file>]`; `GET /api/graph` | [schemas/graph.schema.json](../schemas/graph.schema.json) |
+
+Three more are served only by `why serve` — the repo-side data (git's half of
+the blame gutter) and the health summary its header renders:
 
 | Payload | Produced by | Schema |
 |---|---|---|
-| story | `why blame <target> --json` | [schemas/story.schema.json](../schemas/story.schema.json) |
-| coverage | `why export ui-index [--out <file>]` | [schemas/coverage.schema.json](../schemas/coverage.schema.json) |
-| graph | `why export graph [--out <file>]` | [schemas/graph.schema.json](../schemas/graph.schema.json) |
+| files | `GET /api/files` | [schemas/files.schema.json](../schemas/files.schema.json) |
+| gitblame | `GET /api/blame?path=…` | [schemas/gitblame.schema.json](../schemas/gitblame.schema.json) |
+| doctor summary | `GET /api/doctor` | [schemas/doctor.schema.json](../schemas/doctor.schema.json) |
 
 ## Versioning policy
 
@@ -274,3 +285,84 @@ Example ([examples/harbor](../examples/harbor/), abbreviated):
   ]
 }
 ```
+
+## Files — `GET /api/files` (`why serve`)
+
+Every tracked file at HEAD (`git ls-files`), in git's order, for the file-tree
+sidebar. Untracked files are invisible on purpose: coverage and blame are
+computed at HEAD, so a file git does not know about has no story to show.
+
+```json
+{
+  "schemaVersion": 1,
+  "files": ["config/defaults.toml", "src/dispatch/queue.rs", "src/lock.rs"]
+}
+```
+
+## Git blame — `GET /api/blame?path=…` (`why serve`)
+
+Git's half of the blame gutter: one entry per line of the file **at HEAD**
+(`git blame --porcelain`), carrying the last-touching commit, its author,
+author date, and summary, plus the line's content. Serving HEAD content rather
+than the working tree keeps line numbers agreeing with the coverage payload,
+which is computed at the same HEAD — the payload's `head` lets a consumer
+verify that. Uncommitted edits are simply not there yet, the same honesty
+`why export ui-index` applies.
+
+```json
+{
+  "schemaVersion": 1,
+  "path": "src/lock.rs",
+  "head": "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c",
+  "lines": [
+    {
+      "sha": "a3f9c2e10b7d3f0c2f4f4b0d9a1e6c5b4a392817",
+      "author": "Priya N",
+      "date": "2024-03-14",
+      "summary": "replace striped locks with command queue",
+      "text": "pub fn acquire(&self, shard: ShardId) -> Ticket {"
+    }
+  ]
+}
+```
+
+## Doctor summary — `GET /api/doctor` (`why serve`)
+
+The `why doctor` health report summarized for the UI header's chips and a
+plain list view: overall red/yellow counts plus all seven sections in the
+CLI's render order, each item pre-rendered to the same display line the CLI
+prints. Keeping the strings in the data means the renderer carries no health
+semantics that could drift from doctor's. A section whose check could not run
+carries `skipped` with the reason — never a silent zero.
+
+```json
+{
+  "schemaVersion": 1,
+  "healthy": true,
+  "head": "8b7d3f0",
+  "concepts": 6,
+  "red": 0,
+  "yellow": 2,
+  "sections": [
+    { "key": "lostAnchors", "title": "lost anchors", "severity": "red", "count": 0, "items": [] },
+    { "key": "staleAsOf", "title": "stale as_of", "severity": "yellow", "count": 0, "items": [] },
+    { "key": "reviewByPastDue", "title": "review-by past due", "severity": "yellow", "count": 0, "items": [] },
+    { "key": "unknownConstraints", "title": "constraints with status unknown", "severity": "yellow", "count": 0, "items": [] },
+    {
+      "key": "expiredConstraints",
+      "title": "expired constraints",
+      "severity": "yellow",
+      "count": 1,
+      "items": ["constraints/acme-45s-timeout  expired_on 2025-06-30"]
+    },
+    {
+      "key": "openQuestions",
+      "title": "open questions",
+      "severity": "yellow",
+      "count": 1,
+      "items": ["questions/why-retry-jitter-disabled  open since 2025-11-02"]
+    },
+    { "key": "lintErrors", "title": "lint errors", "severity": "red", "count": 0, "items": [] }
+  ]
+}
+```
````

````diff
diff --git a/docs/vscode.md b/docs/vscode.md
new file mode 100644
index 0000000..ba29478
--- /dev/null
+++ b/docs/vscode.md
@@ -0,0 +1,129 @@
+# The VS Code extension (`vscode-why/`)
+
+Inline why annotations, GitLens-style: gutter-side stripes per covered span
+and hover cards with the recorded rationale, at the moment someone is about
+to edit the code. The extension is a *pure contract consumer* — it shells out
+to the `why` CLI (`why export ui-index` for coverage, `why blame --json` for
+stories) with the workspace root as cwd and renders the versioned payloads
+from [docs/ui-contract.md](ui-contract.md). Zero engine logic lives in
+extension code: hedging, glyphs, confidence, and blast radii all arrive
+precomputed in the data.
+
+## Building the .vsix
+
+```
+cd vscode-why
+npm install
+npm run verify     # typecheck + unit tests (plain node:test — no display needed)
+npm run package    # tsc build + vsce package --no-dependencies
+```
+
+`npm run package` writes `vscode-why/vscode-why-<version>.vsix` — that path is
+the build artifact. Nothing is published anywhere; the extension is excluded
+from the root npm package (the `files` whitelist covers only `dist` and `ui`)
+and from the release version-bump automation (the release step runs
+`npm version` against the root `package.json` only; `vscode-why/` is not an
+npm workspace and versions independently).
+
+The extension-host integration test exists but is **not** part of any verify:
+
+```
+cd vscode-why
+npm run test:integration
+```
+
+It downloads VS Code via `@vscode/test-electron` and therefore needs network
+access and a display server (`xvfb-run npm run test:integration` in CI). The
+default `npm run verify` — root and `vscode-why/` — stays green in a sandbox.
+
+## Installing from the .vsix
+
+Either through the UI — Extensions view → `…` menu → *Install from VSIX…* —
+or from a terminal:
+
+```
+code --install-extension vscode-why/vscode-why-0.1.0.vsix
+```
+
+The extension activates in any workspace containing a `.why/` directory. The
+`why` CLI is located in order: the workspace's `node_modules/.bin`, then PATH,
+then the `why.cliPath` setting. If none resolves you get one non-modal info
+message per session, then silence until the next session.
+
+## Manual QA script
+
+Build a throwaway repo whose fabricated sources match the harbor bundle's
+anchors (the same fixture shape the serve tests use), with this checkout's
+CLI on PATH via an npm link into the temp repo:
+
+```bash
+WHY_REPO="$PWD"                      # this checkout
+QA=$(mktemp -d /tmp/why-vscode-qa.XXXX)
+cd "$QA"
+git init -q
+mkdir -p src/dispatch src/server config
+for i in $(seq 1 80); do echo "// line $i"; done > src/lock.rs
+for i in $(seq 1 30); do echo "// line $i"; done > src/dispatch/queue.rs
+for i in $(seq 1 20); do echo "// line $i"; done > src/server/deadline.rs
+for i in $(seq 1 40); do echo "// line $i"; done > config/defaults.toml
+cp -r "$WHY_REPO/examples/harbor" .why
+rm -rf .why/.cache
+git add . && git commit -qm "files matching the harbor anchors"
+(cd "$WHY_REPO" && npm run build) && npm install --no-save "$WHY_REPO"
+code "$QA"
+```
+
+Then walk this checklist:
+
+1. **Activation + decorations.** Open `src/lock.rs`. Every line carries a
+   subtle colored stripe (the whole-file anchor of
+   `incidents/2024-03-lock-stall` covers the file); the colors come from your
+   theme, not fixed hex. The overview ruler shows the same marks.
+2. **Hover on `src/lock.rs` line 47** (inside the 41–58 span of
+   `decisions/queue-based-locking`). The card list shows, in order:
+   - **first**, the expired-upstream warning: `⚠` glyph, *Acme 45s gateway
+     timeout*, an **EXPIRED 2025-06-30** badge, the verbatim rationale
+     ("AcmeCorp's API gateway killed any request exceeding 45 seconds…"),
+     the scar-tissue line *→ downstream decision "47s request deadline" may
+     now be scar tissue.*, and the Issue #612 citation link;
+   - then `●` *Queue-based locking* — `decision` · active · `recorded` —
+     with its rationale rendered verbatim (no hedge: confidence is
+     `recorded`) and the PR #212 citation link;
+   - then `●` *2024-03 lock stall* — `incident` · resolved — from the
+     whole-file anchor.
+3. **Hover on `config/defaults.toml` line 23** (inside 22–24): `●` *47s
+   request deadline* — `decision` · active · `corroborated`, rationale
+   verbatim, citations to commit 51be07d and Issue #143. The same expired-Acme
+   warning card renders first here too — the 47s deadline is its blast radius.
+4. **Hover on `config/defaults.toml` line 31**: `?` *Why is retry jitter
+   disabled?* — an open `question`, no confidence badge, no rationale — an
+   honest gap, not a guess.
+5. **Hover on an uncovered line** (e.g. `config/defaults.toml` line 5):
+   no why hover at all.
+6. **`why: Show Story`.** Put the cursor on `src/lock.rs:47`, run the command
+   from the editor context menu (and once from the palette). A side panel
+   opens with the same cards in the same order, themed like your editor;
+   citation links open in the browser.
+7. **Staleness.** Commit anything (`git commit --allow-empty -qm tick`), then
+   hover line 47 again *without* running `why: Refresh` — within a moment the
+   `.git/HEAD` watcher re-exports coverage; if you instead edit
+   `.why/` timestamps away or point `why.cliPath` at a stale checkout, hovers
+   append a muted *as of `<short-sha>`* note rather than hiding data.
+8. **Refresh.** Delete `.why/decisions/queue-based-locking.md`, save any
+   file (or run `why: Refresh`): the 41–58 stripes drop to the whole-file
+   incident coloring only. Restore the file; they return.
+9. **CLI missing.** Remove the linked CLI (`npm uninstall --no-save
+   @copperbox/why`) and reload the window: exactly one info message ("why:
+   CLI not found…"), then silence — no repeated toasts on hover or save.
+
+## Testing layout
+
+- `vscode-why/test/*.test.ts` — plain `node:test` units, no electron, no
+  display: CLI discovery order, contract parsing against fixture JSON (copies
+  of the ui-contract doc examples, drift-checked against the doc when run
+  inside this repo), decoration-set computation, staleness-note logic, hover
+  markdown (hedge prefix, warning-first ordering), story webview HTML. The
+  root `npm run verify` runs these too, through the root `tsx` — they need
+  no `vscode-why/node_modules`.
+- `vscode-why/test-integration/` — the `@vscode/test-electron` host test
+  behind `npm run test:integration` (display + network required; see above).
````

````diff
diff --git a/package-lock.json b/package-lock.json
index cb00a58..4d14500 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,15 +1,16 @@
 {
   "name": "@copperbox/why",
-  "version": "0.7.0",
+  "version": "0.8.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "@copperbox/why",
-      "version": "0.7.0",
+      "version": "0.8.0",
       "license": "MIT",
       "dependencies": {
         "@copperbox/okf-mcp": "^0.19.1",
+        "esbuild": "0.28.1",
         "tree-sitter-wasms": "0.1.13",
         "web-tree-sitter": "0.24.7"
       },
@@ -18,8 +19,10 @@
       },
       "devDependencies": {
         "@copperbox/sandcastle-workflow": "^0.4.2",
+        "@types/jsdom": "^28.0.3",
         "@types/node": "^22.10.0",
         "ajv": "^8.20.0",
+        "jsdom": "^29.1.1",
         "tsx": "^4.19.0",
         "typescript": "^5.7.0",
         "yaml": "^2.9.0"
@@ -50,6 +53,70 @@
         }
       }
     },
+    "node_modules/@asamuzakjp/css-color": {
+      "version": "5.1.11",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/css-color/-/css-color-5.1.11.tgz",
+      "integrity": "sha512-KVw6qIiCTUQhByfTd78h2yD1/00waTmm9uy/R7Ck/ctUyAPj+AEDLkQIdJW0T8+qGgj3j5bpNKK7Q3G+LedJWg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@asamuzakjp/generational-cache": "^1.0.1",
+        "@csstools/css-calc": "^3.2.0",
+        "@csstools/css-color-parser": "^4.1.0",
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
+    "node_modules/@asamuzakjp/dom-selector": {
+      "version": "7.1.1",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/dom-selector/-/dom-selector-7.1.1.tgz",
+      "integrity": "sha512-67RZDnYRc8H/8MLDgQCDE//zoqVFwajkepHZgmXrbwybzXOEwOWGPYGmALYl9J2DOLfFPPs6kKCqmbzV895hTQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@asamuzakjp/generational-cache": "^1.0.1",
+        "@asamuzakjp/nwsapi": "^2.3.9",
+        "bidi-js": "^1.0.3",
+        "css-tree": "^3.2.1",
+        "is-potential-custom-element-name": "^1.0.1"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
+    "node_modules/@asamuzakjp/generational-cache": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/generational-cache/-/generational-cache-1.0.1.tgz",
+      "integrity": "sha512-wajfB8KqzMCN2KGNFdLkReeHncd0AslUSrvHVvvYWuU8ghncRJoA50kT3zP9MVL0+9g4/67H+cdvBskj9THPzg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
+    "node_modules/@asamuzakjp/nwsapi": {
+      "version": "2.3.9",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/nwsapi/-/nwsapi-2.3.9.tgz",
+      "integrity": "sha512-n8GuYSrI9bF7FFZ/SjhwevlHc8xaVlb/7HmHelnc/PZXBD2ZR49NnN9sMMuDdEGPeeRQ5d0hqlSlEpgCX3Wl0Q==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@bramus/specificity": {
+      "version": "2.4.2",
+      "resolved": "https://registry.npmjs.org/@bramus/specificity/-/specificity-2.4.2.tgz",
+      "integrity": "sha512-ctxtJ/eA+t+6q2++vj5j7FYX3nRu311q1wfYH3xjlLOsczhlhxAg2FWNUXhpGvAw3BWo1xBcvOV6/YLc2r5FJw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "css-tree": "^3.0.0"
+      },
+      "bin": {
+        "specificity": "bin/cli.js"
+      }
+    },
     "node_modules/@clack/core": {
       "version": "1.4.3",
       "resolved": "https://registry.npmjs.org/@clack/core/-/core-1.4.3.tgz",
@@ -123,6 +190,146 @@
         "node": ">=20"
       }
     },
+    "node_modules/@csstools/color-helpers": {
+      "version": "6.1.0",
+      "resolved": "https://registry.npmjs.org/@csstools/color-helpers/-/color-helpers-6.1.0.tgz",
+      "integrity": "sha512-064IFJdjTfUqnjpCVpMOdbr8FLQBhinbZj6yRv2An2E41O/pLEXqfFRWqGq/SxlE5PEUYTlvWsG2r8MswAVvkg==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT-0",
+      "engines": {
+        "node": ">=20.19.0"
+      }
+    },
+    "node_modules/@csstools/css-calc": {
+      "version": "3.2.1",
+      "resolved": "https://registry.npmjs.org/@csstools/css-calc/-/css-calc-3.2.1.tgz",
+      "integrity": "sha512-DtdHlgXh5ZkA43cwBcAm+huzgJiwx3ZTWVjBs94kwz2xKqSimDA3lBgCjphYgwgVUMWatSM0pDd8TILB1yrVVg==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/@csstools/css-color-parser": {
+      "version": "4.1.9",
+      "resolved": "https://registry.npmjs.org/@csstools/css-color-parser/-/css-color-parser-4.1.9.tgz",
+      "integrity": "sha512-paQcIaOO53Rk5+YrBaBjm/SgrV4INImjo2BT1DtQRYr+XeTRbeAYlS+jxXp9drqvKmtFnWRJKIalDLhZZDu42A==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@csstools/color-helpers": "^6.1.0",
+        "@csstools/css-calc": "^3.2.1"
+      },
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/@csstools/css-parser-algorithms": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/@csstools/css-parser-algorithms/-/css-parser-algorithms-4.0.0.tgz",
+      "integrity": "sha512-+B87qS7fIG3L5h3qwJ/IFbjoVoOe/bpOdh9hAjXbvx0o8ImEmUsGXN0inFOnk2ChCFgqkkGFQ+TpM5rbhkKe4w==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/@csstools/css-syntax-patches-for-csstree": {
+      "version": "1.1.6",
+      "resolved": "https://registry.npmjs.org/@csstools/css-syntax-patches-for-csstree/-/css-syntax-patches-for-csstree-1.1.6.tgz",
+      "integrity": "sha512-TcJCWFbXLPpJYq6z7bfOyjWYJDiDg2/I4gyUC9pqPNqHFRIey0EB0q0L5cSnQDfWJg8Jd6VadakxdIez/3zkqQ==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT-0",
+      "peerDependencies": {
+        "css-tree": "^3.2.1"
+      },
+      "peerDependenciesMeta": {
+        "css-tree": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/@csstools/css-tokenizer": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/@csstools/css-tokenizer/-/css-tokenizer-4.0.0.tgz",
+      "integrity": "sha512-QxULHAm7cNu72w97JUNCBFODFaXpbDg+dP8b/oWFAZ2MTRppA3U00Y2L1HqaS4J6yBqxwa/Y3n
[clipped: diff of package-lock.json in 61a4e85 — showing 8000 of 31089 chars]
````

````diff
diff --git a/package.json b/package.json
index e5ccbb6..dd214b5 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@copperbox/why",
-  "version": "0.7.0",
+  "version": "0.8.0",
   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
   "type": "module",
   "license": "MIT",
@@ -8,14 +8,17 @@
     "why": "dist/cli.js"
   },
   "files": [
-    "dist"
+    "dist",
+    "ui"
   ],
   "scripts": {
     "why": "tsx src/cli.ts",
     "typecheck": "tsc --noEmit",
     "test": "tsx --test test/*.test.ts",
     "test:torture": "tsx --test test/torture/torture.test.ts",
-    "verify": "npm run typecheck && npm run test",
+    "test:e2e": "tsx --test test/e2e/*.e2e.test.ts",
+    "test:vscode": "tsx --test vscode-why/test/*.test.ts",
+    "verify": "npm run typecheck && npm run test && npm run test:vscode",
     "build": "tsc -p tsconfig.build.json",
     "sandcastle": "tsx .sandcastle/main.mts",
     "sandcastle:loop": "scripts/sandcastle-loop.sh",
@@ -24,14 +27,17 @@
   },
   "devDependencies": {
     "@copperbox/sandcastle-workflow": "^0.4.2",
+    "@types/jsdom": "^28.0.3",
     "@types/node": "^22.10.0",
     "ajv": "^8.20.0",
+    "jsdom": "^29.1.1",
     "tsx": "^4.19.0",
     "typescript": "^5.7.0",
     "yaml": "^2.9.0"
   },
   "dependencies": {
     "@copperbox/okf-mcp": "^0.19.1",
+    "esbuild": "0.28.1",
     "tree-sitter-wasms": "0.1.13",
     "web-tree-sitter": "0.24.7"
   }
````

````diff
diff --git a/schemas/doctor.schema.json b/schemas/doctor.schema.json
new file mode 100644
index 0000000..b060b13
--- /dev/null
+++ b/schemas/doctor.schema.json
@@ -0,0 +1,61 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/doctor.schema.json",
+  "title": "why doctor summary (serve)",
+  "description": "Payload of `why serve`'s GET /api/doctor: the bundle health report summarized for header chips and a plain list view. Items are pre-rendered display strings — the same lines the `why doctor` CLI prints — so a renderer carries no health semantics. docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "healthy", "head", "concepts", "red", "yellow", "sections"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "healthy": {
+      "description": "No red findings — mirrors the CLI's exit-0 condition.",
+      "type": "boolean"
+    },
+    "head": {
+      "description": "Short sha the as_of checks ran against; null when there is no enclosing repo.",
+      "type": ["string", "null"]
+    },
+    "concepts": { "type": "integer", "minimum": 0 },
+    "red": { "type": "integer", "minimum": 0 },
+    "yellow": { "type": "integer", "minimum": 0 },
+    "sections": {
+      "description": "All seven doctor sections, in the CLI's render order.",
+      "type": "array",
+      "items": { "$ref": "#/$defs/section" }
+    }
+  },
+  "$defs": {
+    "section": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["key", "title", "severity", "count", "items"],
+      "properties": {
+        "key": {
+          "enum": [
+            "lostAnchors",
+            "staleAsOf",
+            "reviewByPastDue",
+            "unknownConstraints",
+            "expiredConstraints",
+            "openQuestions",
+            "lintErrors"
+          ]
+        },
+        "title": { "type": "string" },
+        "severity": { "enum": ["red", "yellow"] },
+        "count": { "type": "integer", "minimum": 0 },
+        "items": {
+          "description": "One pre-rendered display line per finding.",
+          "type": "array",
+          "items": { "type": "string" }
+        },
+        "skipped": {
+          "description": "Present only when the check could not run (e.g. as_of freshness outside a git repo) — say so, never silently zero.",
+          "type": "string"
+        }
+      }
+    }
+  }
+}
````

````diff
diff --git a/schemas/files.schema.json b/schemas/files.schema.json
new file mode 100644
index 0000000..ae9a611
--- /dev/null
+++ b/schemas/files.schema.json
@@ -0,0 +1,18 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/files.schema.json",
+  "title": "why files (serve)",
+  "description": "Payload of `why serve`'s GET /api/files: every tracked file at HEAD (`git ls-files`), ordered as git lists them, for the file-tree sidebar. docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "files"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "files": {
+      "description": "Repo-relative paths of tracked files.",
+      "type": "array",
+      "items": { "type": "string", "minLength": 1 }
+    }
+  }
+}
````

````diff
diff --git a/schemas/gitblame.schema.json b/schemas/gitblame.schema.json
new file mode 100644
index 0000000..7f1afa5
--- /dev/null
+++ b/schemas/gitblame.schema.json
@@ -0,0 +1,52 @@
+{
+  "$schema": "https://json-schema.org/draft/2020-12/schema",
+  "$id": "https://github.com/copperbox/why/schemas/gitblame.schema.json",
+  "title": "why gitblame (serve)",
+  "description": "Payload of `why serve`'s GET /api/blame?path=…: one entry per line of the file at HEAD, from `git blame --porcelain` — the git half of the blame gutter. Content is the file at HEAD (not the working tree), so line numbers agree with the coverage payload computed at the same HEAD. docs/ui-contract.md annotates this schema.",
+  "schemaVersion": 1,
+  "type": "object",
+  "additionalProperties": false,
+  "required": ["schemaVersion", "path", "head", "lines"],
+  "properties": {
+    "schemaVersion": { "const": 1 },
+    "path": { "type": "string", "minLength": 1 },
+    "head": {
+      "description": "Full sha of the HEAD the blame ran at — compare to the coverage payload's head to detect drift.",
+      "type": "string",
+      "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
+    },
+    "lines": {
+      "description": "One entry per file line, in file order (1-based implicitly by position).",
+      "type": "array",
+      "items": { "$ref": "#/$defs/line" }
+    }
+  },
+  "$defs": {
+    "line": {
+      "type": "object",
+      "additionalProperties": false,
+      "required": ["sha", "author", "date", "summary", "text"],
+      "properties": {
+        "sha": {
+          "description": "Full sha of the commit that last touched this line.",
+          "type": "string",
+          "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
+        },
+        "author": { "type": "string" },
+        "date": {
+          "description": "Author date, YYYY-MM-DD in the author's timezone.",
+          "type": "string",
+          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
+        },
+        "summary": {
+          "description": "First line of the commit message.",
+          "type": "string"
+        },
+        "text": {
+          "description": "The line's content at HEAD, without its trailing newline.",
+          "type": "string"
+        }
+      }
+    }
+  }
+}
````

````diff
diff --git a/src/cli.ts b/src/cli.ts
index 52b4062..5f5e4ef 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -24,8 +24,10 @@ import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
 import { buildGraph, buildUiIndex, EXPORT_TARGETS, ExportError } from "./export.js";
 import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
 import { lintBundle, renderFindings } from "./lint.js";
+import { ServeError, startWhyServer } from "./serve.js";
+import { AssetError } from "./serve-assets.js";
 
-export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export"] as const;
+export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export", "serve"] as const;
 export type Command = (typeof COMMANDS)[number];
 
 /** Where a command's output goes; injectable so tests can capture it. */
@@ -58,6 +60,7 @@ export function usage(): string {
     "  audit    re-verify constraints; flag expired ones",
     "  capture  draft a concept from a merged PR while the why is fresh",
     "  export   emit versioned UI-contract JSON (docs/ui-contract.md)",
+    "  serve    browse blame gutter, stories, and graph in a local read-only UI",
     "",
     "Options:",
     "  --bundle <path>     bundle root to use instead of the nearest .why/",
@@ -79,6 +82,7 @@ export function usage(): string {
     "  --commit <sha>      (capture) gh-free fallback — draft from a local commit",
     "  --promote <draft>   (capture) lint-gate a draft and move it into its type directory",
     "  --out <file>        (export) write the payload to a file instead of stdout",
+    "  --port <n>          (serve) port to bind on 127.0.0.1 (default: a random free port)",
   ].join("\n");
 }
 
@@ -453,6 +457,40 @@ async function runExport({ values, positionals, bundle, cwd, io }: CommandContex
   }
 }
 
+/**
+ * `why serve` — the standalone local UI (DESIGN.md §8, issue 502). Localhost
+ * only, read-only, self-contained assets; blocks until the server closes
+ * (Ctrl-C). Endpoints are thin wrappers over the same library calls the other
+ * subcommands make.
+ */
+async function runServe({ values, positionals, bundle, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err("why serve: takes no positional arguments — usage: why serve [--port <n>]");
+    return 2;
+  }
+  let port = 0;
+  if (values.port !== undefined) {
+    port = Number(values.port);
+    if (!Number.isInteger(port) || port < 1 || port > 65535) {
+      io.err(`why serve: --port must be a port number (1-65535), got "${values.port}"`);
+      return 2;
+    }
+  }
+  try {
+    const running = await startWhyServer(bundle!.root, { port });
+    io.out(`why serve: ${running.url}`);
+    io.out(`  bundle ${bundle!.root} — read-only, 127.0.0.1 only; Ctrl-C to stop`);
+    await new Promise<void>((resolve) => running.server.once("close", resolve));
+    return 0;
+  } catch (e) {
+    if (e instanceof ServeError || e instanceof AssetError) {
+      io.err(`why serve: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
 function renderCapture(result: CaptureResult, io: CliIo): number {
   io.out(`drafted ${result.type}: ${result.draftPath}`);
   io.out(`  evidence pack: ${result.evidencePath}`);
@@ -530,6 +568,11 @@ const COMMAND_SPECS: Record<Command, CommandSpec> = {
     needsBundle: true,
     run: runExport,
   },
+  serve: {
+    options: { ...BUNDLE_OPTIONS, port: { type: "string" } },
+    needsBundle: true,
+    run: runServe,
+  },
 };
 
 /** Exit codes: 0 ok, 1 operational error (e.g. no bundle), 2 usage error. */
````

````diff
diff --git a/src/doctor.ts b/src/doctor.ts
index d1d5a75..88225e8 100644
--- a/src/doctor.ts
+++ b/src/doctor.ts
@@ -262,6 +262,85 @@ const STALE_NOTES: Record<StaleReason, string> = {
   unresolved: "does not resolve in this repository",
 };
 
+/** One display line per finding — shared by the CLI renderer and the serve
+ * summary (schemas/doctor.schema.json), so the two surfaces cannot drift. */
+const ITEM_TEXT = {
+  lostAnchors: (i: AnchorItem) =>
+    `${i.concept}  ${anchorSpan(i)} (last known${i.as_of === undefined ? "" : `, as_of ${i.as_of}`})`,
+  staleAsOf: (i: StaleAsOfItem) => `${i.concept}  ${anchorSpan(i)} — as_of ${i.as_of} ${STALE_NOTES[i.reason]}`,
+  reviewByPastDue: (i: ReviewByItem) => `${i.concept}  review_by ${i.review_by}`,
+  unknownConstraints: (i: ConstraintItem) => i.concept,
+  expiredConstraints: (i: ConstraintItem) =>
+    `${i.concept}  expired_on ${i.expired_on ?? "(unrecorded — see why lint W402)"}`,
+  openQuestions: (i: QuestionItem) => `${i.concept}  open since ${i.happened_on ?? "(undated)"}`,
+  lintErrors: (i: Finding) => `${i.file}  ${i.rule}  ${i.message}`,
+} as const;
+
+export type DoctorSectionKey = keyof typeof ITEM_TEXT;
+
+/** Major version of the serve summary payload — policy in docs/ui-contract.md. */
+export const DOCTOR_SUMMARY_SCHEMA_VERSION = 1;
+
+export interface DoctorSummarySection {
+  key: DoctorSectionKey;
+  title: string;
+  severity: DoctorSeverity;
+  count: number;
+  /** Pre-rendered display lines — the same text the CLI prints per finding. */
+  items: string[];
+  skipped?: string;
+}
+
+/** The `GET /api/doctor` payload (schemas/doctor.schema.json). */
+export interface DoctorSummary {
+  schemaVersion: typeof DOCTOR_SUMMARY_SCHEMA_VERSION;
+  healthy: boolean;
+  head: string | null;
+  concepts: number;
+  red: number;
+  yellow: number;
+  /** All seven sections, in the CLI's render order. */
+  sections: DoctorSummarySection[];
+}
+
+function summarizeSection<Key extends DoctorSectionKey>(
+  key: Key,
+  sec: DoctorReport["sections"][Key],
+): DoctorSummarySection {
+  const items = sec.items.map((item) => (ITEM_TEXT[key] as (i: typeof item) => string)(item));
+  const summary: DoctorSummarySection = {
+    key,
+    title: sec.title,
+    severity: sec.severity,
+    count: sec.count,
+    items,
+  };
+  if (sec.skipped !== undefined) summary.skipped = sec.skipped;
+  return summary;
+}
+
+/** Flatten a report into the UI-contract summary `why serve` emits. */
+export function buildDoctorSummary(report: DoctorReport): DoctorSummary {
+  const s = report.sections;
+  return {
+    schemaVersion: DOCTOR_SUMMARY_SCHEMA_VERSION,
+    healthy: report.healthy,
+    head: report.head,
+    concepts: report.concepts,
+    red: report.red,
+    yellow: report.yellow,
+    sections: [
+      summarizeSection("lostAnchors", s.lostAnchors),
+      summarizeSection("staleAsOf", s.staleAsOf),
+      summarizeSection("reviewByPastDue", s.reviewByPastDue),
+      summarizeSection("unknownConstraints", s.unknownConstraints),
+      summarizeSection("expiredConstraints", s.expiredConstraints),
+      summarizeSection("openQuestions", s.openQuestions),
+      summarizeSection("lintErrors", s.lintErrors),
+    ],
+  };
+}
+
 const TITLE_WIDTH = 31; // the longest section title
 
 function pushSection<Item>(
@@ -295,17 +374,13 @@ export function renderDoctorReport(report: DoctorReport): string[] {
   lines.push(digStateLine(report.digState));
   lines.push("");
   const s = report.sections;
-  pushSection(lines, s.lostAnchors, (i) =>
-    `${i.concept}  ${anchorSpan(i)} (last known${i.as_of === undefined ? "" : `, as_of ${i.as_of}`})`,
-  );
-  pushSection(lines, s.staleAsOf, (i) => `${i.concept}  ${anchorSpan(i)} — as_of ${i.as_of} ${STALE_NOTES[i.reason]}`);
-  pushSection(lines, s.reviewByPastDue, (i) => `${i.concept}  review_by ${i.review_by}`);
-  pushSection(lines, s.unknownConstraints, (i) => i.concept);
-  pushSection(lines, s.expiredConstraints, (i) =>
-    `${i.concept}  expired_on ${i.expired_on ?? "(unrecorded — see why lint W402)"}`,
-  );
-  pushSection(lines, s.openQuestions, (i) => `${i.concept}  open since ${i.happened_on ?? "(undated)"}`);
-  pushSection(lines, s.lintErrors, (i) => `${i.file}  ${i.rule}  ${i.message}`);
+  pushSection(lines, s.lostAnchors, ITEM_TEXT.lostAnchors);
+  pushSection(lines, s.staleAsOf, ITEM_TEXT.staleAsOf);
+  pushSection(lines, s.reviewByPastDue, ITEM_TEXT.reviewByPastDue);
+  pushSection(lines, s.unknownConstraints, ITEM_TEXT.unknownConstraints);
+  pushSection(lines, s.expiredConstraints, ITEM_TEXT.expiredConstraints);
+  pushSection(lines, s.openQuestions, ITEM_TEXT.openQuestions);
+  pushSection(lines, s.lintErrors, ITEM_TEXT.lintErrors);
   lines.push("");
   const total = report.red + report.yellow;
   if (total === 0) {
````

````diff
diff --git a/src/serve-assets.ts b/src/serve-assets.ts
new file mode 100644
index 0000000..aa0cee6
--- /dev/null
+++ b/src/serve-assets.ts
@@ -0,0 +1,63 @@
+// The `why serve` SPA assets: ui/ sources bundled by esbuild into one JS and
+// one CSS artifact, held in memory and served from there — the okf-mcp
+// `graph html` philosophy (embedded assets, zero CDN/network). Building when
+// the server starts (rather than at package build) keeps the assets exactly
+// in sync with ui/ whether the CLI runs from src/ via tsx or from dist/, and
+// test/serve.test.ts pins the self-containment guarantee: no http(s)://
+// reference may appear in any built asset.
+
+import { join } from "node:path";
+import { fileURLToPath } from "node:url";
+import { build } from "esbuild";
+
+/** The UI could not be bundled — operational, not a bug in the bundle. */
+export class AssetError extends Error {}
+
+export interface UiAssets {
+  html: string;
+  js: string;
+  css: string;
+}
+
+// src/ and dist/ both sit one level below the package root, so this resolves
+// from either layout.
+const UI_DIR = fileURLToPath(new URL("../ui/", import.meta.url));
+
+/** The page shell; app.js builds the whole UI into #app. */
+const PAGE = `<!doctype html>
+<html lang="en">
+<head>
+<meta charset="utf-8">
+<meta name="viewport" content="width=device-width, initial-scale=1">
+<title>why</title>
+<link rel="stylesheet" href="app.css">
+</head>
+<body>
+<div id="app"></div>
+<script src="app.js" defer></script>
+</body>
+</html>
+`;
+
+/** Bundle ui/ into self-contained in-memory assets. */
+export async function buildUiAssets(): Promise<UiAssets> {
+  const result = await build({
+    entryPoints: [join(UI_DIR, "app.js"), join(UI_DIR, "style.css")],
+    bundle: true,
+    minify: true,
+    write: false,
+    format: "iife",
+    outdir: UI_DIR, // never written — write: false; only names the outputs
+    logLevel: "silent",
+  });
+  let js = "";
+  let css = "";
+  for (const file of result.outputFiles) {
+    if (file.path.endsWith(".js")) js = file.text;
+    else if (file.path.endsWith(".css")) css = file.text;
+  }
+  if (js === "" || css === "") {
+    throw new AssetError("esbuild produced no JS/CSS output for ui/ — the package's ui/ directory is missing or empty");
+  }
+  return { html: PAGE, js, css };
+}
````

````diff
diff --git a/src/serve.ts b/src/serve.ts
new file mode 100644
index 0000000..b2f6c7c
--- /dev/null
+++ b/src/serve.ts
@@ -0,0 +1,290 @@
+// `why serve` (issue 502): a localhost-only, read-only window onto the bundle
+// — git blame and why blame side by side. The server is deliberately thin:
+// every endpoint wraps the same library function the CLI uses (buildUiIndex,
+// buildBlameReport, buildGraph, buildDoctorReport) and emits a payload from
+// the UI data contract (docs/ui-contract.md); the SPA is a dumb renderer over
+// those payloads. No endpoint mutates the bundle or the repo: the anchor
+// index is loaded with `write: false`, git calls are read-only plumbing, and
+// non-GET methods are refused outright.
+
+import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
+import type { AddressInfo } from "node:net";
+import { dirname } from "node:path";
+import { loadAnchorIndex } from "./anchors.js";
+import { BlameTargetError, buildBlameReport, normalizePath, type BlameTarget } from "./blame.js";
+import { loadBundle } from "./bundle.js";
+import { buildDoctorReport, buildDoctorSummary } from "./doctor.js";
+import { buildGraph, buildUiIndex, ExportError } from "./export.js";
+import { git } from "./git.js";
+import { buildUiAssets, type UiAssets } from "./serve-assets.js";
+
+/** A request or the server cannot be served honestly; carries the HTTP status. */
+export class ServeError extends Error {
+  readonly httpStatus: number;
+  constructor(message: string, httpStatus = 500) {
+    super(message);
+    this.httpStatus = httpStatus;
+  }
+}
+
+/** Major versions of the serve-only payloads — policy in docs/ui-contract.md. */
+export const FILES_SCHEMA_VERSION = 1;
+export const GITBLAME_SCHEMA_VERSION = 1;
+
+/** `GET /api/files` (schemas/files.schema.json). */
+export interface FilesReport {
+  schemaVersion: typeof FILES_SCHEMA_VERSION;
+  files: string[];
+}
+
+export interface GitBlameLine {
+  /** Full sha of the commit that last touched this line. */
+  sha: string;
+  author: string;
+  /** Author date, YYYY-MM-DD in the author's timezone. */
+  date: string;
+  /** First line of the commit message. */
+  summary: string;
+  /** The line's content at HEAD, without its newline. */
+  text: string;
+}
+
+/** `GET /api/blame?path=…` (schemas/gitblame.schema.json). */
+export interface GitBlameReport {
+  schemaVersion: typeof GITBLAME_SCHEMA_VERSION;
+  path: string;
+  /** Full sha the blame ran at — the coverage payload carries the same. */
+  head: string;
+  lines: GitBlameLine[];
+}
+
+/** Every tracked file at HEAD. Untracked files have no story to show. */
+export function buildFileList(repo: string): FilesReport {
+  const result = git(repo, ["ls-files", "-z"]);
+  if (result.status !== 0) {
+    throw new ServeError(`git ls-files failed in ${repo}: ${result.stderr.trim()}`);
+  }
+  return {
+    schemaVersion: FILES_SCHEMA_VERSION,
+    files: result.stdout.split("\0").filter((path) => path !== ""),
+  };
+}
+
+/** Author epoch + `+HHMM`-style zone → the author's local calendar date. */
+function isoDate(epochSeconds: number, tz: string): string {
+  const match = /^([+-])(\d{2})(\d{2})$/.exec(tz);
+  const offset = match
+    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60)
+    : 0;
+  return new Date((epochSeconds + offset) * 1000).toISOString().slice(0, 10);
+}
+
+interface BlameCommit {
+  author: string;
+  time: number;
+  tz: string;
+  summary: string;
+}
+
+/**
+ * `git blame --porcelain HEAD` for one file, parsed to one entry per line in
+ * file order. Blaming HEAD (not the working tree) keeps line numbers agreeing
+ * with the coverage payload computed at the same HEAD.
+ */
+export function buildGitBlame(repo: string, path: string): GitBlameReport {
+  const head = git(repo, ["rev-parse", "HEAD"]);
+  if (head.status !== 0) {
+    throw new ServeError("no resolvable HEAD — serve blame inside a git repository with at least one commit");
+  }
+  const blame = git(repo, ["blame", "--porcelain", "HEAD", "--", path]);
+  if (blame.status !== 0) {
+    throw new ServeError(`git blame HEAD -- ${path}: ${blame.stderr.trim()}`, 404);
+  }
+  // Porcelain interleaves commit headers, metadata (only on a commit's first
+  // appearance), and tab-prefixed content lines, already in file order.
+  const commits = new Map<string, BlameCommit>();
+  const lines: GitBlameLine[] = [];
+  let sha = "";
+  for (const raw of blame.stdout.split("\n")) {
+    if (raw.startsWith("\t")) {
+      const commit = commits.get(sha);
+      if (commit === undefined) {
+        throw new ServeError(`git blame emitted a content line before any commit header for ${path}`);
+      }
+      lines.push({
+        sha,
+        author: commit.author,
+        date: isoDate(commit.time, commit.tz),
+        summary: commit.summary,
+        text: raw.slice(1),
+      });
+      continue;
+    }
+    const header = /^([0-9a-f]{40,64}) \d+ \d+/.exec(raw);
+    if (header) {
+      sha = header[1]!;
+      if (!commits.has(sha)) commits.set(sha, { author: "", time: 0, tz: "", summary: "" });
+      continue;
+    }
+    const commit = commits.get(sha);
+    if (commit === undefined) continue; // preamble before the first header
+    if (raw.startsWith("author ")) commit.author = raw.slice("author ".length);
+    else if (raw.startsWith("author-time ")) commit.time = Number(raw.slice("author-time ".length));
+    else if (raw.startsWith("author-tz ")) commit.tz = raw.slice("author-tz ".length);
+    else if (raw.startsWith("summary ")) commit.summary = raw.slice("summary ".length);
+  }
+  return { schemaVersion: GITBLAME_SCHEMA_VERSION, path, head: head.stdout.trim(), lines };
+}
+
+// --- HTTP server ---------------------------------------------------------------
+
+/** Localhost only — remote access is out of scope by design, not by option. */
+const HOST = "127.0.0.1";
+
+export interface ServeOptions {
+  /** Port to bind on 127.0.0.1; default 0 = a random free port. */
+  port?: number;
+}
+
+export interface RunningWhyServer {
+  server: Server;
+  port: number;
+  url: string;
+  close(): Promise<void>;
+}
+
+function sendJson(res: ServerResponse, status: number, payload: unknown): void {
+  res.writeHead(status, {
+    "content-type": "application/json; charset=utf-8",
+    "cache-control": "no-store",
+  });
+  res.end(`${JSON.stringify(payload, null, 2)}\n`);
+}
+
+function sendAsset(res: ServerResponse, contentType: string, body: string): void {
+  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
+  res.end(body);
+}
+
+function requiredParam(url: URL, name: string): string {
+  const value = url.searchParams.get(name);
+  if (value === null || value === "") {
+    throw new ServeError(`missing required query parameter "${name}"`, 400);
+  }
+  return value;
+}
+
+/** `path` (+ optional 1-based `start`/`end`) → the story target span. */
+function storyTarget(url: URL): BlameTarget {
+  const target: BlameTarget = { path: normalizePath(requiredParam(url, "path")) };
+  const start = url.searchParams.get("start");
+  const end = url.searchParams.get("end") ?? start;
+  if (start === null) return target;
+  const lines = { start: Number(start), end: Number(end) };
+  if (
+    !Number.isInteger(lines.start) ||
+    !Number.isInteger(lines.end) ||
+    lines.start < 1 ||
+    lines.end < lines.start
+  ) {
+    throw new ServeError(`"start"/"end" must be a 1-based low-high line range, got ${start}-${end}`, 400);
+  }
+  target.lines = lines;
+  return target;
+}
+
+/**
+ * The JSON API. Bundle-backed endpoints reload the bundle per request, so a
+ * concept edit or a new HEAD shows on the next refresh instead of serving a
+ * silently stale story; `write: false` keeps the index read-only on disk.
+ */
+async function apiPayload(bundleRoot: string, repo: string, url: URL): Promise<unknown> {
+  switch (url.pathname) {
+    case "/api/files":
+ 
[clipped: diff of src/serve.ts in 61a4e85 — showing 8000 of 10997 chars]
````

````diff
diff --git a/test/e2e/serve.e2e.test.ts b/test/e2e/serve.e2e.test.ts
new file mode 100644
index 0000000..d57de94
--- /dev/null
+++ b/test/e2e/serve.e2e.test.ts
@@ -0,0 +1,70 @@
+// Optional slow-tier browser test for `why serve` (issue 502) — excluded from
+// `npm run verify` on purpose: the default suite must pass in a sandbox with
+// no display, so this file lives behind `npm run test:e2e` and skips itself
+// unless playwright is installed:
+//
+//   npm install --no-save playwright && npx playwright install chromium
+//   npm run test:e2e
+//
+// It drives the real SPA in headless Chromium against the same
+// harbor-derived temp repo the endpoint tests use: open a covered file,
+// click the covered line, and require the story panel to show the story
+// and the loud expired-constraint warning.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { rm } from "node:fs/promises";
+import { join } from "node:path";
+import { startWhyServer } from "../../src/serve.ts";
+import { makeHarborRepo } from "../helpers.ts";
+
+// Resolved at runtime only: playwright is not a dependency (the default suite
+// must verify without a browser), so keep the specifier opaque to tsc.
+const PLAYWRIGHT = "playwright";
+const playwright: any = await import(PLAYWRIGHT).catch(() => undefined);
+
+test(
+  "SPA in headless Chromium: blame gutter paints, story panel tells the lock.rs story",
+  { skip: playwright === undefined ? "playwright not installed — npm install --no-save playwright && npx playwright install chromium" : false },
+  async () => {
+    const repo = await makeHarborRepo("why-e2e-");
+
+    // Everything from here on must tear down on any failure — a leaked
+    // server or browser keeps the test process alive past the failure.
+    let running: Awaited<ReturnType<typeof startWhyServer>> | undefined;
+    let browser: any;
+    try {
+      running = await startWhyServer(join(repo, ".why"));
+      browser = await playwright.chromium.launch();
+      const page = await browser.newPage();
+      await page.goto(`${running.url}#/file/${encodeURIComponent("src/lock.rs")}`);
+
+      // The blame gutter paints the covered span with its glyph.
+      await page.waitForSelector("table.code tr.covered");
+      const gutter = page.locator("table.code tr").nth(46).locator("td.why");
+      assert.equal(await gutter.textContent(), "●");
+
+      // Click line 47 → the story panel tells the queue-based-locking story
+      // with the expired Acme warning loud.
+      await page.locator("table.code tr").nth(46).click();
+      const panel = page.locator(".story-panel");
+      await panel.locator(".card").first().waitFor();
+      const text = (await panel.textContent()) ?? "";
+      assert.ok(text.includes("Queue-based locking"), text);
+      assert.ok(text.includes("EXPIRED 2025-06-30"), text);
+      assert.ok(text.includes("may now be scar tissue"), text);
+
+      // The graph tab draws on a canvas without console errors.
+      const errors: string[] = [];
+      page.on("pageerror", (e: unknown) => errors.push(String(e)));
+      await page.goto(`${running.url}#/graph`);
+      await page.waitForSelector(".graph-view canvas");
+      await page.waitForTimeout(300);
+      assert.deepEqual(errors, []);
+    } finally {
+      if (browser) await browser.close();
+      if (running) await running.close();
+      await rm(repo, { recursive: true, force: true });
+    }
+  },
+);
````

````diff
diff --git a/test/helpers.ts b/test/helpers.ts
index 876de86..6d847df 100644
--- a/test/helpers.ts
+++ b/test/helpers.ts
@@ -3,9 +3,10 @@
 
 import assert from "node:assert/strict";
 import { spawnSync } from "node:child_process";
-import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
+import { cp, mkdtemp, mkdir, writeFile } from "node:fs/promises";
 import { tmpdir } from "node:os";
 import { dirname, join } from "node:path";
+import { fileURLToPath } from "node:url";
 import type { CliIo } from "../src/cli.ts";
 
 export function capture(): { io: CliIo; out: string[]; err: string[] } {
@@ -43,3 +44,25 @@ export async function makeRepo(prefix: string): Promise<string> {
   git(repo, "config", "user.name", "why tests");
   return repo;
 }
+
+const HARBOR = fileURLToPath(new URL("../examples/harbor", import.meta.url));
+
+/** A temp repo whose fabricated sources match the harbor anchors, with
+ * examples/harbor committed as its .why — the serve tests' fixture. */
+export async function makeHarborRepo(prefix: string): Promise<string> {
+  const repo = await makeRepo(prefix);
+  const body = (n: number) => Array.from({ length: n }, (_, i) => `// line ${i + 1}\n`).join("");
+  await write(repo, "src/lock.rs", body(80));
+  await write(repo, "src/dispatch/queue.rs", body(30));
+  await write(repo, "src/server/deadline.rs", body(20));
+  await write(repo, "config/defaults.toml", body(40));
+  // Copy the bundle without derived state (a local .cache/ from earlier CLI
+  // runs would make read-only no-cache-written assertions meaningless).
+  await cp(HARBOR, join(repo, ".why"), {
+    recursive: true,
+    filter: (src) => !src.includes(`${join(HARBOR, ".cache")}`),
+  });
+  git(repo, "add", ".");
+  git(repo, "commit", "-q", "-m", "files matching the harbor anchors");
+  return repo;
+}
````

````diff
diff --git a/test/serve-dom.test.ts b/test/serve-dom.test.ts
new file mode 100644
index 0000000..4fb6287
--- /dev/null
+++ b/test/serve-dom.test.ts
@@ -0,0 +1,159 @@
+// DOM-level smoke test for the SPA's story panel (issue 502): render the
+// panel from fixture story JSON in jsdom — no browser — and assert the two
+// things the UI must never lose: the hedge prefix arrives verbatim from
+// renderedRationale, and an expired-constraint warning is visually loud in
+// the DOM (EXPIRED badge + downstream scar-tissue line). The fixture story is
+// real engine output (buildBlameReport over a throwaway bundle), validated
+// against the story schema, so this test cannot drift from the contract.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { rm } from "node:fs/promises";
+import { join } from "node:path";
+import { fileURLToPath } from "node:url";
+import { Ajv2020 } from "ajv/dist/2020.js";
+import { JSDOM } from "jsdom";
+import { renderStoryPanel } from "../ui/story-panel.js";
+import { buildAnchorIndex } from "../src/anchors.ts";
+import { buildBlameReport } from "../src/blame.ts";
+import { loadBundle } from "../src/bundle.ts";
+import { makeBundle } from "./helpers.ts";
+
+const root = fileURLToPath(new URL("..", import.meta.url));
+
+const concept = (lines: string[]) => lines.join("\n");
+
+/** An inferred decision (must hedge) plus an expired constraint whose led-to
+ * edge makes the decision candidate scar tissue. */
+const FIXTURE = {
+  "decisions/hunch.md": concept([
+    "---",
+    "type: decision",
+    "title: Hunch",
+    "description: The cache is sized to fit one shard.",
+    "why:",
+    "  status: active",
+    "  happened_on: 2024-02-01",
+    "  confidence: inferred",
+    "  anchors:",
+    "    - path: src/cache.ts",
+    "      lines: 1-10",
+    "---",
+    "",
+    "# Hunch",
+    "",
+    "# Why",
+    "",
+    "Body.",
+    "",
+    "# Citations",
+    "",
+    "[1] [PR #9: size the cache](https://example.test/pr/9)",
+  ]),
+  "constraints/one-box.md": concept([
+    "---",
+    "type: constraint",
+    "title: One-box deployment",
+    "description: Everything had to fit a single host.",
+    "why:",
+    "  status: expired",
+    "  happened_on: 2023-11-01",
+    "  expired_on: 2025-06-30",
+    "  confidence: recorded",
+    "  verify:",
+    "    method: review-by",
+    "    review_by: 2027-01-01",
+    "---",
+    "",
+    "# One-box deployment",
+    "",
+    "# Why",
+    "",
+    "Body.",
+    "",
+    "# Led to",
+    "",
+    "- [Hunch](/decisions/hunch.md)",
+  ]),
+};
+
+test("story panel: hedge prefix and expired warning survive into the DOM", async () => {
+  const bundleRoot = await makeBundle(FIXTURE);
+  try {
+    const bundle = await loadBundle(bundleRoot);
+    const story = buildBlameReport(
+      bundle,
+      { path: "src/cache.ts", lines: { start: 5, end: 5 } },
+      buildAnchorIndex(bundle),
+    );
+
+    // The fixture must be a contract-valid story before it may prove anything.
+    const ajv = new Ajv2020({ allErrors: true });
+    ajv.addKeyword("schemaVersion");
+    const validate = ajv.compile(
+      JSON.parse(readFileSync(join(root, "schemas/story.schema.json"), "utf8")),
+    );
+    assert.ok(
+      validate(JSON.parse(JSON.stringify(story))),
+      `fixture story is not schema-valid:\n${JSON.stringify(validate.errors, null, 2)}`,
+    );
+
+    const dom = new JSDOM("<!doctype html><html><body></body></html>");
+    const doc = dom.window.document;
+    const panel = renderStoryPanel(doc, story);
+    doc.body.append(panel);
+
+    // The hedge is data, displayed verbatim — "likely — " for inferred.
+    const rationale = doc.querySelector(".card.type-decision .rationale");
+    assert.ok(rationale, "the hit card renders its rationale");
+    assert.ok(
+      rationale.textContent!.startsWith("likely — "),
+      `hedge prefix missing from the DOM: "${rationale.textContent}"`,
+    );
+    assert.ok(rationale.classList.contains("hedged"), "hedged rationale carries the hedged class");
+
+    // The expired constraint is visually loud: warning card, EXPIRED badge,
+    // downstream blast radius as scar tissue.
+    const warning = doc.querySelector(".card.expired.warning");
+    assert.ok(warning, "the expired constraint renders as a warning card");
+    assert.ok(warning.textContent!.includes("One-box deployment"));
+    assert.ok(warning.textContent!.includes("EXPIRED 2025-06-30"), warning.textContent!);
+    const scar = warning.querySelector(".scar");
+    assert.ok(scar, "the downstream blast radius renders");
+    assert.equal(scar.textContent, '→ downstream decision "Hunch" may now be scar tissue.');
+
+    // Warnings render before hits, matching the VS Code hover/webview order.
+    const hit = doc.querySelector(".card.type-decision")!;
+    assert.ok(
+      warning.compareDocumentPosition(hit) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
+      "the expired-constraint warning card precedes the hit card in the DOM",
+    );
+
+    // Citations render as real links.
+    const citation = doc.querySelector(".card.type-decision .citations a") as HTMLAnchorElement;
+    assert.ok(citation, "citations render as links");
+    assert.equal(citation.textContent, "PR #9: size the cache");
+    assert.equal(citation.href, "https://example.test/pr/9");
+  } finally {
+    await rm(bundleRoot, { recursive: true, force: true });
+  }
+});
+
+test("story panel: an uncovered target renders the nearby fallback, never empty", async () => {
+  const bundleRoot = await makeBundle(FIXTURE);
+  try {
+    const bundle = await loadBundle(bundleRoot);
+    const story = buildBlameReport(
+      bundle,
+      { path: "does/not/exist.rs" },
+      buildAnchorIndex(bundle),
+    );
+    const dom = new JSDOM("<!doctype html><html><body></body></html>");
+    const panel = renderStoryPanel(dom.window.document, story);
+    assert.ok(panel.textContent!.includes("No concepts anchor does/not/exist.rs."));
+    assert.ok(panel.querySelector(".nearby-item"), "nearby anchored concepts are listed");
+  } finally {
+    await rm(bundleRoot, { recursive: true, force: true });
+  }
+});
````

````diff
diff --git a/test/serve.test.ts b/test/serve.test.ts
new file mode 100644
index 0000000..6579e1c
--- /dev/null
+++ b/test/serve.test.ts
@@ -0,0 +1,264 @@
+// `why serve` (issue 502): every JSON endpoint must emit a schema-valid
+// UI-contract payload (docs/ui-contract.md), the server must be localhost-only
+// and provably read-only, and the built SPA assets must be self-contained —
+// no http(s):// reference anywhere, the same guarantee okf-mcp's html export
+// makes. Endpoints run against a temp repo whose fabricated sources match the
+// harbor bundle's anchors, so the story for src/lock.rs:47 must carry the
+// expired-Acme warning.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { existsSync, readFileSync } from "node:fs";
+import { rm } from "node:fs/promises";
+import { join } from "node:path";
+import { fileURLToPath } from "node:url";
+import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
+import { JSDOM } from "jsdom";
+import { main } from "../src/cli.ts";
+import { buildUiAssets } from "../src/serve-assets.ts";
+import { startWhyServer, type RunningWhyServer } from "../src/serve.ts";
+import { capture, git, makeHarborRepo } from "./helpers.ts";
+
+const root = fileURLToPath(new URL("..", import.meta.url));
+const HARBOR = join(root, "examples/harbor");
+
+const ajv = new Ajv2020({ allErrors: true });
+ajv.addKeyword("schemaVersion"); // the contract's own version marker, not a JSON Schema keyword
+
+function compile(schemaFile: string): ValidateFunction {
+  return ajv.compile(JSON.parse(readFileSync(join(root, "schemas", schemaFile), "utf8")));
+}
+
+const validateStory = compile("story.schema.json");
+const validateCoverage = compile("coverage.schema.json");
+const validateGraph = compile("graph.schema.json");
+const validateFiles = compile("files.schema.json");
+const validateGitBlame = compile("gitblame.schema.json");
+const validateDoctorSummary = compile("doctor.schema.json");
+
+function assertValid(validate: ValidateFunction, payload: unknown, label: string): void {
+  assert.ok(
+    validate(payload),
+    `${label} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}\n\npayload:\n${JSON.stringify(payload, null, 2)}`,
+  );
+}
+
+const repo = await makeHarborRepo("why-serve-");
+const running: RunningWhyServer = await startWhyServer(join(repo, ".why"));
+test.after(async () => {
+  await running.close();
+  await rm(repo, { recursive: true, force: true });
+});
+
+async function get(path: string): Promise<{ status: number; body: any }> {
+  const res = await fetch(new URL(path, running.url));
+  return { status: res.status, body: await res.json() };
+}
+
+async function getOk(path: string): Promise<any> {
+  const { status, body } = await get(path);
+  assert.equal(status, 200, `GET ${path} → ${status}: ${JSON.stringify(body)}`);
+  return body;
+}
+
+// --- Endpoints --------------------------------------------------------------
+
+test("the server binds 127.0.0.1 on a random free port", () => {
+  assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
+  assert.ok(running.port > 0);
+});
+
+test("GET /api/files: schema-valid, lists the tracked files", async () => {
+  const files = await getOk("/api/files");
+  assertValid(validateFiles, files, "files");
+  assert.ok(files.files.includes("src/lock.rs"), JSON.stringify(files.files));
+  assert.ok(files.files.includes("config/defaults.toml"));
+  assert.ok(
+    files.files.includes(".why/decisions/queue-based-locking.md"),
+    "tracked bundle files appear too — the tree is honest git ls-files output",
+  );
+});
+
+test("GET /api/blame: schema-valid, one entry per line with content at HEAD", async () => {
+  const blame = await getOk("/api/blame?path=src/lock.rs");
+  assertValid(validateGitBlame, blame, "gitblame");
+  assert.equal(blame.path, "src/lock.rs");
+  assert.equal(blame.head, git(repo, "rev-parse", "HEAD"));
+  assert.equal(blame.lines.length, 80);
+  assert.equal(blame.lines[0].text, "// line 1");
+  assert.equal(blame.lines[46].text, "// line 47");
+  assert.equal(blame.lines[0].author, "why tests");
+  assert.equal(blame.lines[0].summary, "files matching the harbor anchors");
+});
+
+test("GET /api/coverage: schema-valid, stamped with the repo HEAD", async () => {
+  const coverage = await getOk("/api/coverage");
+  assertValid(validateCoverage, coverage, "coverage");
+  assert.equal(coverage.head, git(repo, "rev-parse", "HEAD"));
+  const lock = coverage.files.find((f: { path: string }) => f.path === "src/lock.rs");
+  assert.ok(lock, "src/lock.rs must be covered");
+});
+
+test("GET /api/story for src/lock.rs:47: schema-valid, includes the expired-constraint warning", async () => {
+  const story = await getOk("/api/story?path=src/lock.rs&start=47&end=47");
+  assertValid(validateStory, story, "story");
+  assert.equal(story.hits[0].id, "decisions/queue-based-locking");
+  const acme = story.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
+  assert.ok(acme, "the expired Acme constraint must warn on src/lock.rs:47");
+  assert.equal(acme.status, "expired");
+  assert.equal(acme.downstream[0].id, "decisions/47s-request-deadline");
+});
+
+test("GET /api/story without lines: a whole-file story, still schema-valid", async () => {
+  const story = await getOk("/api/story?path=config/defaults.toml");
+  assertValid(validateStory, story, "whole-file story");
+  assert.ok(story.hits.length >= 2, "the deadline decision and the jitter question both anchor here");
+});
+
+test("GET /api/graph: schema-valid with harbor's six nodes", async () => {
+  const graph = await getOk("/api/graph");
+  assertValid(validateGraph, graph, "graph");
+  assert.equal(graph.nodes.length, 6);
+  assert.ok(graph.edges.length > 0);
+});
+
+test("GET /api/doctor: schema-valid summary with all seven sections in order", async () => {
+  const doctor = await getOk("/api/doctor");
+  assertValid(validateDoctorSummary, doctor, "doctor summary");
+  assert.deepEqual(
+    doctor.sections.map((s: { key: string }) => s.key),
+    [
+      "lostAnchors",
+      "staleAsOf",
+      "reviewByPastDue",
+      "unknownConstraints",
+      "expiredConstraints",
+      "openQuestions",
+      "lintErrors",
+    ],
+  );
+  const open = doctor.sections.find((s: { key: string }) => s.key === "openQuestions");
+  assert.equal(open.count, 1, "harbor has one open question");
+  assert.ok(open.items[0].includes("questions/why-retry-jitter-disabled"), open.items[0]);
+  const expired = doctor.sections.find((s: { key: string }) => s.key === "expiredConstraints");
+  assert.ok(expired.items[0].includes("constraints/acme-45s-timeout"), expired.items[0]);
+});
+
+test("the page shell and assets are served", async () => {
+  for (const [path, needle] of [
+    ["/", "<!doctype html>"],
+    ["/app.js", "api/"],
+    ["/app.css", "--bg"],
+  ] as const) {
+    const res = await fetch(new URL(path, running.url));
+    assert.equal(res.status, 200, path);
+    assert.ok((await res.text()).includes(needle), `${path} must include ${needle}`);
+  }
+});
+
+// --- Errors and the read-only guarantee ------------------------------------------
+
+test("errors: unknown endpoint 404, unknown file 404, bad params 400, mutation 405", async () => {
+  assert.equal((await get("/api/nope")).status, 404);
+  assert.equal((await get("/api/blame?path=does/not/exist.rs")).status, 404);
+  assert.equal((await get("/api/blame")).status, 400);
+  assert.equal((await get("/api/story?path=src/lock.rs&start=0")).status, 400);
+  assert.equal((await get("/api/story?path=src/lock.rs&start=9&end=3")).status, 400);
+  const post = await fetch(new URL("/api/files", running.url), { method: "POST" });
+  assert.equal(post.status, 405, "the server is read-only — non-GET refused");
+  assert.ok(((await post.json()) as { error: string }).error.includes("read-only"));
+});
+
+test("read-only: serving mutates neither the repo nor the bundle", async
[clipped: diff of test/serve.test.ts in 61a4e85 — showing 8000 of 12292 chars]
````

````diff
diff --git a/test/skills.test.ts b/test/skills.test.ts
index 886d2cd..114d857 100644
--- a/test/skills.test.ts
+++ b/test/skills.test.ts
@@ -18,10 +18,17 @@ const SKILL_PATHS = [
   "skills/dig-synthesize/SKILL.md",
   "skills/capture/SKILL.md",
 ];
-const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md", "docs/capture.md", "docs/ci.md", "docs/ui-contract.md"];
+const DOC_PATHS = [
+  ...SKILL_PATHS,
+  "docs/digging.md",
+  "docs/capture.md",
+  "docs/ci.md",
+  "docs/ui-contract.md",
+  "docs/vscode.md",
+];
 
 /** `why <sub>` may only name subcommands implemented by this point in the
- * plan (Phases 1–4 plus the Phase 5 UI data contract's `export`). */
+ * plan (Phases 1–4 plus the Phase 5/6 UI surface: `export`, `serve`). */
 const IMPLEMENTED_SUBCOMMANDS = new Set([
   "init",
   "lint",
@@ -32,6 +39,7 @@ const IMPLEMENTED_SUBCOMMANDS = new Set([
   "audit",
   "capture",
   "export",
+  "serve",
 ]);
 
 /** snake_case tokens in the docs that are schema fields, example symbols, or
@@ -46,6 +54,7 @@ const NON_TOOL_TOKENS = new Set([
   "acquire_shared",
   "pull_request",
   "workflow_dispatch",
+  "node_modules",
 ]);
 
 /** Everything an agent would treat as runnable: fenced blocks + inline code. */
````

````diff
diff --git a/test/ui-contract.test.ts b/test/ui-contract.test.ts
index 8cb3212..06a78c2 100644
--- a/test/ui-contract.test.ts
+++ b/test/ui-contract.test.ts
@@ -30,6 +30,9 @@ function compile(schemaFile: string): ValidateFunction {
 const validateStory = compile("story.schema.json");
 const validateCoverage = compile("coverage.schema.json");
 const validateGraph = compile("graph.schema.json");
+const validateFiles = compile("files.schema.json");
+const validateGitBlame = compile("gitblame.schema.json");
+const validateDoctorSummary = compile("doctor.schema.json");
 
 function assertValid(validate: ValidateFunction, payload: unknown, label: string): void {
   assert.ok(
@@ -317,10 +320,17 @@ test("export --out writes the payload to a file", async () => {
 test("docs/ui-contract.md: exists, examples validate against their schemas, policy stated", () => {
   const doc = readFileSync(join(root, "docs/ui-contract.md"), "utf8");
   const examples = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!));
-  assert.equal(examples.length, 3, "the doc must example all three schemas: story, coverage, graph");
+  assert.equal(
+    examples.length,
+    6,
+    "the doc must example all six schemas: story, coverage, graph, files, gitblame, doctor",
+  );
   assertValid(validateStory, examples[0], "doc story example");
   assertValid(validateCoverage, examples[1], "doc coverage example");
   assertValid(validateGraph, examples[2], "doc graph example");
+  assertValid(validateFiles, examples[3], "doc files example");
+  assertValid(validateGitBlame, examples[4], "doc gitblame example");
+  assertValid(validateDoctorSummary, examples[5], "doc doctor-summary example");
   for (const needle of [
     "schemaVersion",
     "Additive changes are minor",
@@ -332,6 +342,9 @@ test("docs/ui-contract.md: exists, examples validate against their schemas, poli
     "schemas/story.schema.json",
     "schemas/coverage.schema.json",
     "schemas/graph.schema.json",
+    "schemas/files.schema.json",
+    "schemas/gitblame.schema.json",
+    "schemas/doctor.schema.json",
   ]) {
     assert.ok(doc.includes(needle), `docs/ui-contract.md: missing "${needle}"`);
   }
````

````diff
diff --git a/ui/app.js b/ui/app.js
new file mode 100644
index 0000000..d1ca4c9
--- /dev/null
+++ b/ui/app.js
@@ -0,0 +1,316 @@
+// The `why serve` SPA shell: hash-routed views (file tree + blame gutter,
+// graph, doctor list) over the UI data contract payloads. Dumb renderer by
+// design — confidence, hedging, and health semantics all arrive precomputed
+// from the JSON API; nothing here re-derives them (docs/ui-contract.md).
+
+import { renderGraph, TYPE_COLORS } from "./graph.js";
+import { renderStoryPanel } from "./story-panel.js";
+
+const doc = document;
+
+const state = {
+  files: [],
+  /** path → coverage spans (schemas/coverage.schema.json). */
+  coverage: new Map(),
+  coverageHead: "",
+  doctor: null,
+  stopGraph: null,
+};
+
+async function api(path) {
+  const res = await fetch(path);
+  if (!res.ok) {
+    const body = await res.json().catch(() => ({}));
+    throw new Error(body.error ?? `${res.status} on ${path}`);
+  }
+  return res.json();
+}
+
+function h(tag, className, text) {
+  const node = doc.createElement(tag);
+  if (className) node.className = className;
+  if (text !== undefined) node.textContent = text;
+  return node;
+}
+
+function clear(node) {
+  while (node.firstChild) node.removeChild(node.firstChild);
+}
+
+async function refreshCoverage() {
+  const coverage = await api("/api/coverage");
+  state.coverage = new Map(coverage.files.map((file) => [file.path, file.spans]));
+  state.coverageHead = coverage.head;
+}
+
+// --- Header ------------------------------------------------------------------
+
+const CHIP_SPECS = [
+  ["lostAnchors", "lost anchors"],
+  ["reviewByPastDue", "overdue reviews"],
+  ["openQuestions", "open questions"],
+];
+
+function renderChips(container) {
+  clear(container);
+  if (!state.doctor) return;
+  const sections = new Map(state.doctor.sections.map((section) => [section.key, section]));
+  for (const [key, label] of CHIP_SPECS) {
+    const section = sections.get(key);
+    if (!section) continue;
+    const tone = section.count === 0 ? "ok" : section.severity;
+    const chip = h("a", `chip chip-${tone}`, `${section.count} ${label}`);
+    chip.href = "#/doctor";
+    container.append(chip);
+  }
+}
+
+// --- File tree -----------------------------------------------------------------
+
+function buildTree(paths) {
+  const root = { dirs: new Map(), files: [] };
+  for (const path of paths) {
+    const parts = path.split("/");
+    let node = root;
+    for (const part of parts.slice(0, -1)) {
+      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
+      node = node.dirs.get(part);
+    }
+    node.files.push({ name: parts[parts.length - 1], path });
+  }
+  return root;
+}
+
+function renderTree(node, openDepth) {
+  const list = h("ul", "tree");
+  for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
+    const item = h("li");
+    const details = h("details");
+    if (openDepth > 0) details.open = true;
+    details.append(h("summary", "dir", name));
+    details.append(renderTree(child, openDepth - 1));
+    item.append(details);
+    list.append(item);
+  }
+  for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
+    const item = h("li");
+    const link = h("a", "file", file.name);
+    link.href = `#/file/${encodeURIComponent(file.path)}`;
+    if (state.coverage.has(file.path)) link.append(h("span", "covered-dot", "●"));
+    item.append(link);
+    list.append(item);
+  }
+  return list;
+}
+
+// --- File view ------------------------------------------------------------------
+
+/** Rough age for the git column: newest-commit recency at a glance. */
+function age(dateStr) {
+  const days = Math.max(0, Math.floor((Date.now() - Date.parse(dateStr)) / 86400000));
+  if (days < 30) return `${days}d`;
+  if (days < 365) return `${Math.floor(days / 30)}mo`;
+  return `${Math.floor(days / 365)}y`;
+}
+
+function covering(spans, line) {
+  return spans.filter(
+    (span) => span.lines === undefined || (span.lines.start <= line && line <= span.lines.end),
+  );
+}
+
+/** The gutter treatment for one line: scar tissue and open questions stand
+ * apart; everything else colors by confidence (docs/ui-contract.md). */
+function stripeClass(spans) {
+  if (spans.length === 0) return "";
+  if (spans.some((span) => span.type === "constraint" && span.status === "expired")) return "why-expired";
+  if (spans.some((span) => span.type === "question")) return "why-question";
+  return `why-conf-${spans[0].confidence ?? "none"}`;
+}
+
+async function showFile(path, fileView, storyPanel) {
+  clear(fileView);
+  fileView.append(h("h2", "file-path", path));
+  let blame;
+  try {
+    blame = await api(`/api/blame?path=${encodeURIComponent(path)}`);
+  } catch (e) {
+    fileView.append(h("p", "error", e.message));
+    return;
+  }
+  // HEAD moved since the coverage snapshot — refresh rather than paint stale spans.
+  if (blame.head !== state.coverageHead) await refreshCoverage();
+  const spans = state.coverage.get(path) ?? [];
+
+  const table = h("table", "code");
+  let prevSha = "";
+  blame.lines.forEach((line, i) => {
+    const n = i + 1;
+    const row = h("tr");
+    row.append(h("td", "num", String(n)));
+    const gitCell = h("td", "git");
+    if (line.sha !== prevSha) {
+      gitCell.textContent = `${line.author} · ${age(line.date)}`;
+      gitCell.title = `${line.sha.slice(0, 10)} ${line.date} — ${line.summary}`;
+      row.classList.add("group-start");
+    }
+    prevSha = line.sha;
+    row.append(gitCell);
+    const here = covering(spans, n);
+    const why = h("td", `why ${stripeClass(here)}`);
+    if (here.length > 0) {
+      why.textContent = here[0].glyph;
+      why.title = here.map((span) => span.conceptId).join("\n");
+      row.classList.add("covered");
+    }
+    row.append(why);
+    row.append(h("td", "text", line.text));
+    row.onclick = () => showStory(path, n, storyPanel);
+    table.append(row);
+  });
+  fileView.append(table);
+}
+
+async function showStory(path, line, storyPanel) {
+  clear(storyPanel);
+  try {
+    const story = await api(`/api/story?path=${encodeURIComponent(path)}&start=${line}&end=${line}`);
+    storyPanel.append(renderStoryPanel(doc, story));
+  } catch (e) {
+    storyPanel.append(h("p", "error", e.message));
+  }
+}
+
+// --- Views -----------------------------------------------------------------------
+
+function filesView(main, filePath) {
+  const layout = h("div", "layout");
+  const sidebar = h("aside", "sidebar");
+  sidebar.append(renderTree(buildTree(state.files), 2));
+  const fileView = h("section", "file-view");
+  const storyPanel = h("aside", "story-panel");
+  storyPanel.append(h("p", "hint", "Click a line to see the story behind it."));
+  layout.append(sidebar, fileView, storyPanel);
+  main.append(layout);
+  if (filePath) void showFile(filePath, fileView, storyPanel);
+  else fileView.append(h("p", "hint", "Pick a file — ● marks files with a recorded why."));
+}
+
+async function graphView(main) {
+  const wrap = h("section", "graph-view");
+  const legend = h("div", "legend");
+  for (const [type, color] of Object.entries(TYPE_COLORS)) {
+    const entry = h("span", "legend-entry", type);
+    const dot = h("span", "legend-dot", "●");
+    dot.style.color = color;
+    entry.prepend(dot);
+    legend.append(entry);
+  }
+  wrap.append(legend);
+  const canvas = doc.createElement("canvas");
+  wrap.append(canvas);
+  main.append(wrap);
+  canvas.width = Math.max(wrap.clientWidth - 16, 480);
+  canvas.height = Math.max(doc.documentElement.clientHeight - 180, 420);
+  try {
+    const graph = await api("/api/graph");
+    state.stopGraph = renderGraph(canvas, graph);
+  } catch (e) {
+    wrap.append(h("p", "error", e.message));
+  }
+}
+
+async function doctorView(main) {
+  const wrap = h("section", "doctor-view");
+  main.append(wrap);
+  try {
+    const doctor = await api("/api/doctor");
+    st
[clipped: diff of ui/app.js in 61a4e85 — showing 8000 of 10866 chars]
````

````diff
diff --git a/ui/graph.js b/ui/graph.js
new file mode 100644
index 0000000..e445346
--- /dev/null
+++ b/ui/graph.js
@@ -0,0 +1,164 @@
+// Graph tab: the bundle graph payload (schemas/graph.schema.json) drawn with
+// a hand-rolled canvas force simulation — the okf-mcp `graph html` approach
+// (embedded, zero dependencies), reimplemented here against the contract's
+// nodes/edges shape. Type-colored nodes, relation-labeled edges, drag to pin.
+
+export const TYPE_COLORS = {
+  decision: "#5b9cf5",
+  constraint: "#e2a336",
+  attempt: "#8d97a5",
+  incident: "#e05d5d",
+  question: "#b57edc",
+};
+
+const RADIUS = 9;
+
+function initNodes(graph, width, height) {
+  // Deterministic ring seeding — stable layouts across reloads beat jitter.
+  return graph.nodes.map((node, i) => {
+    const angle = (2 * Math.PI * i) / graph.nodes.length;
+    const ring = Math.min(width, height) / 4;
+    return {
+      ...node,
+      x: width / 2 + ring * Math.cos(angle),
+      y: height / 2 + ring * Math.sin(angle),
+      vx: 0,
+      vy: 0,
+      pinned: false,
+    };
+  });
+}
+
+function tick(nodes, edges, width, height) {
+  for (let i = 0; i < nodes.length; i++) {
+    const a = nodes[i];
+    // Pairwise repulsion.
+    for (let j = i + 1; j < nodes.length; j++) {
+      const b = nodes[j];
+      const dx = a.x - b.x;
+      const dy = a.y - b.y;
+      const d2 = Math.max(dx * dx + dy * dy, 25);
+      const force = 2600 / d2;
+      const d = Math.sqrt(d2);
+      a.vx += (dx / d) * force;
+      a.vy += (dy / d) * force;
+      b.vx -= (dx / d) * force;
+      b.vy -= (dy / d) * force;
+    }
+    // Gravity toward the center.
+    a.vx += (width / 2 - a.x) * 0.005;
+    a.vy += (height / 2 - a.y) * 0.005;
+  }
+  // Edge springs.
+  for (const edge of edges) {
+    const dx = edge.to.x - edge.from.x;
+    const dy = edge.to.y - edge.from.y;
+    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
+    const force = (d - 130) * 0.02;
+    edge.from.vx += (dx / d) * force;
+    edge.from.vy += (dy / d) * force;
+    edge.to.vx -= (dx / d) * force;
+    edge.to.vy -= (dy / d) * force;
+  }
+  for (const node of nodes) {
+    if (node.pinned) {
+      node.vx = 0;
+      node.vy = 0;
+      continue;
+    }
+    node.vx *= 0.85;
+    node.vy *= 0.85;
+    node.x = Math.min(Math.max(node.x + node.vx, RADIUS * 2), width - RADIUS * 2);
+    node.y = Math.min(Math.max(node.y + node.vy, RADIUS * 2), height - RADIUS * 2);
+  }
+}
+
+function draw(ctx, nodes, edges, width, height) {
+  ctx.clearRect(0, 0, width, height);
+  ctx.font = "11px system-ui, sans-serif";
+  for (const edge of edges) {
+    ctx.strokeStyle = "#5a6472";
+    ctx.lineWidth = 1;
+    ctx.beginPath();
+    ctx.moveTo(edge.from.x, edge.from.y);
+    ctx.lineTo(edge.to.x, edge.to.y);
+    ctx.stroke();
+    // Arrowhead toward the target.
+    const dx = edge.to.x - edge.from.x;
+    const dy = edge.to.y - edge.from.y;
+    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
+    const tipX = edge.to.x - (dx / d) * (RADIUS + 3);
+    const tipY = edge.to.y - (dy / d) * (RADIUS + 3);
+    ctx.fillStyle = "#5a6472";
+    ctx.beginPath();
+    ctx.moveTo(tipX, tipY);
+    ctx.lineTo(tipX - (dx / d) * 7 - (dy / d) * 3.5, tipY - (dy / d) * 7 + (dx / d) * 3.5);
+    ctx.lineTo(tipX - (dx / d) * 7 + (dy / d) * 3.5, tipY - (dy / d) * 7 - (dx / d) * 3.5);
+    ctx.fill();
+    // Relation label at the midpoint.
+    ctx.fillStyle = "#8b95a5";
+    ctx.textAlign = "center";
+    ctx.fillText(edge.relation, (edge.from.x + edge.to.x) / 2, (edge.from.y + edge.to.y) / 2 - 4);
+  }
+  for (const node of nodes) {
+    ctx.beginPath();
+    ctx.arc(node.x, node.y, RADIUS, 0, 2 * Math.PI);
+    ctx.fillStyle = TYPE_COLORS[node.type] ?? "#8d97a5";
+    ctx.fill();
+    if (node.status === "expired" || node.status === "superseded") {
+      ctx.strokeStyle = "#ff6b6b";
+      ctx.lineWidth = 2.5;
+      ctx.stroke();
+    }
+    ctx.fillStyle = "#dde3ec";
+    ctx.textAlign = "center";
+    ctx.fillText(node.title, node.x, node.y + RADIUS + 13);
+  }
+}
+
+/** Run the simulation on `canvas`; returns a stop() for teardown. */
+export function renderGraph(canvas, graph) {
+  const ctx = canvas.getContext("2d");
+  const width = canvas.width;
+  const height = canvas.height;
+  const nodes = initNodes(graph, width, height);
+  const byId = new Map(nodes.map((node) => [node.id, node]));
+  const edges = graph.edges.map((edge) => ({
+    from: byId.get(edge.from),
+    to: byId.get(edge.to),
+    relation: edge.relation,
+  }));
+
+  let dragging = null;
+  const pos = (event) => {
+    const rect = canvas.getBoundingClientRect();
+    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
+  };
+  canvas.onmousedown = (event) => {
+    const { x, y } = pos(event);
+    dragging = nodes.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 <= (RADIUS + 4) ** 2) ?? null;
+    if (dragging) dragging.pinned = true;
+  };
+  canvas.onmousemove = (event) => {
+    if (!dragging) return;
+    const { x, y } = pos(event);
+    dragging.x = x;
+    dragging.y = y;
+  };
+  canvas.onmouseup = () => {
+    if (dragging) dragging.pinned = false;
+    dragging = null;
+  };
+
+  let running = true;
+  const frame = () => {
+    if (!running) return;
+    tick(nodes, edges, width, height);
+    draw(ctx, nodes, edges, width, height);
+    requestAnimationFrame(frame);
+  };
+  requestAnimationFrame(frame);
+  return () => {
+    running = false;
+  };
+}
````

````diff
diff --git a/ui/story-panel.d.ts b/ui/story-panel.d.ts
new file mode 100644
index 0000000..a66c3c1
--- /dev/null
+++ b/ui/story-panel.d.ts
@@ -0,0 +1,9 @@
+// Types for the story-panel renderer, so the DOM smoke test type-checks
+// without enabling allowJs for the whole UI. The story parameter is the
+// payload of schemas/story.schema.json (`why blame --json`).
+
+import type { BlameReport } from "../src/blame.ts";
+
+export function glyphFor(type: string, status: string | undefined): "●" | "⚠" | "?";
+export function formatTarget(target: BlameReport["target"]): string;
+export function renderStoryPanel(doc: Document, story: BlameReport): HTMLElement;
````

````diff
diff --git a/ui/story-panel.js b/ui/story-panel.js
new file mode 100644
index 0000000..030cc1f
--- /dev/null
+++ b/ui/story-panel.js
@@ -0,0 +1,125 @@
+// Story panel: a dumb renderer over the story payload (`why blame --json`,
+// schemas/story.schema.json). Every semantic arrives precomputed — the hedge
+// is baked into renderedRationale (displayed verbatim, never re-derived) and
+// the expired-constraint blast radius arrives as `downstream` — so this file
+// only lays cards out. Exported as a pure (document, story) → element
+// function so the DOM smoke test can drive it without a browser.
+
+/** Same vocabulary the engine precomputes into coverage spans; the contract
+ * doc says stories derive theirs the same way from type + status. */
+export function glyphFor(type, status) {
+  if (type === "question") return "?";
+  if (status === "expired" || status === "superseded") return "⚠";
+  return "●";
+}
+
+export function formatTarget(target) {
+  if (!target.lines) return target.path;
+  const { start, end } = target.lines;
+  return `${target.path}:${start}${end === start ? "" : `-${end}`}`;
+}
+
+function el(doc, tag, className, text) {
+  const node = doc.createElement(tag);
+  if (className) node.className = className;
+  if (text !== undefined) node.textContent = text;
+  return node;
+}
+
+function isExpiredConstraint(block) {
+  return block.type === "constraint" && block.status === "expired";
+}
+
+function badge(doc, className, text) {
+  return el(doc, "span", `badge ${className}`, text);
+}
+
+const EDGE_LABELS = [
+  ["becauseOf", "because of"],
+  ["insteadOf", "instead of"],
+  ["supersededBy", "superseded by"],
+];
+
+function renderCard(doc, block, isWarning) {
+  const expired = isExpiredConstraint(block);
+  const classes = ["card", `type-${block.type}`];
+  if (expired) classes.push("expired");
+  if (isWarning) classes.push("warning");
+  const card = el(doc, "article", classes.join(" "));
+
+  const head = el(doc, "header", "card-head");
+  head.append(el(doc, "span", `glyph${expired ? " glyph-warn" : ""}`, glyphFor(block.type, block.status)));
+  head.append(el(doc, "strong", "card-title", block.title));
+  head.append(badge(doc, "type", block.type));
+  if (expired) {
+    head.append(badge(doc, "loud", `EXPIRED ${block.expired_on ?? "(date unknown)"}`));
+  } else if (block.status !== undefined) {
+    head.append(badge(doc, `status status-${block.status}`, block.status));
+  }
+  if (block.happened_on !== undefined) head.append(badge(doc, "date", block.happened_on));
+  if (block.type !== "question" && block.confidence !== undefined) {
+    head.append(badge(doc, `conf conf-${block.confidence}`, block.confidence));
+  }
+  card.append(head);
+
+  // Display verbatim: the mandatory hedge prefix is already in the data.
+  if (block.renderedRationale !== "") {
+    card.append(el(doc, "p", `rationale${block.hedged ? " hedged" : ""}`, block.renderedRationale));
+  }
+
+  for (const [key, label] of EDGE_LABELS) {
+    const edges = block.edges[key];
+    if (edges.length === 0) continue;
+    const row = el(doc, "div", "edges");
+    row.append(el(doc, "span", "edge-label", label));
+    const list = el(doc, "ul", "edge-list");
+    for (const edge of edges) {
+      const suffix = edge.type === undefined ? "" : ` (${edge.type}${edge.status === undefined ? "" : ` — ${edge.status}`})`;
+      list.append(el(doc, "li", "edge", `${edge.title}${suffix}`));
+    }
+    row.append(list);
+    card.append(row);
+  }
+
+  for (const decision of block.downstream) {
+    card.append(el(doc, "p", "scar", `→ downstream decision "${decision.title}" may now be scar tissue.`));
+  }
+
+  if (block.citations.length > 0) {
+    const list = el(doc, "ul", "citations");
+    for (const citation of block.citations) {
+      const item = el(doc, "li");
+      const link = el(doc, "a", "citation", citation.label);
+      link.href = citation.url;
+      link.target = "_blank";
+      link.rel = "noreferrer";
+      item.append(link);
+      list.append(item);
+    }
+    card.append(list);
+  }
+  return card;
+}
+
+/** Render one story payload into a detached element the caller mounts. */
+export function renderStoryPanel(doc, story) {
+  const root = el(doc, "section", "story");
+  root.append(el(doc, "h2", "story-target", story.span ?? formatTarget(story.target)));
+  if (story.hits.length === 0) {
+    root.append(el(doc, "p", "story-empty", `No concepts anchor ${formatTarget(story.target)}.`));
+  }
+  // Warnings first, matching the VS Code hover/webview order — both surfaces
+  // must tell the same story, and expired constraints stay loud.
+  for (const warning of story.warnings) root.append(renderCard(doc, warning, true));
+  for (const hit of story.hits) root.append(renderCard(doc, hit, false));
+  if (story.hits.length === 0 && story.nearby.length > 0) {
+    root.append(el(doc, "h3", "nearby-head", "Anchored concepts nearby (nearest first)"));
+    const list = el(doc, "ul", "nearby");
+    for (const near of story.nearby) {
+      const anchor = near.anchor.lines === undefined ? near.anchor.path : `${near.anchor.path}:${near.anchor.lines}`;
+      list.append(el(doc, "li", "nearby-item", `${glyphFor(near.type, near.status)} ${near.title} — ${near.type} · ${anchor}`));
+    }
+    root.append(list);
+  }
+  return root;
+}
````

````diff
diff --git a/ui/style.css b/ui/style.css
new file mode 100644
index 0000000..6214e84
--- /dev/null
+++ b/ui/style.css
@@ -0,0 +1,220 @@
+/* `why serve` UI. One sheet, no imports, no external references — the
+ * self-containment test forbids any http(s):// in built assets. Confidence
+ * colors and the scar-tissue/question treatments implement the status →
+ * treatment table in docs/ui-contract.md. */
+
+:root {
+  --bg: #14181f;
+  --panel: #1b212b;
+  --line: #2a3340;
+  --fg: #dde3ec;
+  --dim: #8b95a5;
+  --accent: #5b9cf5;
+  --red: #ff6b6b;
+  --yellow: #e2a336;
+  --ok: #57b47a;
+  --question: #b57edc;
+  --conf-recorded: #57b47a;
+  --conf-corroborated: #7fc98f;
+  --conf-inferred: #e2a336;
+  --conf-speculative: #d0743c;
+  --conf-none: #d0743c;
+}
+
+* { box-sizing: border-box; }
+
+body {
+  margin: 0;
+  background: var(--bg);
+  color: var(--fg);
+  font: 14px/1.5 system-ui, sans-serif;
+}
+
+.error { color: var(--red); padding: 0.5rem 1rem; }
+.hint { color: var(--dim); padding: 0.5rem 1rem; }
+
+/* --- Header ----------------------------------------------------------- */
+
+.topbar {
+  display: flex;
+  align-items: center;
+  gap: 1.25rem;
+  padding: 0.5rem 1rem;
+  background: var(--panel);
+  border-bottom: 1px solid var(--line);
+  position: sticky;
+  top: 0;
+  z-index: 2;
+}
+
+.brand { font-weight: 700; font-size: 1.1rem; color: var(--accent); }
+
+nav .tab {
+  color: var(--dim);
+  text-decoration: none;
+  padding: 0.25rem 0.6rem;
+  border-radius: 4px;
+}
+nav .tab.active, nav .tab:hover { color: var(--fg); background: var(--line); }
+
+.chips { margin-left: auto; display: flex; gap: 0.5rem; }
+.chip {
+  text-decoration: none;
+  font-size: 0.8rem;
+  padding: 0.15rem 0.6rem;
+  border-radius: 999px;
+  border: 1px solid var(--line);
+  color: var(--dim);
+}
+.chip-red { color: var(--red); border-color: var(--red); }
+.chip-yellow { color: var(--yellow); border-color: var(--yellow); }
+.chip-ok { color: var(--ok); }
+
+/* --- Layout ----------------------------------------------------------- */
+
+.layout {
+  display: grid;
+  grid-template-columns: minmax(180px, 240px) 1fr minmax(280px, 380px);
+  gap: 0;
+  min-height: calc(100vh - 3rem);
+}
+
+.sidebar {
+  border-right: 1px solid var(--line);
+  padding: 0.75rem 0.5rem;
+  overflow: auto;
+  max-height: calc(100vh - 3rem);
+  position: sticky;
+  top: 3rem;
+}
+
+.story-panel {
+  border-left: 1px solid var(--line);
+  padding: 0.75rem;
+  overflow: auto;
+  max-height: calc(100vh - 3rem);
+  position: sticky;
+  top: 3rem;
+}
+
+/* --- File tree ---------------------------------------------------------- */
+
+.tree { list-style: none; margin: 0; padding-left: 0.9rem; }
+.tree summary.dir { cursor: pointer; color: var(--dim); }
+.tree a.file { color: var(--fg); text-decoration: none; display: inline-block; padding: 0.05rem 0.25rem; }
+.tree a.file:hover { background: var(--line); border-radius: 3px; }
+.covered-dot { color: var(--accent); font-size: 0.6rem; margin-left: 0.35rem; vertical-align: middle; }
+
+/* --- File view (blame gutter) ------------------------------------------- */
+
+.file-path { font-size: 1rem; padding: 0.5rem 1rem 0; margin: 0; }
+
+table.code {
+  border-collapse: collapse;
+  width: 100%;
+  font: 12px/1.45 ui-monospace, monospace;
+  margin-top: 0.5rem;
+}
+table.code td { padding: 0 0.5rem; white-space: pre; vertical-align: top; }
+table.code tr.group-start td { border-top: 1px solid var(--line); }
+table.code tr:hover td { background: #222a36; }
+table.code tr.covered { cursor: pointer; }
+
+td.num { color: var(--dim); text-align: right; user-select: none; width: 3.5rem; }
+td.git { color: var(--dim); width: 12rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; }
+td.text { width: 100%; }
+
+/* The why gutter stripe: color by confidence; scar tissue and questions
+ * get their own loud treatments. */
+td.why {
+  width: 1.4rem;
+  min-width: 1.4rem;
+  text-align: center;
+  border-left: 3px solid transparent;
+  color: var(--dim);
+  user-select: none;
+}
+td.why.why-conf-recorded { border-left-color: var(--conf-recorded); color: var(--conf-recorded); }
+td.why.why-conf-corroborated { border-left-color: var(--conf-corroborated); color: var(--conf-corroborated); }
+td.why.why-conf-inferred { border-left-color: var(--conf-inferred); color: var(--conf-inferred); }
+td.why.why-conf-speculative { border-left-color: var(--conf-speculative); color: var(--conf-speculative); }
+td.why.why-conf-none { border-left-color: var(--conf-none); color: var(--conf-none); }
+td.why.why-question { border-left-color: var(--question); color: var(--question); border-left-style: dotted; }
+td.why.why-expired {
+  border-left-color: var(--red);
+  color: var(--red);
+  background: rgba(255, 107, 107, 0.12);
+}
+
+/* --- Story panel ---------------------------------------------------------- */
+
+.story-target { font-size: 0.95rem; margin: 0.25rem 0 0.75rem; color: var(--dim); }
+
+.card {
+  background: var(--panel);
+  border: 1px solid var(--line);
+  border-radius: 6px;
+  padding: 0.6rem 0.75rem;
+  margin-bottom: 0.75rem;
+}
+.card.expired { border-color: var(--red); box-shadow: 0 0 0 1px var(--red); }
+
+.card-head { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; }
+.card-title { margin-right: 0.25rem; }
+.glyph-warn { color: var(--red); }
+
+.badge {
+  font-size: 0.7rem;
+  padding: 0.05rem 0.45rem;
+  border-radius: 999px;
+  border: 1px solid var(--line);
+  color: var(--dim);
+}
+.badge.loud {
+  color: #fff;
+  background: var(--red);
+  border-color: var(--red);
+  font-weight: 700;
+}
+.badge.conf-recorded { color: var(--conf-recorded); border-color: var(--conf-recorded); }
+.badge.conf-corroborated { color: var(--conf-corroborated); border-color: var(--conf-corroborated); }
+.badge.conf-inferred { color: var(--conf-inferred); border-color: var(--conf-inferred); }
+.badge.conf-speculative { color: var(--conf-speculative); border-color: var(--conf-speculative); }
+
+.rationale { margin: 0.5rem 0; }
+.rationale.hedged { font-style: italic; }
+
+.edges { display: flex; gap: 0.5rem; font-size: 0.85rem; }
+.edge-label { color: var(--dim); min-width: 7.5rem; }
+.edge-list { list-style: none; margin: 0; padding: 0; }
+
+.scar {
+  color: var(--red);
+  font-weight: 600;
+  margin: 0.5rem 0;
+}
+
+.citations { list-style: none; margin: 0.5rem 0 0; padding: 0; font-size: 0.85rem; }
+.citations a { color: var(--accent); }
+
+.nearby { list-style: none; padding: 0; }
+.nearby-item { color: var(--dim); padding: 0.15rem 0; }
+
+/* --- Graph -------------------------------------------------------------- */
+
+.graph-view { padding: 0.75rem 1rem; }
+.legend { display: flex; gap: 1rem; margin-bottom: 0.5rem; color: var(--dim); }
+.legend-dot { margin-right: 0.3rem; }
+.graph-view canvas { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
+
+/* --- Doctor ---------------------------------------------------------------- */
+
+.doctor-view { padding: 0.75rem 1.25rem; max-width: 64rem; }
+.doctor-headline.ok { color: var(--ok); }
+.doctor-headline.red { color: var(--red); }
+.doctor-title { margin: 0.9rem 0 0.25rem; font-size: 0.95rem; }
+.doctor-title.tone-ok { color: var(--ok); }
+.doctor-title.tone-red { color: var(--red); }
+.doctor-title.tone-yellow { color: var(--yellow); }
+.doctor-items { list-style: none; padding-left: 0.5rem; margin: 0; }
+.doctor-item { font: 12px/1.6 ui-monospace, monospace; color: var(--fg); }
````

````diff
diff --git a/vscode-why/.vscodeignore b/vscode-why/.vscodeignore
new file mode 100644
index 0000000..067a803
--- /dev/null
+++ b/vscode-why/.vscodeignore
@@ -0,0 +1,10 @@
+.vscodeignore
+tsconfig.json
+tsconfig.build.json
+src/**
+test/**
+test-integration/**
+out/test-integration/**
+out/**/*.map
+node_modules/**
+*.vsix
````

````diff
diff --git a/vscode-why/LICENSE b/vscode-why/LICENSE
new file mode 100644
index 0000000..922aa6f
--- /dev/null
+++ b/vscode-why/LICENSE
@@ -0,0 +1,21 @@
+MIT License
+
+Copyright (c) 2026 copperbox
+
+Permission is hereby granted, free of charge, to any person obtaining a copy
+of this software and associated documentation files (the "Software"), to deal
+in the Software without restriction, including without limitation the rights
+to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
+copies of the Software, and to permit persons to whom the Software is
+furnished to do so, subject to the following conditions:
+
+The above copyright notice and this permission notice shall be included in all
+copies or substantial portions of the Software.
+
+THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
+IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
+FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
+AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
+LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
+OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
+SOFTWARE.
````

````diff
diff --git a/vscode-why/README.md b/vscode-why/README.md
new file mode 100644
index 0000000..21b5195
--- /dev/null
+++ b/vscode-why/README.md
@@ -0,0 +1,44 @@
+# vscode-why
+
+Inline **why** annotations, GitLens-style: the moment you are about to edit
+weird code is the moment its recorded rationale matters, and that moment
+happens in the editor.
+
+The extension is a *pure contract consumer* — it shells out to the `why` CLI
+(`why export ui-index`, `why blame --json`) and renders the versioned JSON
+payloads documented in the repo's `docs/ui-contract.md`. Zero engine logic
+lives here: hedging, confidence, glyphs, and blast radii all arrive
+precomputed in the data.
+
+## What it does
+
+- **Line marks** — a subtle stripe per covered span, colored by
+  confidence/status through VS Code theme tokens (no hardcoded hex).
+- **Hovers** — a markdown card per covering concept: status glyph, title,
+  confidence badge, the pre-hedged `renderedRationale` verbatim, citation
+  links; an expired upstream constraint always warns *first*.
+- **`why: Show Story`** (editor context menu + palette) — a webview panel
+  with the full story cards for the cursor's line.
+- **`why: Refresh`** — manual escape hatch; automatic refresh happens on file
+  save, `.why/**` changes, and `.git/HEAD` changes (debounced).
+- **Staleness** — when the coverage payload's recorded sha ≠ current HEAD,
+  hovers carry a muted "as of `<short-sha>`" note instead of hiding data or
+  resolving anchors themselves.
+
+## CLI discovery
+
+`why` is located in order: the workspace's `node_modules/.bin`, then PATH,
+then the `why.cliPath` setting. If none resolves, one non-modal info message
+per session, then silence.
+
+## Development
+
+```
+npm install
+npm run verify            # typecheck + unit tests (plain node:test, no display)
+npm run test:integration  # extension-host test via @vscode/test-electron — needs a display (xvfb in CI)
+npm run package           # build + vsce package --no-dependencies → .vsix
+```
+
+Install instructions and a manual QA script live in the repo's
+`docs/vscode.md`.
````

````diff
diff --git a/vscode-why/package-lock.json b/vscode-why/package-lock.json
new file mode 100644
index 0000000..d4755da
--- /dev/null
+++ b/vscode-why/package-lock.json
@@ -0,0 +1,4742 @@
+{
+  "name": "vscode-why",
+  "version": "0.1.0",
+  "lockfileVersion": 3,
+  "requires": true,
+  "packages": {
+    "": {
+      "name": "vscode-why",
+      "version": "0.1.0",
+      "license": "MIT",
+      "devDependencies": {
+        "@types/node": "^22.10.0",
+        "@types/vscode": "~1.85.0",
+        "@vscode/test-electron": "^2.4.1",
+        "@vscode/vsce": "^3.2.1",
+        "tsx": "^4.19.0",
+        "typescript": "^5.7.0"
+      },
+      "engines": {
+        "vscode": "^1.85.0"
+      }
+    },
+    "node_modules/@azu/format-text": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/@azu/format-text/-/format-text-1.0.2.tgz",
+      "integrity": "sha512-Swi4N7Edy1Eqq82GxgEECXSSLyn6GOb5htRFPzBDdUkECGXtlf12ynO5oJSpWKPwCaUssOu7NfhDcCWpIC6Ywg==",
+      "dev": true,
+      "license": "BSD-3-Clause"
+    },
+    "node_modules/@azu/style-format": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/@azu/style-format/-/style-format-1.0.1.tgz",
+      "integrity": "sha512-AHcTojlNBdD/3/KxIKlg8sxIWHfOtQszLvOpagLTO+bjC3u7SAszu1lf//u7JJC50aUSH+BVWDD/KvaA6Gfn5g==",
+      "dev": true,
+      "license": "WTFPL",
+      "dependencies": {
+        "@azu/format-text": "^1.0.1"
+      }
+    },
+    "node_modules/@azure/abort-controller": {
+      "version": "2.1.2",
+      "resolved": "https://registry.npmjs.org/@azure/abort-controller/-/abort-controller-2.1.2.tgz",
+      "integrity": "sha512-nBrLsEWm4J2u5LpAPjxADTlq3trDgVZZXHNKabeXZtpq3d3AbN/KGO82R87rdDz5/lYB024rtEf10/q0urNgsA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=18.0.0"
+      }
+    },
+    "node_modules/@azure/core-auth": {
+      "version": "1.10.1",
+      "resolved": "https://registry.npmjs.org/@azure/core-auth/-/core-auth-1.10.1.tgz",
+      "integrity": "sha512-ykRMW8PjVAn+RS6ww5cmK9U2CyH9p4Q88YJwvUslfuMmN98w/2rdGRLPqJYObapBCdzBVeDgYWdJnFPFb7qzpg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/abort-controller": "^2.1.2",
+        "@azure/core-util": "^1.13.0",
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/core-client": {
+      "version": "1.10.2",
+      "resolved": "https://registry.npmjs.org/@azure/core-client/-/core-client-1.10.2.tgz",
+      "integrity": "sha512-1D2LpsU7y9xrqKjdIbsB7PlrRePw0xsVV8p+AKTlzITrWmscajryfJCdDJB/oGwvDI5HmRo04eMMADB67uwAwQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/abort-controller": "^2.1.2",
+        "@azure/core-auth": "^1.10.0",
+        "@azure/core-rest-pipeline": "^1.22.0",
+        "@azure/core-tracing": "^1.3.0",
+        "@azure/core-util": "^1.13.0",
+        "@azure/logger": "^1.3.0",
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/core-rest-pipeline": {
+      "version": "1.24.0",
+      "resolved": "https://registry.npmjs.org/@azure/core-rest-pipeline/-/core-rest-pipeline-1.24.0.tgz",
+      "integrity": "sha512-PpLsoDQ3AMmKZ0VU+0GrmqMxgp/sExjlVm4R+nLWngeoEGAzOIPVifaxKGU5gMv+nWELUoHfvrolWD+ZS/nFJg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/abort-controller": "^2.1.2",
+        "@azure/core-auth": "^1.10.0",
+        "@azure/core-tracing": "^1.3.0",
+        "@azure/core-util": "^1.13.0",
+        "@azure/logger": "^1.3.0",
+        "@typespec/ts-http-runtime": "^0.3.4",
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/core-tracing": {
+      "version": "1.3.1",
+      "resolved": "https://registry.npmjs.org/@azure/core-tracing/-/core-tracing-1.3.1.tgz",
+      "integrity": "sha512-9MWKevR7Hz8kNzzPLfX4EAtGM2b8mr50HPDBvio96bURP/9C+HjdH3sBlLSNNrvRAr5/k/svoH457gB5IKpmwQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/core-util": {
+      "version": "1.13.1",
+      "resolved": "https://registry.npmjs.org/@azure/core-util/-/core-util-1.13.1.tgz",
+      "integrity": "sha512-XPArKLzsvl0Hf0CaGyKHUyVgF7oDnhKoP85Xv6M4StF/1AhfORhZudHtOyf2s+FcbuQ9dPRAjB8J2KvRRMUK2A==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/abort-controller": "^2.1.2",
+        "@typespec/ts-http-runtime": "^0.3.0",
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/identity": {
+      "version": "4.13.1",
+      "resolved": "https://registry.npmjs.org/@azure/identity/-/identity-4.13.1.tgz",
+      "integrity": "sha512-5C/2WD5Vb1lHnZS16dNQRPMjN6oV/Upba+C9nBIs15PmOi6A3ZGs4Lr2u60zw4S04gi+u3cEXiqTVP7M4Pz3kw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/abort-controller": "^2.0.0",
+        "@azure/core-auth": "^1.9.0",
+        "@azure/core-client": "^1.9.2",
+        "@azure/core-rest-pipeline": "^1.17.0",
+        "@azure/core-tracing": "^1.0.0",
+        "@azure/core-util": "^1.11.0",
+        "@azure/logger": "^1.0.0",
+        "@azure/msal-browser": "^5.5.0",
+        "@azure/msal-node": "^5.1.0",
+        "open": "^10.1.0",
+        "tslib": "^2.2.0"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/logger": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/@azure/logger/-/logger-1.3.0.tgz",
+      "integrity": "sha512-fCqPIfOcLE+CGqGPd66c8bZpwAji98tZ4JI9i/mlTNTlsIWslCfpg48s/ypyLxZTump5sypjrKn2/kY7q8oAbA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@typespec/ts-http-runtime": "^0.3.0",
+        "tslib": "^2.6.2"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
+    "node_modules/@azure/msal-browser": {
+      "version": "5.17.0",
+      "resolved": "https://registry.npmjs.org/@azure/msal-browser/-/msal-browser-5.17.0.tgz",
+      "integrity": "sha512-/yTnW2TCk9Mh+2b/NOaHAN+MryUNxzRTaJD/YtrqOA9bpBWfTXn/iyReRbaLrK/btBo3stEzLyEvuWp2NZ5DuA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/msal-common": "16.11.1"
+      },
+      "engines": {
+        "node": ">=0.8.0"
+      }
+    },
+    "node_modules/@azure/msal-common": {
+      "version": "16.11.1",
+      "resolved": "https://registry.npmjs.org/@azure/msal-common/-/msal-common-16.11.1.tgz",
+      "integrity": "sha512-yPohvMwWLv1XnaWnIUyKUh8CvcVChCGqG/VluGwfGmaAfrZTNt5yQ+sIs462Sgw6+e2K83KGmMJ860p73ZSCrw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.8.0"
+      }
+    },
+    "node_modules/@azure/msal-node": {
+      "version": "5.4.0",
+      "resolved": "https://registry.npmjs.org/@azure/msal-node/-/msal-node-5.4.0.tgz",
+      "integrity": "sha512-6EZEParwHRlnSSIikw8FNAnAzwmh71uhveUXdPNFeZFviJ9SH+rwFiurhjzXqICYTrpm3E+dj693QOwfPbJXAQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@azure/msal-common": "16.11.1",
+        "jsonwebtoken": "^9.0.0"
+      },
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/@babel/code-frame": {
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz",
+      "integrity": "sha512-Aup7aUOfpbAUg2ROOJN6Iw5f9DMBlzu0mIkm/malLQFN/YQgO48wCj0Kxa3sEHJvPVFg7siR+qRInwXd2qhQKw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@babel/helper-validator-identifier": "^7.29.7",
+        "js-tokens": "^4.
[clipped: diff of vscode-why/package-lock.json in 61a4e85 — showing 8000 of 169833 chars]
````

````diff
diff --git a/vscode-why/package.json b/vscode-why/package.json
new file mode 100644
index 0000000..cbfdb0a
--- /dev/null
+++ b/vscode-why/package.json
@@ -0,0 +1,72 @@
+{
+  "name": "vscode-why",
+  "displayName": "why — decision archaeology",
+  "description": "Inline why annotations, GitLens-style: gutter marks and hover cards from the repo's .why/ bundle, rendered from the why CLI's UI-contract payloads.",
+  "version": "0.1.0",
+  "publisher": "copperbox",
+  "license": "MIT",
+  "private": true,
+  "repository": {
+    "type": "git",
+    "url": "https://github.com/copperbox/why.git",
+    "directory": "vscode-why"
+  },
+  "engines": {
+    "vscode": "^1.85.0"
+  },
+  "categories": [
+    "Other"
+  ],
+  "activationEvents": [
+    "workspaceContains:.why/**"
+  ],
+  "main": "./out/src/extension.js",
+  "contributes": {
+    "commands": [
+      {
+        "command": "why.showStory",
+        "category": "why",
+        "title": "Show Story"
+      },
+      {
+        "command": "why.refresh",
+        "category": "why",
+        "title": "Refresh"
+      }
+    ],
+    "menus": {
+      "editor/context": [
+        {
+          "command": "why.showStory",
+          "group": "navigation"
+        }
+      ]
+    },
+    "configuration": {
+      "title": "why",
+      "properties": {
+        "why.cliPath": {
+          "type": "string",
+          "default": "",
+          "description": "Path to the `why` CLI executable. Checked after the workspace's node_modules/.bin and PATH."
+        }
+      }
+    }
+  },
+  "scripts": {
+    "typecheck": "tsc --noEmit -p .",
+    "test": "tsx --test test/*.test.ts",
+    "verify": "npm run typecheck && npm run test",
+    "build": "tsc -p tsconfig.build.json",
+    "test:integration": "npm run build && node out/test-integration/run.js",
+    "package": "npm run build && vsce package --no-dependencies"
+  },
+  "devDependencies": {
+    "@types/node": "^22.10.0",
+    "@types/vscode": "~1.85.0",
+    "@vscode/test-electron": "^2.4.1",
+    "@vscode/vsce": "^3.2.1",
+    "tsx": "^4.19.0",
+    "typescript": "^5.7.0"
+  }
+}
````

````diff
diff --git a/vscode-why/src/core/cli-locate.ts b/vscode-why/src/core/cli-locate.ts
new file mode 100644
index 0000000..2e1b9f9
--- /dev/null
+++ b/vscode-why/src/core/cli-locate.ts
@@ -0,0 +1,53 @@
+// Locate the `why` CLI. Discovery order is part of the issue's contract:
+// the workspace's own node_modules/.bin first (a repo pinning its why wins),
+// then PATH, then the explicit `why.cliPath` setting as the escape hatch.
+// Pure function over an injectable existence probe so the order is unit-
+// testable without a filesystem.
+
+import { delimiter, join } from "node:path";
+
+export type CliSource = "workspace" | "path" | "setting";
+
+export interface CliLocation {
+  command: string;
+  source: CliSource;
+}
+
+export interface LocateOptions {
+  workspaceRoot: string;
+  /** The PATH environment value; undefined skips the PATH step. */
+  pathEnv: string | undefined;
+  /** The `why.cliPath` setting; empty/undefined skips the setting step. */
+  settingPath: string | undefined;
+  platform: NodeJS.Platform;
+  isFile: (candidate: string) => boolean;
+}
+
+function binNames(platform: NodeJS.Platform): string[] {
+  return platform === "win32" ? ["why.cmd", "why.exe", "why"] : ["why"];
+}
+
+export function locateWhyCli(options: LocateOptions): CliLocation | undefined {
+  const names = binNames(options.platform);
+
+  for (const name of names) {
+    const candidate = join(options.workspaceRoot, "node_modules", ".bin", name);
+    if (options.isFile(candidate)) return { command: candidate, source: "workspace" };
+  }
+
+  if (options.pathEnv !== undefined && options.pathEnv !== "") {
+    for (const dir of options.pathEnv.split(delimiter)) {
+      if (dir === "") continue;
+      for (const name of names) {
+        const candidate = join(dir, name);
+        if (options.isFile(candidate)) return { command: candidate, source: "path" };
+      }
+    }
+  }
+
+  if (options.settingPath !== undefined && options.settingPath !== "" && options.isFile(options.settingPath)) {
+    return { command: options.settingPath, source: "setting" };
+  }
+
+  return undefined;
+}
````

````diff
diff --git a/vscode-why/src/core/contract.ts b/vscode-why/src/core/contract.ts
new file mode 100644
index 0000000..b7af05c
--- /dev/null
+++ b/vscode-why/src/core/contract.ts
@@ -0,0 +1,287 @@
+// Parsers for the two UI-contract payloads this extension consumes
+// (docs/ui-contract.md in the why repo): coverage (`why export ui-index`) and
+// story (`why blame --json`). The extension is a dumb renderer — these checks
+// only establish the v1 shape well enough to render honestly; they never
+// re-derive semantics the engine precomputes (hedging, glyphs, downstream).
+//
+// Versioning per the contract: additive fields are ignored; a payload whose
+// schemaVersion is above 1 must be said out loud, never guessed at.
+
+export class ContractError extends Error {}
+
+export const SUPPORTED_SCHEMA_VERSION = 1;
+
+export type ConceptType = "decision" | "constraint" | "attempt" | "incident" | "question";
+export type Glyph = "●" | "⚠" | "?";
+
+export interface LineRange {
+  start: number;
+  end: number;
+}
+
+export interface CoverageSpan {
+  conceptId: string;
+  type: ConceptType;
+  glyph: Glyph;
+  status?: string;
+  confidence?: string;
+  /** 1-based inclusive; absent = a whole-file claim. */
+  lines?: LineRange;
+}
+
+export interface CoverageFile {
+  path: string;
+  spans: CoverageSpan[];
+}
+
+export interface Coverage {
+  /** Full sha of the HEAD the index was computed at — the staleness contract. */
+  head: string;
+  files: CoverageFile[];
+}
+
+export interface StoryAnchor {
+  path: string;
+  symbol?: string;
+  lines?: string;
+  as_of?: string;
+  state?: string;
+}
+
+export interface StoryEdge {
+  title: string;
+  id?: string;
+  type?: string;
+  status?: string;
+}
+
+export interface StoryCitation {
+  label: string;
+  url: string;
+}
+
+export interface StoryHit {
+  id: string;
+  title: string;
+  type: ConceptType;
+  status?: string;
+  happened_on?: string;
+  expired_on?: string;
+  confidence?: string;
+  description: string;
+  hedged: boolean;
+  /** Pre-hedged rationale — always displayed verbatim, never re-derived. */
+  renderedRationale: string;
+  anchors: StoryAnchor[];
+  edges: {
+    becauseOf: StoryEdge[];
+    insteadOf: StoryEdge[];
+    supersededBy: StoryEdge[];
+  };
+  citations: StoryCitation[];
+  evidence: string[];
+  downstream: StoryEdge[];
+}
+
+export interface StoryNearby {
+  id: string;
+  title: string;
+  type: ConceptType;
+  status?: string;
+  anchor: StoryAnchor;
+}
+
+export interface Story {
+  target: { path: string; lines?: LineRange };
+  span?: string;
+  hits: StoryHit[];
+  warnings: StoryHit[];
+  nearby: StoryNearby[];
+}
+
+function fail(payload: string, message: string): never {
+  throw new ContractError(`${payload} payload: ${message}`);
+}
+
+function asRecord(value: unknown, payload: string, what: string): Record<string, unknown> {
+  if (typeof value !== "object" || value === null || Array.isArray(value)) {
+    fail(payload, `${what} must be an object`);
+  }
+  return value as Record<string, unknown>;
+}
+
+function asArray(value: unknown, payload: string, what: string): unknown[] {
+  if (!Array.isArray(value)) fail(payload, `${what} must be an array`);
+  return value;
+}
+
+function asString(value: unknown, payload: string, what: string): string {
+  if (typeof value !== "string") fail(payload, `${what} must be a string`);
+  return value;
+}
+
+function optionalString(value: unknown, payload: string, what: string): string | undefined {
+  if (value === undefined) return undefined;
+  return asString(value, payload, what);
+}
+
+function parseRoot(raw: string, payload: string): Record<string, unknown> {
+  let value: unknown;
+  try {
+    value = JSON.parse(raw);
+  } catch (e) {
+    fail(payload, `not valid JSON — ${e instanceof Error ? e.message : String(e)}`);
+  }
+  const root = asRecord(value, payload, "the payload");
+  const version = root.schemaVersion;
+  if (typeof version !== "number") fail(payload, "missing its schemaVersion");
+  if (version > SUPPORTED_SCHEMA_VERSION) {
+    fail(
+      payload,
+      `schemaVersion ${version} is newer than this extension understands (v${SUPPORTED_SCHEMA_VERSION}) — update the extension`,
+    );
+  }
+  if (version !== SUPPORTED_SCHEMA_VERSION) {
+    fail(payload, `unsupported schemaVersion ${version} (expected ${SUPPORTED_SCHEMA_VERSION})`);
+  }
+  return root;
+}
+
+function parseLineRange(value: unknown, payload: string, what: string): LineRange {
+  const range = asRecord(value, payload, what);
+  const { start, end } = range;
+  if (typeof start !== "number" || typeof end !== "number" || start < 1 || end < 1) {
+    fail(payload, `${what} must carry 1-based start/end numbers`);
+  }
+  return { start, end };
+}
+
+/** Parse `why export ui-index` output (schemas/coverage.schema.json, v1). */
+export function parseCoverage(raw: string): Coverage {
+  const root = parseRoot(raw, "coverage");
+  const head = asString(root.head, "coverage", "head");
+  const files = asArray(root.files, "coverage", "files").map((entry, i) => {
+    const file = asRecord(entry, "coverage", `files[${i}]`);
+    const path = asString(file.path, "coverage", `files[${i}].path`);
+    const spans = asArray(file.spans, "coverage", `${path} spans`).map((s, j) => {
+      const span = asRecord(s, "coverage", `${path} spans[${j}]`);
+      const parsed: CoverageSpan = {
+        conceptId: asString(span.conceptId, "coverage", `${path} span conceptId`),
+        type: asString(span.type, "coverage", `${path} span type`) as ConceptType,
+        glyph: asString(span.glyph, "coverage", `${path} span glyph`) as Glyph,
+      };
+      const status = optionalString(span.status, "coverage", `${path} span status`);
+      if (status !== undefined) parsed.status = status;
+      const confidence = optionalString(span.confidence, "coverage", `${path} span confidence`);
+      if (confidence !== undefined) parsed.confidence = confidence;
+      if (span.lines !== undefined) {
+        parsed.lines = parseLineRange(span.lines, "coverage", `${path} span lines`);
+      }
+      return parsed;
+    });
+    return { path, spans };
+  });
+  return { head, files };
+}
+
+function parseEdges(value: unknown, payload: string, what: string): StoryHit["edges"] {
+  const edges = asRecord(value, payload, what);
+  const group = (key: keyof StoryHit["edges"]): StoryEdge[] =>
+    asArray(edges[key], payload, `${what}.${key}`).map((e, i) => {
+      const edge = asRecord(e, payload, `${what}.${key}[${i}]`);
+      return {
+        title: asString(edge.title, payload, `${what}.${key}[${i}].title`),
+        ...(edge.id !== undefined && { id: asString(edge.id, payload, "edge id") }),
+        ...(edge.type !== undefined && { type: asString(edge.type, payload, "edge type") }),
+        ...(edge.status !== undefined && { status: asString(edge.status, payload, "edge status") }),
+      };
+    });
+  return { becauseOf: group("becauseOf"), insteadOf: group("insteadOf"), supersededBy: group("supersededBy") };
+}
+
+function parseHit(value: unknown, what: string): StoryHit {
+  const hit = asRecord(value, "story", what);
+  if (typeof hit.hedged !== "boolean") fail("story", `${what}.hedged must be a boolean`);
+  const parsed: StoryHit = {
+    id: asString(hit.id, "story", `${what}.id`),
+    title: asString(hit.title, "story", `${what}.title`),
+    type: asString(hit.type, "story", `${what}.type`) as ConceptType,
+    description: asString(hit.description, "story", `${what}.description`),
+    hedged: hit.hedged,
+    renderedRationale: asString(hit.renderedRationale, "story", `${what}.renderedRationale`),
+    anchors: asArray(hit.anchors, "story", `${what}.anchors`).map((a, i) => {
+      const anchor = asRecord(a, "story", `${what}.anchors[${i}]`);
+      return {
+        path: asString(anchor.path, "story", `${what}.anchors[${i}].path`),
+        ...(anchor.symbol !== undefined && { symbol: asString(anchor.symbol, "story", "anchor symbol") }),
+ 
[clipped: diff of vscode-why/src/core/contract.ts in 61a4e85 — showing 8000 of 11401 chars]
````

````diff
diff --git a/vscode-why/src/core/decorations.ts b/vscode-why/src/core/decorations.ts
new file mode 100644
index 0000000..49636e3
--- /dev/null
+++ b/vscode-why/src/core/decorations.ts
@@ -0,0 +1,81 @@
+// Decoration-set computation: coverage spans → per-theme-token line ranges.
+// The per-line treatment mirrors the serve SPA's gutter (ui/app.js
+// stripeClass): expired scar tissue and open questions stand apart, everything
+// else colors by the first covering span's confidence. Colors are VS Code
+// theme color *tokens* (never hex) so every theme renders them natively; the
+// extension layer turns each token into a ThemeColor-backed decoration type.
+
+import type { CoverageSpan, LineRange } from "./contract.js";
+
+/** Treatment → theme color token. Exported so tests pin the vocabulary and
+ * the extension builds exactly one decoration type per token. */
+export const TREATMENT_TOKENS = {
+  expired: "editorWarning.foreground",
+  question: "editorInfo.foreground",
+  recorded: "charts.green",
+  corroborated: "charts.blue",
+  inferred: "charts.yellow",
+  speculative: "descriptionForeground",
+  none: "descriptionForeground",
+} as const;
+
+export type ThemeToken = (typeof TREATMENT_TOKENS)[keyof typeof TREATMENT_TOKENS];
+
+export const ALL_TOKENS: readonly ThemeToken[] = [...new Set(Object.values(TREATMENT_TOKENS))];
+
+/** Spans covering a 1-based line; a span without `lines` is a whole-file
+ * claim and covers every line (same rule as the serve SPA). */
+export function coveringSpans(spans: CoverageSpan[], line: number): CoverageSpan[] {
+  return spans.filter(
+    (span) => span.lines === undefined || (span.lines.start <= line && line <= span.lines.end),
+  );
+}
+
+function treatmentToken(covering: CoverageSpan[]): ThemeToken | undefined {
+  if (covering.length === 0) return undefined;
+  if (covering.some((span) => span.type === "constraint" && span.status === "expired")) {
+    return TREATMENT_TOKENS.expired;
+  }
+  if (covering.some((span) => span.type === "question")) return TREATMENT_TOKENS.question;
+  const confidence = covering[0]!.confidence;
+  switch (confidence) {
+    case "recorded":
+      return TREATMENT_TOKENS.recorded;
+    case "corroborated":
+      return TREATMENT_TOKENS.corroborated;
+    case "inferred":
+      return TREATMENT_TOKENS.inferred;
+    case "speculative":
+      return TREATMENT_TOKENS.speculative;
+    default:
+      return TREATMENT_TOKENS.none;
+  }
+}
+
+/**
+ * Per theme token, the contiguous 1-based inclusive line ranges to decorate
+ * in a file of `lineCount` lines. Lines beyond the open document are dropped:
+ * coverage is computed at HEAD and the buffer may be shorter — painting past
+ * the end would be a silently-wrong mark.
+ */
+export function decorationRanges(
+  spans: CoverageSpan[],
+  lineCount: number,
+): Map<ThemeToken, LineRange[]> {
+  const ranges = new Map<ThemeToken, LineRange[]>();
+  let open: { token: ThemeToken; range: LineRange } | undefined;
+  for (let line = 1; line <= lineCount; line++) {
+    const token = treatmentToken(coveringSpans(spans, line));
+    if (open !== undefined && open.token === token) {
+      open.range.end = line;
+      continue;
+    }
+    open = token === undefined ? undefined : { token, range: { start: line, end: line } };
+    if (open !== undefined) {
+      const list = ranges.get(open.token) ?? [];
+      list.push(open.range);
+      ranges.set(open.token, list);
+    }
+  }
+  return ranges;
+}
````

````diff
diff --git a/vscode-why/src/core/hover.ts b/vscode-why/src/core/hover.ts
new file mode 100644
index 0000000..514c683
--- /dev/null
+++ b/vscode-why/src/core/hover.ts
@@ -0,0 +1,81 @@
+// Hover markdown over the story payload. Dumb renderer rules
+// (docs/ui-contract.md): renderedRationale is displayed verbatim — the hedge
+// prefix is already baked in by the engine — and an expired upstream
+// constraint is never invisible: its warning card renders FIRST, ahead of the
+// hits, downstream blast radius included.
+
+import type { Story, StoryHit } from "./contract.js";
+
+/** Same vocabulary the engine precomputes into coverage spans; the contract
+ * doc says stories derive theirs the same way from type + status. */
+export function glyphFor(type: string, status: string | undefined): string {
+  if (type === "question") return "?";
+  if (status === "expired" || status === "superseded") return "⚠";
+  return "●";
+}
+
+/**
+ * The muted staleness note: coverage/stories were computed at `coverageHead`;
+ * when the checkout's HEAD differs — or cannot be resolved, which is never
+ * treated as fresh — say which sha the data is as of. Data is shown, never
+ * hidden; re-anchoring is the CLI's job, not the extension's.
+ */
+export function stalenessNote(coverageHead: string, currentHead: string | undefined): string | undefined {
+  if (currentHead !== undefined && currentHead === coverageHead) return undefined;
+  return `as of ${coverageHead.slice(0, 7)}`;
+}
+
+/** Escape markdown syntax in engine-supplied text used inside formatting. */
+function escapeMd(text: string): string {
+  return text.replace(/([\\`*_{}[\]()<>#+!|~])/g, "\\$1");
+}
+
+function card(hit: StoryHit): string {
+  const lines: string[] = [];
+  const glyph = glyphFor(hit.type, hit.status);
+  const badges: string[] = [`\`${hit.type}\``];
+  const expired = hit.type === "constraint" && hit.status === "expired";
+  if (expired) {
+    badges.push(`**EXPIRED ${hit.expired_on ?? "(date unknown)"}**`);
+  } else if (hit.status !== undefined) {
+    badges.push(hit.status);
+  }
+  if (hit.type !== "question" && hit.confidence !== undefined) {
+    badges.push(`\`${hit.confidence}\``);
+  }
+  lines.push(`${glyph} **${escapeMd(hit.title)}** · ${badges.join(" · ")}`);
+
+  // Verbatim: the mandatory hedge prefix is already in the data.
+  if (hit.renderedRationale !== "") {
+    lines.push("", hit.renderedRationale);
+  }
+
+  for (const decision of hit.downstream) {
+    lines.push("", `→ downstream decision "${escapeMd(decision.title)}" may now be scar tissue.`);
+  }
+
+  if (hit.citations.length > 0) {
+    lines.push("", hit.citations.map((c) => `[${escapeMd(c.label)}](${c.url})`).join(" · "));
+  }
+  return lines.join("\n");
+}
+
+export interface HoverOptions {
+  /** From stalenessNote(); rendered muted at the end when present. */
+  staleNote?: string;
+}
+
+/**
+ * The hover for a covered line: one markdown card per concept, expired-
+ * upstream warnings first, then the hits. Returns undefined when the story
+ * carries nothing to show — the provider then shows no hover at all.
+ */
+export function hoverMarkdown(story: Story, options: HoverOptions = {}): string | undefined {
+  const cards = [...story.warnings, ...story.hits].map(card);
+  if (cards.length === 0) return undefined;
+  let markdown = cards.join("\n\n---\n\n");
+  if (options.staleNote !== undefined) {
+    markdown += `\n\n*${options.staleNote}*`;
+  }
+  return markdown;
+}
````

````diff
diff --git a/vscode-why/src/core/story-html.ts b/vscode-why/src/core/story-html.ts
new file mode 100644
index 0000000..4e8cf73
--- /dev/null
+++ b/vscode-why/src/core/story-html.ts
@@ -0,0 +1,144 @@
+// The `why: Show Story` webview document: the full story cards for a span,
+// rendered to a self-contained HTML string themed entirely by --vscode-* CSS
+// variables (no hardcoded hex, no external assets).
+//
+// Judged trade (issue 503 asked for the call): the serve SPA's card renderer
+// (ui/story-panel.js) is a DOM function in the root package — reusing it here
+// would mean copying a file across the package boundary into the .vsix at
+// build time, a path that drifts silently from the source it was copied from.
+// This renderer is ~a hundred lines over the same v1 contract, ordered like
+// the hovers (expired-upstream warnings first) so both surfaces tell the same
+// story. Semantics still live in the data: rationale arrives pre-hedged,
+// downstream arrives precomputed.
+
+import type { Story, StoryHit } from "./contract.js";
+import { glyphFor } from "./hover.js";
+
+function escapeHtml(text: string): string {
+  return text
+    .replace(/&/g, "&amp;")
+    .replace(/</g, "&lt;")
+    .replace(/>/g, "&gt;")
+    .replace(/"/g, "&quot;");
+}
+
+function formatTarget(target: Story["target"]): string {
+  if (!target.lines) return target.path;
+  const { start, end } = target.lines;
+  return `${target.path}:${start}${end === start ? "" : `-${end}`}`;
+}
+
+const EDGE_LABELS = [
+  ["becauseOf", "because of"],
+  ["insteadOf", "instead of"],
+  ["supersededBy", "superseded by"],
+] as const;
+
+function badge(className: string, text: string): string {
+  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
+}
+
+function card(hit: StoryHit, isWarning: boolean): string {
+  const expired = hit.type === "constraint" && hit.status === "expired";
+  const classes = ["card", `type-${hit.type}`];
+  if (expired) classes.push("expired");
+  if (isWarning) classes.push("warning");
+
+  const head: string[] = [
+    `<span class="glyph">${escapeHtml(glyphFor(hit.type, hit.status))}</span>`,
+    `<strong>${escapeHtml(hit.title)}</strong>`,
+    badge("type", hit.type),
+  ];
+  if (expired) {
+    head.push(badge("loud", `EXPIRED ${hit.expired_on ?? "(date unknown)"}`));
+  } else if (hit.status !== undefined) {
+    head.push(badge("status", hit.status));
+  }
+  if (hit.happened_on !== undefined) head.push(badge("date", hit.happened_on));
+  if (hit.type !== "question" && hit.confidence !== undefined) {
+    head.push(badge("conf", hit.confidence));
+  }
+
+  const body: string[] = [`<header>${head.join(" ")}</header>`];
+  // Verbatim: the mandatory hedge prefix is already in the data.
+  if (hit.renderedRationale !== "") {
+    body.push(`<p class="rationale">${escapeHtml(hit.renderedRationale)}</p>`);
+  }
+  for (const [key, label] of EDGE_LABELS) {
+    const edges = hit.edges[key];
+    if (edges.length === 0) continue;
+    const items = edges
+      .map((edge) => {
+        const suffix =
+          edge.type === undefined ? "" : ` (${edge.type}${edge.status === undefined ? "" : ` — ${edge.status}`})`;
+        return `<li>${escapeHtml(edge.title + suffix)}</li>`;
+      })
+      .join("");
+    body.push(`<div class="edges"><span class="edge-label">${label}</span><ul>${items}</ul></div>`);
+  }
+  for (const decision of hit.downstream) {
+    body.push(`<p class="scar">→ downstream decision "${escapeHtml(decision.title)}" may now be scar tissue.</p>`);
+  }
+  if (hit.citations.length > 0) {
+    const items = hit.citations
+      .map((c) => `<li><a href="${escapeHtml(c.url)}">${escapeHtml(c.label)}</a></li>`)
+      .join("");
+    body.push(`<ul class="citations">${items}</ul>`);
+  }
+  return `<article class="${classes.join(" ")}">${body.join("")}</article>`;
+}
+
+const STYLE = `
+  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1rem 1rem; }
+  h2 { font-size: 1.1em; }
+  .card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0.75rem 0; }
+  .card.expired { border-color: var(--vscode-editorWarning-foreground); }
+  .badge { border: 1px solid var(--vscode-panel-border); border-radius: 3px; padding: 0 0.3em; font-size: 0.85em; }
+  .badge.loud { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); font-weight: bold; }
+  .scar { color: var(--vscode-editorWarning-foreground); }
+  .rationale { margin: 0.5rem 0; }
+  .edges { font-size: 0.9em; } .edges ul { margin: 0.1rem 0 0.4rem; }
+  .edge-label { color: var(--vscode-descriptionForeground); }
+  .citations { font-size: 0.9em; }
+  a { color: var(--vscode-textLink-foreground); }
+  .stale, .empty, .nearby-head { color: var(--vscode-descriptionForeground); }
+`;
+
+export interface StoryHtmlOptions {
+  /** From stalenessNote(); rendered muted under the heading when present. */
+  staleNote?: string;
+}
+
+/** Render one story payload as a full webview HTML document. */
+export function renderStoryHtml(story: Story, options: StoryHtmlOptions = {}): string {
+  const parts: string[] = [];
+  parts.push(`<h2>${escapeHtml(story.span ?? formatTarget(story.target))}</h2>`);
+  if (options.staleNote !== undefined) {
+    parts.push(`<p class="stale"><em>${escapeHtml(options.staleNote)}</em></p>`);
+  }
+  if (story.hits.length === 0) {
+    parts.push(`<p class="empty">No concepts anchor ${escapeHtml(formatTarget(story.target))}.</p>`);
+  }
+  // Same ordering as the hovers: an expired upstream constraint warns first.
+  for (const warning of story.warnings) parts.push(card(warning, true));
+  for (const hit of story.hits) parts.push(card(hit, false));
+  if (story.hits.length === 0 && story.nearby.length > 0) {
+    parts.push(`<h3 class="nearby-head">Anchored concepts nearby (nearest first)</h3>`);
+    const items = story.nearby
+      .map((near) => {
+        const anchor = near.anchor.lines === undefined ? near.anchor.path : `${near.anchor.path}:${near.anchor.lines}`;
+        return `<li>${escapeHtml(`${glyphFor(near.type, near.status)} ${near.title} — ${near.type} · ${anchor}`)}</li>`;
+      })
+      .join("");
+    parts.push(`<ul class="nearby">${items}</ul>`);
+  }
+  return [
+    "<!doctype html>",
+    '<html><head><meta charset="utf-8">',
+    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`,
+    `<style>${STYLE}</style>`,
+    "</head><body>",
+    ...parts,
+    "</body></html>",
+  ].join("\n");
+}
````

````diff
diff --git a/vscode-why/src/extension.ts b/vscode-why/src/extension.ts
new file mode 100644
index 0000000..82ee5fc
--- /dev/null
+++ b/vscode-why/src/extension.ts
@@ -0,0 +1,238 @@
+// The VS Code layer: wiring only. Every semantic decision — hedging, glyphs,
+// staleness, treatment precedence — lives in src/core/ (unit-tested without
+// electron) or upstream in the `why` engine. This file shells out to the CLI
+// (`why export ui-index`, `why blame --json`) with the workspace root as cwd
+// and paints/renders what comes back.
+
+import { execFile } from "node:child_process";
+import { existsSync, statSync } from "node:fs";
+import * as path from "node:path";
+import * as vscode from "vscode";
+import { locateWhyCli, type CliLocation } from "./core/cli-locate.js";
+import { parseCoverage, parseStory, type Coverage, type CoverageSpan, type Story } from "./core/contract.js";
+import { ALL_TOKENS, coveringSpans, decorationRanges, type ThemeToken } from "./core/decorations.js";
+import { hoverMarkdown, stalenessNote } from "./core/hover.js";
+import { renderStoryHtml } from "./core/story-html.js";
+
+const REFRESH_DEBOUNCE_MS = 300;
+
+function isFile(candidate: string): boolean {
+  try {
+    return statSync(candidate).isFile();
+  } catch {
+    return false;
+  }
+}
+
+function run(command: string, args: string[], cwd: string): Promise<string> {
+  return new Promise((resolve, reject) => {
+    execFile(
+      command,
+      args,
+      // .cmd shims on Windows only execute through a shell.
+      { cwd, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" },
+      (error, stdout, stderr) => {
+        if (error) reject(new Error(`${path.basename(command)} ${args.join(" ")}: ${stderr || error.message}`));
+        else resolve(stdout);
+      },
+    );
+  });
+}
+
+class WhyExtension implements vscode.Disposable {
+  private readonly disposables: vscode.Disposable[] = [];
+  private readonly decorationTypes = new Map<ThemeToken, vscode.TextEditorDecorationType>();
+  private readonly output = vscode.window.createOutputChannel("why");
+  private readonly storyCache = new Map<string, Story>();
+  private coverage: Coverage | undefined;
+  private currentHead: string | undefined;
+  private cliMissingNotified = false;
+  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
+
+  constructor(private readonly root: string) {
+    for (const token of ALL_TOKENS) {
+      // A subtle gutter-side stripe per covered span; ThemeColor keeps every
+      // color a theme token (issue 503: no hardcoded hex).
+      this.decorationTypes.set(
+        token,
+        vscode.window.createTextEditorDecorationType({
+          isWholeLine: true,
+          borderWidth: "0 0 0 2px",
+          borderStyle: "solid",
+          borderColor: new vscode.ThemeColor(token),
+          overviewRulerColor: new vscode.ThemeColor(token),
+          overviewRulerLane: vscode.OverviewRulerLane.Left,
+        }),
+      );
+    }
+  }
+
+  private locateCli(): CliLocation | undefined {
+    const setting = vscode.workspace.getConfiguration("why").get<string>("cliPath");
+    const located = locateWhyCli({
+      workspaceRoot: this.root,
+      pathEnv: process.env.PATH,
+      settingPath: setting,
+      platform: process.platform,
+      isFile,
+    });
+    if (located === undefined && !this.cliMissingNotified) {
+      // One non-modal message per session, then silence (issue 503).
+      this.cliMissingNotified = true;
+      void vscode.window.showInformationMessage(
+        "why: CLI not found (looked in node_modules/.bin, PATH, and the why.cliPath setting) — annotations disabled until it is installed.",
+      );
+    }
+    return located;
+  }
+
+  private async why(args: string[]): Promise<string | undefined> {
+    const cli = this.locateCli();
+    if (cli === undefined) return undefined;
+    return run(cli.command, args, this.root);
+  }
+
+  /** Repo-relative forward-slash path for a document, or undefined when the
+   * document lives outside this workspace root. */
+  private relPath(document: vscode.TextDocument): string | undefined {
+    if (document.uri.scheme !== "file") return undefined;
+    const rel = path.relative(this.root, document.uri.fsPath);
+    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
+    return rel.split(path.sep).join("/");
+  }
+
+  private spansFor(document: vscode.TextDocument): CoverageSpan[] {
+    const rel = this.relPath(document);
+    if (rel === undefined || this.coverage === undefined) return [];
+    return this.coverage.files.find((f) => f.path === rel)?.spans ?? [];
+  }
+
+  private paint(editor: vscode.TextEditor): void {
+    const ranges = decorationRanges(this.spansFor(editor.document), editor.document.lineCount);
+    for (const [token, type] of this.decorationTypes) {
+      const lineRanges = ranges.get(token) ?? [];
+      editor.setDecorations(
+        type,
+        lineRanges.map((r) => new vscode.Range(r.start - 1, 0, r.end - 1, 0)),
+      );
+    }
+  }
+
+  async refresh(): Promise<void> {
+    this.storyCache.clear();
+    try {
+      const raw = await this.why(["export", "ui-index"]);
+      if (raw === undefined) return; // CLI missing — already notified once
+      this.coverage = parseCoverage(raw);
+    } catch (e) {
+      // An unexportable bundle (no HEAD, contract mismatch) must not paint
+      // stale marks as if they were current.
+      this.coverage = undefined;
+      this.output.appendLine(`refresh failed: ${e instanceof Error ? e.message : String(e)}`);
+    }
+    try {
+      this.currentHead = (await run("git", ["rev-parse", "HEAD"], this.root)).trim();
+    } catch {
+      this.currentHead = undefined; // unverifiable — stalenessNote treats it as never fresh
+    }
+    for (const editor of vscode.window.visibleTextEditors) this.paint(editor);
+  }
+
+  private scheduleRefresh(): void {
+    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
+    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
+  }
+
+  private async storyFor(rel: string, line: number): Promise<Story | undefined> {
+    const key = `${rel}:${line}`;
+    const cached = this.storyCache.get(key);
+    if (cached !== undefined) return cached;
+    try {
+      const raw = await this.why(["blame", `${rel}:${line}`, "--json"]);
+      if (raw === undefined) return undefined;
+      const story = parseStory(raw);
+      this.storyCache.set(key, story);
+      return story;
+    } catch (e) {
+      this.output.appendLine(`blame ${rel}:${line} failed: ${e instanceof Error ? e.message : String(e)}`);
+      return undefined;
+    }
+  }
+
+  private staleNote(): string | undefined {
+    if (this.coverage === undefined) return undefined;
+    return stalenessNote(this.coverage.head, this.currentHead);
+  }
+
+  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
+    const rel = this.relPath(document);
+    if (rel === undefined) return undefined;
+    const line = position.line + 1;
+    if (coveringSpans(this.spansFor(document), line).length === 0) return undefined;
+    const story = await this.storyFor(rel, line);
+    if (story === undefined) return undefined;
+    const markdownText = hoverMarkdown(story, { staleNote: this.staleNote() });
+    if (markdownText === undefined) return undefined;
+    return new vscode.Hover(new vscode.MarkdownString(markdownText));
+  }
+
+  async showStory(): Promise<void> {
+    const editor = vscode.window.activeTextEditor;
+    if (editor === undefined) return;
+    const rel = this.relPath(editor.document);
+    if (rel === undefined) return;
+    const line = editor.selection.active.line + 1;
+    const story = await this.storyFor(rel, line);
+    if (story === undefined) return;
+    const panel = vscode.window.createWebviewPanel(
+      "whyStory",
+      `why: ${rel}:${line}`,
+      vscode.ViewColu
[clipped: diff of vscode-why/src/extension.ts in 61a4e85 — showing 8000 of 9961 chars]
````

````diff
diff --git a/vscode-why/test-integration/run.ts b/vscode-why/test-integration/run.ts
new file mode 100644
index 0000000..6d63037
--- /dev/null
+++ b/vscode-why/test-integration/run.ts
@@ -0,0 +1,29 @@
+// Extension-host integration run (issue 503): downloads VS Code via
+// @vscode/test-electron and boots the extension against a throwaway workspace
+// carrying a minimal .why/ bundle. Requires a display server (xvfb in CI) and
+// network access — deliberately NOT part of `npm run verify`; run it with
+// `npm run test:integration`.
+
+import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import * as path from "node:path";
+import { runTests } from "@vscode/test-electron";
+
+async function main(): Promise<void> {
+  const workspace = await mkdtemp(path.join(tmpdir(), "vscode-why-it-"));
+  await mkdir(path.join(workspace, ".why"), { recursive: true });
+  await writeFile(path.join(workspace, ".why", "index.md"), "# why\n", "utf8");
+
+  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
+  const extensionTestsPath = path.resolve(__dirname, "suite");
+  await runTests({
+    extensionDevelopmentPath,
+    extensionTestsPath,
+    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust"],
+  });
+}
+
+main().catch((e) => {
+  console.error("integration tests failed:", e);
+  process.exitCode = 1;
+});
````

````diff
diff --git a/vscode-why/test-integration/suite.ts b/vscode-why/test-integration/suite.ts
new file mode 100644
index 0000000..0b4bc98
--- /dev/null
+++ b/vscode-why/test-integration/suite.ts
@@ -0,0 +1,23 @@
+// The module @vscode/test-electron loads inside the extension host. Plain
+// asserts, no mocha: run() resolving means the suite passed.
+
+import assert from "node:assert/strict";
+import * as vscode from "vscode";
+
+export async function run(): Promise<void> {
+  // The workspace carries .why/, so workspaceContains should have activated
+  // us — but activate explicitly to fail loudly rather than racily.
+  const extension = vscode.extensions.getExtension("copperbox.vscode-why");
+  assert.ok(extension, "extension copperbox.vscode-why not found in the host");
+  await extension.activate();
+  assert.ok(extension.isActive, "extension failed to activate on a .why/ workspace");
+
+  const commands = await vscode.commands.getCommands(true);
+  for (const command of ["why.showStory", "why.refresh"]) {
+    assert.ok(commands.includes(command), `command ${command} not registered`);
+  }
+
+  // No why CLI is installed in the throwaway workspace: refresh must degrade
+  // to the one-per-session notice, never throw.
+  await vscode.commands.executeCommand("why.refresh");
+}
````

````diff
diff --git a/vscode-why/test/cli-locate.test.ts b/vscode-why/test/cli-locate.test.ts
new file mode 100644
index 0000000..e9d129d
--- /dev/null
+++ b/vscode-why/test/cli-locate.test.ts
@@ -0,0 +1,63 @@
+// CLI discovery order (issue 503): workspace node_modules/.bin, then PATH,
+// then the why.cliPath setting — pinned with an injected existence probe.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { delimiter, join, sep } from "node:path";
+import { locateWhyCli, type LocateOptions } from "../src/core/cli-locate.ts";
+
+const WS = sep === "/" ? "/repo" : "C:\\repo";
+const BIN = join(WS, "node_modules", ".bin", "why");
+const PATH_DIRS = [join(WS, "irrelevant"), sep === "/" ? "/usr/local/bin" : "C:\\tools"];
+const ON_PATH = join(PATH_DIRS[1]!, "why");
+const SETTING = sep === "/" ? "/opt/why/bin/why" : "C:\\opt\\why.exe";
+
+function options(existing: string[], overrides: Partial<LocateOptions> = {}): LocateOptions {
+  const files = new Set(existing);
+  return {
+    workspaceRoot: WS,
+    pathEnv: PATH_DIRS.join(delimiter),
+    settingPath: SETTING,
+    platform: process.platform,
+    isFile: (candidate) => files.has(candidate),
+    ...overrides,
+  };
+}
+
+test("workspace node_modules/.bin wins over PATH and the setting", () => {
+  const located = locateWhyCli(options([BIN, ON_PATH, SETTING]));
+  assert.deepEqual(located, { command: BIN, source: "workspace" });
+});
+
+test("PATH is second: consulted only when node_modules/.bin has no why", () => {
+  const located = locateWhyCli(options([ON_PATH, SETTING]));
+  assert.deepEqual(located, { command: ON_PATH, source: "path" });
+});
+
+test("the why.cliPath setting is the last resort", () => {
+  const located = locateWhyCli(options([SETTING]));
+  assert.deepEqual(located, { command: SETTING, source: "setting" });
+});
+
+test("nothing found → undefined (the caller notifies once, then goes silent)", () => {
+  assert.equal(locateWhyCli(options([])), undefined);
+  assert.equal(locateWhyCli(options([], { pathEnv: undefined, settingPath: undefined })), undefined);
+});
+
+test("an empty cliPath setting is skipped, not probed as a file", () => {
+  let probedEmpty = false;
+  const opts = options([], { settingPath: "" });
+  const probe = opts.isFile;
+  opts.isFile = (candidate) => {
+    if (candidate === "") probedEmpty = true;
+    return probe(candidate);
+  };
+  assert.equal(locateWhyCli(opts), undefined);
+  assert.equal(probedEmpty, false);
+});
+
+test("on win32 the .cmd shim in node_modules/.bin is found", () => {
+  const cmd = join(WS, "node_modules", ".bin", "why.cmd");
+  const located = locateWhyCli(options([cmd], { platform: "win32" }));
+  assert.deepEqual(located, { command: cmd, source: "workspace" });
+});
````

````diff
diff --git a/vscode-why/test/contract.test.ts b/vscode-why/test/contract.test.ts
new file mode 100644
index 0000000..126db2f
--- /dev/null
+++ b/vscode-why/test/contract.test.ts
@@ -0,0 +1,100 @@
+// Contract parsing (issue 503): the fixture payloads are copies of the
+// validated examples in the root repo's docs/ui-contract.md. When that doc is
+// reachable (i.e. these tests run inside the why repo), its examples are also
+// parsed directly so a contract change cannot silently strand the fixtures.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { existsSync, readFileSync } from "node:fs";
+import { join } from "node:path";
+import { ContractError, parseCoverage, parseStory } from "../src/core/contract.ts";
+
+const here = __dirname;
+const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");
+
+test("coverage fixture parses: head + per-file spans, whole-file spans line-less", () => {
+  const coverage = parseCoverage(fixture("coverage.json"));
+  assert.equal(coverage.head, "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c");
+  assert.deepEqual(
+    coverage.files.map((f) => f.path),
+    ["config/defaults.toml", "src/lock.rs"],
+  );
+  const lock = coverage.files[1]!;
+  assert.equal(lock.spans[0]!.conceptId, "incidents/2024-03-lock-stall");
+  assert.equal(lock.spans[0]!.lines, undefined, "a whole-file claim has no lines");
+  assert.deepEqual(lock.spans[1]!.lines, { start: 41, end: 58 });
+  assert.equal(lock.spans[1]!.glyph, "●");
+  assert.equal(lock.spans[1]!.confidence, "recorded");
+});
+
+test("story fixture parses: hits, the expired warning with its blast radius, citations", () => {
+  const story = parseStory(fixture("story.json"));
+  assert.equal(story.target.path, "src/lock.rs");
+  assert.deepEqual(story.target.lines, { start: 47, end: 47 });
+  assert.equal(story.span, "src/lock.rs:41-58 · acquire_shared");
+  assert.equal(story.hits[0]!.id, "decisions/queue-based-locking");
+  assert.equal(story.hits[0]!.hedged, false);
+  assert.equal(story.hits[0]!.edges.becauseOf[0]!.title, "2024-03 lock stall");
+  const acme = story.warnings[0]!;
+  assert.equal(acme.id, "constraints/acme-45s-timeout");
+  assert.equal(acme.expired_on, "2025-06-30");
+  assert.equal(acme.downstream[0]!.id, "decisions/47s-request-deadline");
+  assert.equal(acme.citations[0]!.url, "https://github.com/acme/harbor/issues/612");
+});
+
+test("the fixtures have not drifted from docs/ui-contract.md's examples", (t) => {
+  const doc = join(here, "..", "..", "docs", "ui-contract.md");
+  if (!existsSync(doc)) {
+    t.skip("running outside the why repo — the root ui-contract tests own the doc");
+    return;
+  }
+  const blocks = [...readFileSync(doc, "utf8").matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
+    JSON.parse(m[1]!),
+  );
+  const docStory = blocks.find((b) => Array.isArray(b.hits));
+  const docCoverage = blocks.find((b) => Array.isArray(b.files) && b.files[0]?.spans !== undefined);
+  assert.ok(docStory && docCoverage, "ui-contract.md no longer carries story/coverage examples");
+  assert.deepEqual(JSON.parse(fixture("story.json")), docStory, "fixtures/story.json drifted from the doc");
+  assert.deepEqual(JSON.parse(fixture("coverage.json")), docCoverage, "fixtures/coverage.json drifted from the doc");
+  // And the doc's examples parse through the same code path the extension uses.
+  parseStory(JSON.stringify(docStory));
+  parseCoverage(JSON.stringify(docCoverage));
+});
+
+test("a schemaVersion above 1 is said out loud, never guessed at", () => {
+  const newer = JSON.stringify({ ...JSON.parse(fixture("coverage.json")), schemaVersion: 2 });
+  assert.throws(() => parseCoverage(newer), (e: unknown) => {
+    assert.ok(e instanceof ContractError);
+    assert.match(e.message, /schemaVersion 2 is newer.*update the extension/);
+    return true;
+  });
+  const newerStory = JSON.stringify({ ...JSON.parse(fixture("story.json")), schemaVersion: 3 });
+  assert.throws(() => parseStory(newerStory), ContractError);
+});
+
+test("malformed payloads are ContractErrors, not silently-wrong renders", () => {
+  assert.throws(() => parseCoverage("not json"), ContractError);
+  assert.throws(() => parseCoverage(JSON.stringify({ files: [] })), ContractError, "missing schemaVersion");
+  assert.throws(
+    () => parseCoverage(JSON.stringify({ schemaVersion: 1, files: [] })),
+    ContractError,
+    "missing head",
+  );
+  assert.throws(
+    () =>
+      parseCoverage(
+        JSON.stringify({
+          schemaVersion: 1,
+          head: "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c",
+          files: [{ path: "a.rs", spans: [{ conceptId: "x" }] }],
+        }),
+      ),
+    ContractError,
+    "span without type/glyph",
+  );
+  assert.throws(
+    () => parseStory(JSON.stringify({ schemaVersion: 1, target: { path: "a.rs" }, hits: [{}], warnings: [], nearby: [] })),
+    ContractError,
+    "hit missing required fields",
+  );
+});
````

````diff
diff --git a/vscode-why/test/decorations.test.ts b/vscode-why/test/decorations.test.ts
new file mode 100644
index 0000000..66894d6
--- /dev/null
+++ b/vscode-why/test/decorations.test.ts
@@ -0,0 +1,76 @@
+// Decoration-set computation from coverage fixtures (issue 503): per-line
+// treatment mirrors the serve SPA's gutter, colors are theme tokens only,
+// and no mark may extend past the open document.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { join } from "node:path";
+import { parseCoverage, type CoverageSpan } from "../src/core/contract.ts";
+import {
+  ALL_TOKENS,
+  coveringSpans,
+  decorationRanges,
+  TREATMENT_TOKENS,
+} from "../src/core/decorations.ts";
+
+const here = __dirname;
+const coverage = parseCoverage(readFileSync(join(here, "fixtures", "coverage.json"), "utf8"));
+const spansOf = (path: string) => coverage.files.find((f) => f.path === path)!.spans;
+
+test("theme tokens only — the vocabulary carries no hardcoded colors", () => {
+  for (const token of ALL_TOKENS) {
+    assert.match(token, /^[a-zA-Z.]+$/, `${token} must be a theme color token, not a color value`);
+    assert.ok(!token.startsWith("#"), token);
+  }
+});
+
+test("defaults.toml: the decision span colors corroborated, the question line stands apart", () => {
+  const ranges = decorationRanges(spansOf("config/defaults.toml"), 40);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.corroborated), [{ start: 22, end: 24 }]);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.question), [{ start: 31, end: 31 }]);
+  assert.equal(ranges.get(TREATMENT_TOKENS.expired), undefined);
+});
+
+test("lock.rs: the whole-file incident covers every line; 41-58 overlaps it", () => {
+  const ranges = decorationRanges(spansOf("src/lock.rs"), 80);
+  // The whole-file incident (recorded) is first everywhere, so the whole
+  // file paints recorded — one contiguous range, mirroring the SPA where the
+  // first covering span's confidence wins.
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.recorded), [{ start: 1, end: 80 }]);
+  assert.equal(coveringSpans(spansOf("src/lock.rs"), 47).length, 2, "line 47 is covered by both spans");
+  assert.equal(coveringSpans(spansOf("src/lock.rs"), 5).length, 1, "line 5 only by the whole-file claim");
+});
+
+test("an expired constraint span outranks confidence coloring on its lines", () => {
+  const spans: CoverageSpan[] = [
+    { conceptId: "d", type: "decision", glyph: "●", status: "active", confidence: "recorded", lines: { start: 1, end: 10 } },
+    { conceptId: "c", type: "constraint", glyph: "⚠", status: "expired", lines: { start: 4, end: 6 } },
+  ];
+  const ranges = decorationRanges(spans, 10);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.expired), [{ start: 4, end: 6 }]);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.recorded), [
+    { start: 1, end: 3 },
+    { start: 7, end: 10 },
+  ]);
+});
+
+test("spans past the end of a shorter buffer are clipped, never painted wrong", () => {
+  const spans: CoverageSpan[] = [
+    { conceptId: "d", type: "decision", glyph: "●", confidence: "inferred", lines: { start: 8, end: 20 } },
+  ];
+  const ranges = decorationRanges(spans, 10);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.inferred), [{ start: 8, end: 10 }]);
+});
+
+test("a span with no confidence falls back to the muted token", () => {
+  const spans: CoverageSpan[] = [
+    { conceptId: "q", type: "attempt", glyph: "●", status: "failed", lines: { start: 2, end: 3 } },
+  ];
+  const ranges = decorationRanges(spans, 5);
+  assert.deepEqual(ranges.get(TREATMENT_TOKENS.none), [{ start: 2, end: 3 }]);
+});
+
+test("no covering spans → no ranges at all", () => {
+  assert.equal(decorationRanges([], 100).size, 0);
+});
````

````diff
diff --git a/vscode-why/test/fixtures/coverage.json b/vscode-why/test/fixtures/coverage.json
new file mode 100644
index 0000000..e7c104e
--- /dev/null
+++ b/vscode-why/test/fixtures/coverage.json
@@ -0,0 +1,46 @@
+{
+  "schemaVersion": 1,
+  "head": "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c",
+  "files": [
+    {
+      "path": "config/defaults.toml",
+      "spans": [
+        {
+          "conceptId": "decisions/47s-request-deadline",
+          "type": "decision",
+          "glyph": "●",
+          "status": "active",
+          "confidence": "corroborated",
+          "lines": { "start": 22, "end": 24 }
+        },
+        {
+          "conceptId": "questions/why-retry-jitter-disabled",
+          "type": "question",
+          "glyph": "?",
+          "status": "open",
+          "lines": { "start": 31, "end": 31 }
+        }
+      ]
+    },
+    {
+      "path": "src/lock.rs",
+      "spans": [
+        {
+          "conceptId": "incidents/2024-03-lock-stall",
+          "type": "incident",
+          "glyph": "●",
+          "status": "resolved",
+          "confidence": "recorded"
+        },
+        {
+          "conceptId": "decisions/queue-based-locking",
+          "type": "decision",
+          "glyph": "●",
+          "status": "active",
+          "confidence": "recorded",
+          "lines": { "start": 41, "end": 58 }
+        }
+      ]
+    }
+  ]
+}
````

````diff
diff --git a/vscode-why/test/fixtures/story.json b/vscode-why/test/fixtures/story.json
new file mode 100644
index 0000000..c768854
--- /dev/null
+++ b/vscode-why/test/fixtures/story.json
@@ -0,0 +1,59 @@
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
````

````diff
diff --git a/vscode-why/test/hover.test.ts b/vscode-why/test/hover.test.ts
new file mode 100644
index 0000000..3739149
--- /dev/null
+++ b/vscode-why/test/hover.test.ts
@@ -0,0 +1,106 @@
+// Hover markdown + staleness-note logic (issue 503 acceptance): the hedge
+// prefix arrives pre-baked in renderedRationale and must survive verbatim,
+// and an expired-upstream warning renders FIRST, ahead of the hits.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { join } from "node:path";
+import { parseStory, type Story, type StoryHit } from "../src/core/contract.ts";
+import { glyphFor, hoverMarkdown, stalenessNote } from "../src/core/hover.ts";
+
+const here = __dirname;
+const story = parseStory(readFileSync(join(here, "fixtures", "story.json"), "utf8"));
+
+const HEAD = "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c";
+
+test("staleness: same HEAD → no note; a moved or unresolvable HEAD → muted as-of note", () => {
+  assert.equal(stalenessNote(HEAD, HEAD), undefined);
+  assert.equal(stalenessNote(HEAD, "0000000000000000000000000000000000000000"), "as of 8b7d3f0");
+  // Unverifiable is never fresh: no resolvable current HEAD still notes the sha.
+  assert.equal(stalenessNote(HEAD, undefined), "as of 8b7d3f0");
+});
+
+test("the expired-upstream warning renders before the hit, blast radius included", () => {
+  const md = hoverMarkdown(story)!;
+  const warning = md.indexOf("Acme 45s gateway timeout");
+  const hit = md.indexOf("Queue-based locking");
+  assert.ok(warning >= 0 && hit >= 0, md);
+  assert.ok(warning < hit, "expired-upstream warning must come first");
+  assert.ok(md.includes("EXPIRED 2025-06-30"), md);
+  assert.ok(md.includes('downstream decision "47s request deadline" may now be scar tissue'), md);
+  assert.ok(md.indexOf("⚠") < md.indexOf("●"), "status glyphs lead their cards");
+});
+
+test("cards carry glyph, title, confidence badge, verbatim rationale, citation links", () => {
+  const md = hoverMarkdown(story)!;
+  assert.ok(md.includes("`recorded`"), "confidence badge");
+  assert.ok(
+    md.includes("Serialize all shard mutations through a single ordered command queue instead of striped RwLocks."),
+    "renderedRationale verbatim",
+  );
+  assert.ok(md.includes("](https://github.com/acme/harbor/pull/212)"), "citation link");
+  assert.ok(md.includes("](https://github.com/acme/harbor/issues/612)"), "warning citation link");
+});
+
+test("a hedged hit's mandatory hedge prefix survives verbatim — never re-derived", () => {
+  const hedged: Story = {
+    target: { path: "src/cache.rs", lines: { start: 3, end: 3 } },
+    hits: [
+      {
+        id: "decisions/cache-shard-sizing",
+        title: "Cache sized to one shard",
+        type: "decision",
+        status: "active",
+        confidence: "inferred",
+        description: "The cache is sized to fit one shard.",
+        hedged: true,
+        renderedRationale: "likely — The cache is sized to fit one shard.",
+        anchors: [],
+        edges: { becauseOf: [], insteadOf: [], supersededBy: [] },
+        citations: [],
+        evidence: [],
+        downstream: [],
+      },
+    ],
+    warnings: [],
+    nearby: [],
+  };
+  const md = hoverMarkdown(hedged)!;
+  assert.ok(md.includes("likely — The cache is sized to fit one shard."), md);
+});
+
+test("the staleness note lands muted at the end when supplied", () => {
+  const fresh = hoverMarkdown(story)!;
+  assert.ok(!fresh.includes("as of"), "no note when none supplied");
+  const stale = hoverMarkdown(story, { staleNote: stalenessNote(HEAD, undefined) })!;
+  assert.ok(stale.endsWith("*as of 8b7d3f0*"), stale.slice(-60));
+});
+
+test("questions render the ? glyph and no confidence badge", () => {
+  const question: StoryHit = {
+    id: "questions/why-retry-jitter-disabled",
+    title: "Why is retry jitter disabled?",
+    type: "question",
+    status: "open",
+    description: "",
+    hedged: false,
+    renderedRationale: "",
+    anchors: [],
+    edges: { becauseOf: [], insteadOf: [], supersededBy: [] },
+    citations: [],
+    evidence: [],
+    downstream: [],
+  };
+  assert.equal(glyphFor("question", "open"), "?");
+  const md = hoverMarkdown({ target: { path: "config/defaults.toml" }, hits: [question], warnings: [], nearby: [] })!;
+  assert.ok(md.startsWith("? **Why is retry jitter disabled?"), md);
+  assert.ok(!md.includes("`recorded`") && !md.includes("`inferred`"), "no confidence badge on a question");
+});
+
+test("an empty story yields no hover at all", () => {
+  assert.equal(
+    hoverMarkdown({ target: { path: "a.rs" }, hits: [], warnings: [], nearby: [] }),
+    undefined,
+  );
+});
````

````diff
diff --git a/vscode-why/test/story-html.test.ts b/vscode-why/test/story-html.test.ts
new file mode 100644
index 0000000..4fe8471
--- /dev/null
+++ b/vscode-why/test/story-html.test.ts
@@ -0,0 +1,61 @@
+// The Show Story webview document: same contract, same ordering as hovers,
+// themed by --vscode-* variables only, all engine text HTML-escaped.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { join } from "node:path";
+import { parseStory, type Story } from "../src/core/contract.ts";
+import { renderStoryHtml } from "../src/core/story-html.ts";
+
+const here = __dirname;
+const story = parseStory(readFileSync(join(here, "fixtures", "story.json"), "utf8"));
+
+test("story cards render with the warning first, EXPIRED badge, scar line, citations", () => {
+  const html = renderStoryHtml(story);
+  assert.ok(html.includes("src/lock.rs:41-58 · acquire_shared"), "span heading");
+  const warning = html.indexOf("Acme 45s gateway timeout");
+  const hit = html.indexOf("Queue-based locking");
+  assert.ok(warning >= 0 && hit >= 0 && warning < hit, "warning card first, like the hovers");
+  assert.ok(html.includes("EXPIRED 2025-06-30"), html.slice(0, 400));
+  assert.ok(html.includes("may now be scar tissue"));
+  assert.ok(html.includes('href="https://github.com/acme/harbor/pull/212"'));
+  assert.ok(html.includes("likely — ") === false, "this fixture is unhedged; nothing invents a hedge");
+});
+
+test("colors come from --vscode-* theme variables, never hardcoded hex", () => {
+  const html = renderStoryHtml(story);
+  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
+  assert.ok(style !== undefined && style.includes("var(--vscode-"), "theme variables in use");
+  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(style), "no hex colors in the stylesheet");
+});
+
+test("engine-supplied text is escaped — a hostile title cannot script the webview", () => {
+  const hostile: Story = JSON.parse(JSON.stringify(story));
+  hostile.hits[0]!.title = '<script>alert("x")</script>';
+  const html = renderStoryHtml(hostile);
+  assert.ok(!html.includes('<script>alert("x")</script>'), "raw script tag must not survive");
+  assert.ok(html.includes("&lt;script&gt;"), "escaped instead");
+});
+
+test("uncovered target: honest empty line plus the nearby fallback list", () => {
+  const uncovered: Story = {
+    target: { path: "src/new.rs", lines: { start: 1, end: 1 } },
+    hits: [],
+    warnings: [],
+    nearby: [
+      {
+        id: "decisions/queue-based-locking",
+        title: "Queue-based locking",
+        type: "decision",
+        status: "active",
+        anchor: { path: "src/lock.rs", lines: "41-58" },
+      },
+    ],
+  };
+  const html = renderStoryHtml(uncovered, { staleNote: "as of 8b7d3f0" });
+  assert.ok(html.includes("No concepts anchor src/new.rs:1"), html);
+  assert.ok(html.includes("Anchored concepts nearby"));
+  assert.ok(html.includes("src/lock.rs:41-58"));
+  assert.ok(html.includes("<em>as of 8b7d3f0</em>"), "muted staleness note in the panel too");
+});
````

````diff
diff --git a/vscode-why/tsconfig.build.json b/vscode-why/tsconfig.build.json
new file mode 100644
index 0000000..a76df90
--- /dev/null
+++ b/vscode-why/tsconfig.build.json
@@ -0,0 +1,13 @@
+{
+  "extends": "./tsconfig.json",
+  "compilerOptions": {
+    "noEmit": false,
+    "outDir": "out",
+    "rootDir": ".",
+    "sourceMap": true,
+    // Emitting build: src must use .js specifiers for relative imports
+    // (nodenext); the .ts-extension allowance is only for tsx-run tests.
+    "allowImportingTsExtensions": false
+  },
+  "include": ["src/**/*.ts", "test-integration/**/*.ts"]
+}
````

````diff
diff --git a/vscode-why/tsconfig.json b/vscode-why/tsconfig.json
new file mode 100644
index 0000000..0a3b8ab
--- /dev/null
+++ b/vscode-why/tsconfig.json
@@ -0,0 +1,13 @@
+{
+  "compilerOptions": {
+    "module": "nodenext",
+    "moduleResolution": "nodenext",
+    "target": "es2022",
+    "strict": true,
+    "types": ["node"],
+    "allowImportingTsExtensions": true,
+    "noEmit": true,
+    "skipLibCheck": true
+  },
+  "include": ["src/**/*.ts", "test/**/*.ts", "test-integration/**/*.ts"]
+}
````
