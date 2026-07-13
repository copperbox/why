# why

**Decision archaeology for codebases.** `git blame` tells you *who* and *when*. The code tells you *how*. `why` recovers and maintains the *why* — the decisions, constraints, failed attempts, and incidents that gave the code its shape — and keeps that history anchored to the living code as it moves.

```
$ why blame src/lock.rs:47

src/lock.rs:41-58 · acquire_shared()

  ● Queue-based locking                    decision · 2024-03-14 · corroborated
    Chosen after striped RwLocks deadlocked under production load.
    because of ▸ 2024-03 lock stall (incident)
    instead of ▸ Striped RwLock (attempt — failed)
    evidence   ▸ PR #212, commit a3f9c2e

  ⚠ Acme 45s gateway timeout               constraint · EXPIRED 2025-06-30
    The 47s request deadline exists for a customer contract that has ended.
    → downstream decision "47s request deadline" may now be scar tissue.
```

## The problem

Every mature codebase is full of load-bearing weirdness: the timeout nobody dares change, the lock nobody dares refactor, the dependency pinned to an old version for reasons lost to time. The rationale existed once — in a Slack thread, a PR comment, a departed engineer's head — and evaporated. Teams pay for this constantly:

- **Re-litigating settled decisions.** "Why don't we just use X?" — because X was tried, failed, and nobody wrote down how.
- **Fear-driven ossification.** Code that *could* be simplified isn't, because nobody knows whether the weirdness is still load-bearing.
- **Expired constraints living forever.** Most odd code is scar tissue from a constraint (a contract, a platform bug, a perf budget) that stopped being true years ago. Nothing ever tells you the wound healed.

## What `why` is

Three layers, deliberately separable:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. ARCHAEOLOGY   why dig                                     │
│    Agent-driven ingestion: git history, PRs, issues,         │
│    postmortems → reconstructed decision concepts, each       │
│    with evidence citations and an honest confidence label.   │
├──────────────────────────────────────────────────────────────┤
│ 2. THE BUNDLE    .why/ — an OKF markdown knowledge base      │
│    One markdown file per decision/constraint/attempt/        │
│    incident/question; links form the causal graph. Humans    │
│    browse it in any editor or Obsidian; agents query it      │
│    through okf-mcp. No database. Diffs in code review.       │
├──────────────────────────────────────────────────────────────┤
│ 3. LIVENESS      why anchor · why audit · why blame          │
│    Re-anchoring keeps concepts pointing at code as it moves. │
│    Auditing re-verifies constraints and flags the expired    │
│    ones — and the decisions downstream of them.              │
└──────────────────────────────────────────────────────────────┘
```

The bundle is the center of gravity, and it is **not a new format**: it's [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) markdown served by [okf-mcp](../okf-mcp). `why` adds a schema on top (concept types, a `why:` frontmatter extension, link-section conventions) plus the tooling OKF deliberately doesn't provide: code anchoring, constraint auditing, and the archaeology pipeline. See [DESIGN.md](DESIGN.md) for the full schema.

## The knowledge model, in one table

| Type | What it records | The question it answers |
|---|---|---|
| `decision` | A choice: problem, alternatives, rationale, outcome | "Why is it this way?" |
| `constraint` | An external force (contract, platform limit, budget, policy) — with a way to check whether it's *still true* | "What forced this — and does it still?" |
| `attempt` | Something tried that failed or was abandoned, and how | "Why don't we just…?" |
| `incident` | A production event that forced change | "What did we learn the hard way?" |
| `question` | A why the archaeology could not recover | "What don't we know?" |

Links between concepts are ordinary markdown links; the section a link sits in (`# Because of`, `# Instead of`, `# Superseded by`) gives the edge its meaning. Evidence is spec-standard `# Citations` — commit SHAs, PR and issue URLs — so every claim is checkable.

Two properties are non-negotiable and shape everything:

1. **Honesty about confidence.** Reconstructed history is partly inference. Every concept carries `confidence: recorded | corroborated | inferred | speculative`, and rationale below `corroborated` is always rendered with hedging. A wrong "why" stated confidently is worse than no "why". Unrecoverable rationale becomes a `question` concept, not a guess.
2. **Anchors are live or dead, never silently stale.** Every code-touching concept anchors to `path + symbol + line range + as-of commit`. `why anchor` re-resolves anchors across renames and refactors; an anchor it cannot re-resolve is marked `lost` and surfaces in `why doctor` — it never silently points at the wrong code.

## Why OKF as the substrate

- **Decisions are naturally documents** — structured frontmatter plus narrative body, linked into a graph.
- **Dual audience built in.** Agents write and query through MCP; humans browse the same files in Obsidian or review them in PRs. No custom viewer, no database.
- **MCP-native consumption.** Any coding agent (Claude Code included) mounts the bundle and asks "what's the story behind this file" during normal work — `why` needs no client integration of its own.
- **Permissive by design.** Reconstructed history is messy and partial; a format where imperfect documents still serve fits reality.
- **`git`-visible.** The decision record itself has history, review, and blame. `why` can be run on its own bundle.

