# PLAN — roadmap and session protocol

Working plan for building `why`. Structured as phases of session-sized tasks so any future chat can pick up the next unchecked box and make real progress in one sitting.

> **Build mode (since 2026-07-11):** Phases 1–4 are implemented autonomously — each task below maps to an issue in `issues/`, built by Sandcastle and merged by the gatekeeper (see `AUTOBUILD.md`). Chat sessions own this file, DESIGN.md, the issue specs, and the gate itself; the checkboxes for delegated tasks get ticked by whoever confirms the merged result, with the PR number noted.

## Session protocol

Every session in this repo:

1. Read `CLAUDE.md`, then skim this file to find the current phase (first phase with unchecked tasks).
2. Pick the next unchecked task — or the task the user names. Tasks are ordered; don't skip ahead unless blocked.
3. Before building, check the task's *Decide* items (if any) — settle them with the user or record the choice in the [Decision log](#decision-log).
4. Check the box when done, note anything surprising under the task, and add a Decision log entry for any choice that deviates from [DESIGN.md](DESIGN.md).
5. If DESIGN.md turned out to be wrong, fix DESIGN.md in the same session — it is the source of truth and must not drift from reality.

Keep this file honest: it is the memory between sessions.

## Phase 0 — Prove the schema by hand ✅ (bootstrap session, 2026-07-11)

Goal: validate that the schema can carry a real causal story before writing any code.

- [x] Write DESIGN.md (schema, anchoring, audit, dig pipeline, open problems)
- [x] Hand-author `examples/harbor/` — a six-concept bundle telling one complete story (incident → failed attempt → decision → constraint → expired-constraint fallout → open question)
- [x] Serve `examples/harbor` through okf-mcp (`--bundle harbor=examples/harbor inspect` + `validate`), fix any OKF conformance issues in the example — *conformant, 0 errors/warnings; 6 concepts, 13 edges, 0 broken links. The `question` concept reports as an orphan, correctly: an open question has no recovered causal edges.*
- [ ] Dogfood check: in a fresh session, ask an agent with only the mounted bundle "why does harbor use queue-based locking?" and "is the 47s deadline still needed?" — the answers should be complete and correctly hedged. Record verdict here.

## Phase 1 — Skeleton: `why lint` + `why blame` (static)

Goal: a real CLI that makes a *hand-written* bundle useful. No archaeology yet — prove consumption value first, since it's cheaper to build and it's what users feel.

- [ ] Scaffold the package: TypeScript, `why` bin, okf-mcp as a dependency (decide: library import vs subprocess — try library first, fall back and record)
- [ ] `why init` — scaffold `.why/`, root `index.md` frontmatter, CLAUDE.md capture snippet
- [ ] `why lint` — schema checks from DESIGN.md §3 on top of OKF validation (required sections, edge-target types, citation requirements by confidence, status/section consistency)
- [ ] `why blame <path>[:lines]` — anchor lookup (exact `as_of` match only; no re-anchoring yet) + one-hop edge expansion + the rendered story format from DESIGN.md §7, including expired-constraint warnings
- [ ] Tests over `examples/harbor` as the fixture bundle
- [ ] Milestone check: `why blame src/lock.rs:47` against harbor produces (modulo formatting) the README's example output

## Phase 2 — Anchoring engine

Goal: anchors survive real development. This is the make-or-break phase — if re-anchoring doesn't work, the product doesn't work.

