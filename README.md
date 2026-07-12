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

## Status

Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all seven subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; re-anchoring is Phase 2), with `--json` for the resolved structure. The other subcommands are not implemented yet — each says so and exits 2.

| File | What it is |
|---|---|
| [DESIGN.md](DESIGN.md) | Full schema and architecture spec — the source of truth |
| [PLAN.md](PLAN.md) | Phased roadmap in session-sized tasks, plus the working protocol for future sessions |
| [CLAUDE.md](CLAUDE.md) | Orientation for agent sessions in this repo |
| [examples/harbor/](examples/harbor/) | A hand-authored example bundle for a fictional service — the schema, fully realized in six concepts |

The example bundle is browsable today:

```bash
cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect
```