## What's honestly hard

Named here so we never pretend otherwise (expanded in [DESIGN.md §Open problems](DESIGN.md#open-problems)):

- **Anchor drift** is the hard engineering problem. Line ranges rot instantly; symbol + blame-based re-anchoring across renames, moves, and rewrites is the make-or-break component.
- **Hallucinated rationale** is the hard trust problem. The confidence ladder and evidence-citation requirements exist because a decision archive people can't trust is worse than none.
- **Cold start** is the hard adoption problem. Nobody hand-writes ADRs retroactively; `why dig` must produce a genuinely useful first bundle from history alone, unattended, or the tool never gets a chance.

## Self-hosted

`why` runs on its own repository: [`.why/`](.why/index.md) is this repo's live
decision archive — PLAN.md's old Decision log converted into `decision`
concepts (confidence `recorded`, citations to the actual commits and PRs) —
and the living demo of the schema on a real codebase. It stays true
mechanically: every PR runs `why lint` + `why anchor --check`, a weekly job
runs `why audit`, and merged PRs get drafted into `.why/.drafts/` by
`why capture` — the exact workflows documented in [docs/ci.md](docs/ci.md),
active under [`.github/workflows/`](.github/workflows). Browse it like any
bundle:

```bash
npx -y @copperbox/okf-mcp --bundle why=.why inspect
```

## Status

Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all ten subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>/.cache/` keyed by bundle contents + repo HEAD — the cache directory ignores itself via its own `.gitignore`, so `why init` needs no gitignore handling and existing bundles get the same behavior. `why lint` works: it delegates OKF conformance to okf-mcp and enforces the `why`-schema layer above it (DESIGN.md §2 vocab tables, required sections, edge-target types, status/section consistency) as stable `W###` rules — human-readable by default or `--json`, exit 1 on any error-severity finding. `why anchor` works: it re-resolves every anchor claim against HEAD (symbol-first, then blame-trace, then honestly `lost` — never a guess) and rewrites only the `why.anchors` frontmatter entries, leaving every other byte of the concept untouched; `--check` is the CI mode (resolve, write nothing, exit 1 on drift) and `--concept <id>` scopes a run. It currently carries its own minimal internal resolvers; standalone, more capable resolvers now exist alongside it and are next in line to replace them behind the same seam — a blame-trace resolver ([src/trace-range.ts](src/trace-range.ts)) that traces an anchored line range from its as-of commit to HEAD, or proves it `lost`, and a symbol resolver ([src/find-symbol.ts](src/find-symbol.ts)) that finds a named symbol at HEAD (tree-sitter WASM grammars for TypeScript/JavaScript, Rust, Python and Go; a lower-confidence line-regex heuristic elsewhere), following a symbol into another file only when git history connects it to the anchored one, and answering `ambiguous` rather than guessing between duplicate declarations. The anchor resolver's survival rate is measured by a torture harness ([test/torture/](test/torture/README.md)) that replays a repo's history commit by commit through the real `why anchor` command and fails on any silently-wrong anchor — `npm run test:torture` runs the built-in scenario, and it can be pointed at a real repo with seeded anchors. `why doctor` works: a read-only bundle health report — lost anchors and lint errors are red (exit 1); stale `as_of`s, overdue `review-by` constraints, `status: unknown` and expired constraints, and open questions (age-sorted) are yellow (exit 0) — human-readable by default or `--json`; it now also opens with a dig-freshness line (commits since the last dig on the current branch). `why dig --episodes` works — the deterministic half of archaeology (DESIGN.md §6 step 1): it walks git history (high-water mark → HEAD when `<bundle>/.dig-state.json` carries one; full history otherwise), clusters commits into episodes (merge/PR boundaries first, then same-author/<48h/file-overlap clustering for direct commits), and flags tells — reverts, fix-chains, sudden churn on old-quiet files, comment tells — per episode and in a global summary; `--json` or `--out <file>` emit a stable, documented JSON report ([docs/dig-episodes.md](docs/dig-episodes.md)). `why dig --evidence <episodes.json>` works: it assembles one deterministic evidence pack per episode — full commit messages, PR/issue threads via `gh` (degrading to explicit `[unavailable: …]` markers when there's no remote or no `gh`), local exported context via `--evidence-dir`, and per-file-clipped diffs under a `--max-chars` budget with `[clipped: …]` markers naming what was cut — packs land in the self-ignoring `<bundle>/.cache/evidence/` by default; format documented in [docs/dig-evidence.md](docs/dig-evidence.md). The judgment half of the dig pipeline ships as Claude Code skills, not code: [skills/dig/SKILL.md](skills/dig/SKILL.md) (per-episode reconstruction — schema contract, the verbatim confidence ladder, cite-everything, prefer-`question`-over-`speculative`, update-don't-duplicate) and [skills/dig-synthesize/SKILL.md](skills/dig-synthesize/SKILL.md) (cross-episode merge/supersede/promote pass ending in clean `lint` + `doctor`), with the end-to-end runbook — the era-chunked cold-start order and a dry walkthrough of the harbor story included — in [docs/digging.md](docs/digging.md). Incremental dig state is in place ([src/dig-state.ts](src/dig-state.ts)): `.why/.dig-state.json` holds a per-branch high-water mark, advanced atomically only after a successful episode emission and safe to delete (re-dig everything; synthesis dedupes), with `--from <rev>`/`--full` honored as range overrides by `why dig --episodes`. `why audit` works — the DESIGN.md §5 payoff: it sweeps every `active` constraint, running `verify.method: check` commands (confined to the repo directory, with a timeout and captured output), exporting `method: ask` items as an agent questionnaire (`--questions-out`; the CLI never calls an LLM — apply the filled-in answers with `--answers`), and flagging overdue `review_by` dates; a failed check or a no-longer-true answer flips the constraint to `status: expired` (frontmatter patch + evidence appended to `# Still true?`, the rest of the file byte-for-byte intact), walks `# Because of` edges backwards, and files a `question` concept for every still-active decision downstream unless an open question already links the pair — human report or `--json`, exit 1 whenever anything newly expired (the CI signal that the archive learned something). Constraints already expired before the run stay report-only: their downstream candidacy is listed, never re-flagged. `why capture` works — merge-time capture, the steady state that eventually makes digging rare (DESIGN.md open problem #5): `--pr <n>` assembles a merged/closed PR's evidence via `gh` (reusing the dig evidence module) and emits a draft concept into `.why/.drafts/` — type guessed from merge-vs-close (`decision`/`attempt`), `happened_on` from the merge time, anchors derived per hunk from the merge commit's zero-context diff, citations to the PR, and rationale candidates quoted verbatim with attribution, alongside an evidence-pack sidecar; `--commit <sha>` is the gh-free fallback. Drafts live in a dot-directory precisely so okf-mcp never serves them, and leave it only through the lint-gated editorial step `why capture --promote <draft>` (errors roll the write back and keep the draft). The judgment step ships as a third skill, [skills/capture/SKILL.md](skills/capture/SKILL.md), and the post-merge CI recipe is [docs/capture.md](docs/capture.md). `why export` works — the UI data contract (DESIGN.md §7's consumers): `why blame --json` now emits the versioned story payload (hits with edges grouped by relation, citations as label + url, and hedging precomputed into the data as `hedged` + `renderedRationale`, so a renderer that ignores confidence still cannot display unhedged speculation), `why export ui-index` emits the per-file coverage map from the anchor index at HEAD (stamped with the resolved sha so consumers detect staleness), and `why export graph` emits the bundle as nodes/typed edges — all three validated against the JSON Schemas in [schemas/](schemas/) on every test run and documented with examples, the versioning policy, and renderer guidance in [docs/ui-contract.md](docs/ui-contract.md). `why serve` works — the standalone local UI (DESIGN.md §8): a read-only HTTP server bound to 127.0.0.1 (`--port <n>`, or a random free port printed with the URL) whose JSON endpoints are thin wrappers over the same library calls the CLI makes — file tree (`git ls-files`), per-file git blame at HEAD, coverage, story, graph, and a doctor summary, every payload schema-valid per the UI contract (the three serve-only payloads have their own schemas in [schemas/](schemas/)) — and whose single-page UI ([ui/](ui/), bundled by esbuild into in-memory assets with zero external URLs) renders the flagship visual: git blame and the `why` gutter side by side, a story panel of hedged rationale cards with loud expired-constraint warnings, a canvas graph of the bundle, and doctor chips in the header; an optional browser test lives behind `npm run test:e2e` (excluded from `npm run verify`, which stays display-free). The VS Code extension ([vscode-why/](vscode-why/)) works as a pure contract consumer — it shells out to `why export ui-index` and `why blame --json` and renders: theme-token gutter stripes per covered span, hover cards (pre-hedged rationale verbatim, expired-upstream warnings first, muted "as of `<short-sha>`" staleness notes when the coverage sha ≠ HEAD), and a `why: Show Story` webview — with its own isolated package (`vsce package` produces the `.vsix`; nothing published), unit tests that the root `npm run verify` runs display-free even without `vscode-why/node_modules`, an extension-host test behind its `npm run test:integration` (needs a display), and install/QA instructions in [docs/vscode.md](docs/vscode.md).

| File | What it is |
|---|---|
| [DESIGN.md](DESIGN.md) | Full schema and architecture spec — the source of truth |
| [NOTES.md](NOTES.md) | Implementation findings that feed DESIGN.md decisions |
| [PLAN.md](PLAN.md) | Phased roadmap in session-sized tasks, plus the working protocol for future sessions |
| [CLAUDE.md](CLAUDE.md) | Orientation for agent sessions in this repo |
| [examples/harbor/](examples/harbor/) | A hand-authored example bundle for a fictional service — the schema, fully realized in six concepts |
| [.why/](.why/index.md) | This repo's own decision archive — the self-hosted bundle, kept honest by the CI recipes in [docs/ci.md](docs/ci.md) |

The example bundle is browsable today:

```bash
cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect
```
