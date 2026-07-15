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
2. **Anchors are live or dead, never silently stale.** Every code-touching concept anchors to `path + symbol + line range + as-of commit`. `why anchor` re-resolves anchors across renames and refactors; an anchor it cannot re-resolve is marked `lost` and surfaces in `why doctor` — it never silently points at the wrong code. Where it can confirm the code but not the provenance, it says exactly that (`unverified as_of`) rather than guessing in either direction — see [Squash merges and `as_of`](#squash-merges-and-as_of).

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

## Squash merges and `as_of`

If your project squash-merges (or rebases) pull requests — most do — this section is worth two minutes, because it explains a report you will eventually see.

Every anchor records an `as_of`: the commit at which `why` last verified that this concept was about this code. It is provenance, and it is also how re-anchoring works — `why anchor` traces your lines *forward from `as_of`* to find where they live now.

A squash merge throws that commit away. Ten commits on `add-rate-limiter` become one brand-new commit on `main`, and the branch commits are never part of `main`'s history. So an anchor stamped while you were on the branch names a commit that, after the merge, exists only in the clone that made it:

```
main      A ─────────────── S          S = the squash. Your branch's commits
              \            /               are not in main's history at all.
branch         B ─── C ───┘            C = what `as_of: c0ffee` pointed to
```

Anchor `as_of: c0ffee` still resolves on *your* laptop, because your clone kept the branch. In CI — a fresh clone of `main` — that commit does not exist. A tool that read history through it would answer differently on each machine, which is worse than a tool that fails: it would be a health report you cannot reproduce.

**What `why` does about it.**

- **`why anchor` avoids creating the problem.** When you are on a branch that git can tell is not the integration branch, it stamps the *merge-base* — the newest commit certain to survive the squash — instead of your branch HEAD, but only when it can verify the identical span is really there. When it can't verify that (usually because your branch is what changed those lines), it stamps HEAD honestly rather than assert a span it didn't check.
- **Resolution never reads through an orphan.** An `as_of` that isn't an ancestor of HEAD is not used for rename-following or blame-tracing, even when your local clone could technically answer. This is what keeps CI and your laptop agreeing.
- **An unreadable `as_of` is not a dead anchor.** If the path is still there but the recorded *lines* can't be re-traced — no symbol to re-find, no readable `as_of` to trace from — `why anchor` reports `unverified as_of`, changes nothing, and `why doctor` lists it. The code is fine; only the provenance is unreadable. Calling that `lost` would be a false alarm, and false alarms are how a health report gets ignored.
- **An orphaned `as_of` is repaired, not kept as a scar.** When the claim re-verifies at HEAD without reading `as_of` at all — the file is present for a whole-file anchor, or the symbol is re-found at its recorded span — `why anchor` re-stamps the orphan, and only to a commit that survives: HEAD on the integration branch, or the merge-base on a feature branch when the identical span verifiably holds there. When neither is available it declines and leaves the orphan reported, rather than write a branch HEAD the next squash would discard.

**What you'll see.** `why doctor` may report a few `stale as_of` findings right after a squash-merged PR — yellow, not red, and they don't fail CI: the anchor isn't asserting anything false, it just can't show its work. The post-merge `why-anchor` job clears them on the next run from `main`, re-stamping each orphan whose claim still verifies at HEAD to the commit that landed.

One case stays yellow: a bare `path + lines` anchor whose `as_of` was squashed away. With no symbol to re-find and no history to trace from, nothing can verify what those line numbers name anymore, so `why anchor` reports `unverified as_of` and refuses to guess — re-stamping would assert a span nothing verified. That finding is accurate and needs a human (or a re-dig) to confirm the lines; it is one more reason DESIGN.md prefers `symbol` over bare line ranges.

An `as_of` that is a clean *ancestor* of HEAD is never re-stamped, orphan repair included: an old ancestor `as_of` means the anchor has *survived unchanged* since then — provenance, not drift ([decision](.why/decisions/as-of-is-provenance.md)).

Nothing here requires configuration. `why` reads your integration branch from `refs/remotes/origin/HEAD` (git records it at clone time; `git remote set-head origin -a` refreshes it). Where there is no such record — a single-branch CI clone, a repo with no remote — `why` stamps HEAD, which is what it did before and remains truthful.

## Self-hosted

`why` runs on its own repository: [`.why/`](.why/index.md) is this repo's live
decision archive — the project's bootstrap decisions captured as `decision`
concepts (confidence `recorded`, citations to the actual commits and PRs) —
and the living demo of the schema on a real codebase. It stays true
mechanically: every PR runs `why lint` + `why anchor --check --allow-drift`,
every push to `main` re-anchors from the commit that landed, a weekly job runs
`why audit`, and merged PRs get drafted into `.why/.drafts/` by `why capture` —
the exact workflows documented in [docs/ci.md](docs/ci.md), active under
[`.github/workflows/`](.github/workflows). Browse it like any bundle:

```bash
npx -y @copperbox/okf-mcp --bundle why=.why inspect
```

## Getting started

All ten subcommands ship, the four CI recipes run on this repo's own `.why/`
bundle, and both viewers (`why serve` and the VS Code extension) render live.
**[HOWTO.md](HOWTO.md) is the adoption guide** — scaffold a bundle, cold-start
a dig, wire up the PR gate / re-anchor / weekly audit / post-merge capture jobs, and the
team habits that make it pay off.

```bash
npx -y @copperbox/why init --capture-snippet   # scaffold .why/ + teach CLAUDE.md
npx -y @copperbox/why blame <path>[:line]      # read the story of a span
npx -y @copperbox/why doctor                   # archive health at a glance
```

The ten subcommands — `dig · anchor · audit · blame · capture · lint · doctor ·
export · init · serve` — are specified in [DESIGN.md §8](DESIGN.md#8-implementation-shape),
and each operational recipe has a page under [`docs/`](docs).

## Project map

| File | What it is |
|---|---|
| [HOWTO.md](HOWTO.md) | Adoption guide — get a team running `why` on any repo |
| [DESIGN.md](DESIGN.md) | Full schema and architecture spec — the source of truth |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup, the invariants, and how to send a PR |
| [CLAUDE.md](CLAUDE.md) | Orientation for agent sessions in this repo |
| [examples/harbor/](examples/harbor/) | A hand-authored example bundle for a fictional service — the schema, fully realized in six concepts |
| [.why/](.why/index.md) | This repo's own decision archive — the self-hosted bundle, kept honest by the CI recipes in [docs/ci.md](docs/ci.md) |

The example bundle is browsable today:

```bash
cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect
```