- [ ] Anchor index: build + cache the span→concept map; invalidate on bundle or HEAD change
- [ ] Blame-trace resolver: track a line range from `as_of` to HEAD (start with `git log -L`-based tracing; measure where it breaks)
- [ ] Symbol resolver: tree-sitter lookup for ts/js/rust/python/go, grep-heuristic fallback for everything else
- [ ] `why anchor` — full resolution order from DESIGN.md §4, frontmatter-only updates via okf-mcp, `--check` mode for CI
- [ ] `why doctor` — report lost anchors, stale `as_of`s, audit-overdue constraints
- [ ] Torture test: replay ~50 real commits of an actual repo (okf-mcp's own history is right here) over a seeded bundle; measure anchor survival rate. **Target: >90% of anchors either resolve correctly or honestly report lost — zero silently-wrong anchors.**
- [ ] Decide open problem #1 (wholesale-rewrite policy) from the torture-test data; record in Decision log

## Phase 3 — Archaeology: `why dig`

Goal: cold-start a useful bundle from history alone. The adoption phase.

- [ ] `why dig --episodes` — deterministic episode extraction + tells detection (DESIGN.md §6 step 1), JSON out
- [ ] `why dig --evidence <episode>` — evidence pack assembly via `gh` (PRs, issues), plus `--evidence-dir` escape hatch
- [ ] Dig skill (`skills/dig/SKILL.md`) — the reconstruction agent prompt: schema, confidence ladder, cite-everything, prefer-questions-over-speculation, update-don't-duplicate
- [ ] Synthesis skill — cross-episode merge/supersede/promote pass (DESIGN.md §6 step 4)
- [ ] Incremental state: `.why/.dig-state.json` high-water mark; `why dig` processes only new history on re-run
- [ ] **The real test:** dig okf-mcp's actual git history end-to-end. Then hand-grade every concept against ground truth (its author is in the room). Measure: % useful, % correctly-confident, % hallucinated. **Gate: zero rationale asserted above its evidence.** Decide open problem #2 (adversarial verify pass) from these numbers.

## Phase 4 — Liveness: `why audit` + capture at the source

Goal: the archive stays true, and new history gets recorded at `recorded` confidence instead of excavated later.

- [ ] `why audit` — `check` execution, `ask` handoff to an agent session, `review_by` sweep; expiry flips status and walks the blast radius (DESIGN.md §5), emitting the scar-tissue report + `question` concepts
- [ ] Merge-time capture: post-merge hook / CI job that drafts a `decision` concept from the merged PR's discussion (open problem #5) — the steady-state pipeline that eventually makes digging rare
- [ ] CI recipes doc: `lint` + `anchor --check` as PR gates, weekly `audit`, dig-on-merge

## Phase 5 — Surfaces + in anger

Goal: the why visible where people read and edit code, and `why` running on a real active repo long enough to hit the problems design can't predict.

- [ ] UI data contract: versioned JSON schemas (story / coverage / graph), hedging precomputed into the data (issue 501, `phase:5`)
- [ ] `why serve` — standalone local UI: git blame + why gutter + story panel + graph, self-contained assets (issue 502, `phase:6` — labeled a phase later so the ratchet guarantees the contract merges first)
- [ ] VS Code extension: decorations + hover cards + story panel, pure contract consumer (issue 503, `phase:6`; a GitHub browser extension was considered and deliberately skipped — DOM-fragile, and the index-staleness problem isn't worth solving for v1)
- [ ] Run the full loop on one real repo for several weeks of commits
- [ ] Revisit deferred calls with usage data: `why-mcp` blame tool (DESIGN.md §7), semantic search, multi-repo/org bundles, evidence connectors
- [ ] Write the honest retrospective: does `why blame` actually change how people work in the repo? If not, why not?

## Decision log

Choices made along the way, newest first.

- **2026-07-12 — Circuit breaker: repeated escalation halts the loop for a chat**: an issue's second gate escalation removes it from the queue, labels it `needs-chat` with a chat-agenda comment, and the gate exits HALTED (5) at the phase boundary instead of promoting past the hole. Rewriting a failing spec is the one act the pipeline reserves for humans+chat, and now that's enforced mechanically instead of advised in prose. Details: `AUTOBUILD.md`. *Confidence: recorded.*
- **2026-07-11 — Autonomous build via Sandcastle + gatekeeper**: implementation delegated to the issue→PR pipeline with an agent replacing the human merge gate; in-gate remediation instead of the workflow's responder (which ignores its own login's feedback); phase labels + gate promotion enforce PLAN ordering. Full rationale and risk register: `AUTOBUILD.md`. *Confidence: recorded.*
- **2026-07-11 — Issues are the spec surface**: each Phase 1–4 task became a self-contained issue in `issues/` with testable acceptance criteria, because the pipeline's implementers and the gate both judge against issue text — vague issues make autonomous review meaningless. *Confidence: recorded.* When `why` can run on its own repo, these migrate into `.why/` — until then this section *is* the bundle.

- **2026-07-11 — Consumption before archaeology** (Phase 1 before Phase 3): a CLI over hand-written bundles proves the read-side value cheaply and gives dig a target to hit; digging into a format nobody has felt the value of risks building the hard part for an unproven payoff. *Confidence: recorded.*
- **2026-07-11 — Extension keys namespaced under a single `why:` frontmatter map** rather than flat keys: collision-proof against future OKF versions; OKF preserves unknown keys so plain okf-mcp round-trips it. *Confidence: recorded.*
- **2026-07-11 — Edge types by section convention, not new syntax**: keeps bundles valid OKF and legible in Obsidian; the alternative (typed-link syntax) would fork the format and break the "any editor" property. *Confidence: recorded.*
- **2026-07-11 — OKF/okf-mcp as substrate** rather than a bespoke store: decisions-as-documents, dual human/agent audience, MCP consumption for free, git-visible history. Origin: this project was conceived in conversation alongside okf-mcp. *Confidence: recorded.*
