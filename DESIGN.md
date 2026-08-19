# DESIGN — the `why` schema and architecture

This is the source of truth for the knowledge schema and the three tools built on it. When implementation and this document disagree, one of them is a bug; fix whichever is wrong and record the decision as a `decision` concept in [.why/](.why/index.md).

`why` is a schema and toolset **on top of** OKF v0.2 (with v0.1 read/write compatibility) — every bundle is a valid OKF bundle first, and everything `why`-specific lives in (a) the `why:` frontmatter extension map, (b) link-section conventions, and (c) external tooling. A plain okf-mcp server can serve a `why` bundle with zero changes; `why`'s own tools add the semantics.

## 1. The bundle

Lives at `.why/` in the target repo (default; configurable to a sibling repo for teams that want the archive separately permissioned). Layout:

```
.why/
├── index.md                  # OKF reserved; okf-mcp maintains it
├── log.md                    # OKF reserved; update history
├── decisions/<slug>.md
├── constraints/<slug>.md
├── attempts/<slug>.md
├── incidents/<slug>.md
└── questions/<slug>.md
```

Folder = concept type, one idea per file, slugs are short and kebab-case (`queue-based-locking.md`, not `decision-to-switch-to-queue-based-locking-2024.md`). Links are document-relative (`../constraints/acme-45s-timeout.md`) so published subdirectory bundles remain portable.

## 2. Frontmatter

Standard OKF keys (`type`, `title`, `description`, `tags`, `generated`, `sources`, `verified`, `stale_after`) plus one extension map, `why:`. Namespacing everything under one key keeps us collision-proof against future OKF versions; OKF preserves unknown keys, so plain okf-mcp round-trips it byte-for-byte. Legacy v0.1 `timestamp` and `# Citations` remain readable.

```yaml
---
type: decision
title: Queue-based locking
description: Serialize shard access through a queue instead of striped RwLocks.
tags: [locking, concurrency]
generated:                   # when/by whom this concept was last written
  by: human:maintainer
  at: 2026-07-11T00:00:00Z
why:
  status: active             # see per-type status vocab below
  happened_on: 2024-03-14    # when the decision/incident/attempt happened
  owner: "@platform"          # optional editorial owner
  captured_on: 2026-07-11    # optional: when it entered the review queue
  review_by: 2026-07-25      # optional editorial deadline
  confidence: corroborated   # recorded | corroborated | inferred | speculative
  anchors:
    - path: src/lock.rs
      symbol: acquire_shared # optional but strongly preferred over bare lines
      lines: 41-58
      as_of: a3f9c2e         # commit at which path+lines were valid; must be
                             # an ancestor of the integration branch (§4)
      state: live            # live | lost — maintained by `why anchor`, never by hand
---
```

### Per-type `why:` fields

| Field | decision | constraint | attempt | incident | question |
|---|---|---|---|---|---|
| `status` | `active` \| `superseded` \| `reversed` | `active` \| `expired` \| `unknown` | `failed` \| `abandoned` \| `partial` | `resolved` \| `recurring` | `open` \| `answered` |
| `happened_on` | ✓ | ✓ (when imposed) | ✓ | ✓ | ✓ (when noticed) |
| `confidence` | ✓ | ✓ | ✓ | ✓ | — (a question *is* the uncertainty) |
| `anchors` | ✓ | optional | optional | optional | ✓ |
| `verify` | — | ✓ (see §5) | — | — | — |
| `expired_on` | — | ✓ when expired | — | — | — |
| `owner` | optional | optional | optional | optional | optional |
| `captured_on` | optional | optional | optional | optional | optional |
| `review_by` | optional | optional | optional | optional | optional |

### The confidence ladder

The single most important field. The archaeology agent assigns it; `why blame` renders anything below `corroborated` with explicit hedging; nothing may raise its own confidence without new evidence.

| Level | Meaning | Bar |
|---|---|---|
| `recorded` | A human wrote this rationale down at the time | Direct quote/paraphrase of a PR description, ADR, commit message *stating the reason* |
| `corroborated` | Inferred, but two independent evidence sources agree | e.g. commit sequence shows the revert *and* the issue thread discusses the failure |
| `inferred` | Single-source inference from code/commit structure | "The lock was replaced in the same PR that references the incident" |
| `speculative` | Plausible narrative, thin evidence | Should usually be a `question` instead; allowed only when flagged for human confirmation |

Rule for the dig agent: **when in doubt, file a `question`, not a `speculative` decision.** An honest gap invites a human answer; a confident guess poisons trust in the whole archive.

## 3. Body structure and edge semantics

OKF links are untyped directed edges. `why` gives an edge meaning by the section its link appears in — no new syntax, and the graph stays legible in plain Obsidian.

```markdown
# Queue-based locking

One-paragraph summary: what is true now because of this decision.

# Why

The narrative. What problem existed, what forced action, what was chosen and
the reasoning. Written for the engineer who just ran `why blame` on this code.

# Because of

- [2024-03 lock stall](../incidents/2024-03-lock-stall.md)
- [Acme 45s gateway timeout](../constraints/acme-45s-timeout.md)

# Instead of

- [Striped RwLock](../attempts/striped-rwlock.md) — deadlocked under load

# Citations

[1] [PR #212: replace striped locks with queue](https://github.com/acme/harbor/pull/212)
[2] [commit a3f9c2e](https://github.com/acme/harbor/commit/a3f9c2e)
```

Recognized edge sections (all optional except as noted):

| Section | Edge meaning | Valid on |
|---|---|---|
| `# Why` | narrative, no edges (required on `decision`) | all |
| `# Because of` | this exists due to → constraint/incident/attempt/decision | decision, attempt |
| `# Instead of` | ruled-out alternative → attempt or inline text | decision |
| `# Superseded by` | successor → decision (status must be `superseded`) | decision, constraint |
| `# Led to` | downstream consequence → decision/incident | incident, constraint, attempt |
| `# Still true?` | verification notes, no edges (see §5) | constraint |
| `# Citations` | OKF §8 evidence — commits, PRs, issues, docs | all; **required** on anything ≥ `inferred` |

`why lint` (Phase 1) enforces: required sections present, links in edge sections point at type-appropriate targets, citations present at the required confidence levels, and `status: superseded` ⇔ `# Superseded by` exists.

## 4. Anchoring — keeping concepts pointed at living code

The hard engineering problem. Design decisions:

**An anchor is a claim, not a pointer.** `{path, symbol?, lines, as_of}` means "at commit `as_of`, this concept was about these lines." Re-anchoring is re-evaluating that claim against HEAD, not blindly sliding line numbers.

**Resolution order** (`why anchor`, run in CI or pre-commit):

1. **Symbol-first.** If `symbol` is set, find it at HEAD (ctags/tree-sitter per language; fall back to a grep heuristic). Found in the same file → update `lines`, done. Found in a different file → follow only if git history connects them (rename/move detection via `git log --follow -M -C` between `as_of` and HEAD) **and `as_of` is an ancestor of HEAD** — see "`as_of` must be an ancestor" below.
2. **Blame-trace.** No symbol, or symbol gone: trace the anchored lines forward from `as_of` with incremental `git blame`-style tracking (the same problem `git log -L` solves). Lines that survive → new range.
3. **Unverified.** `as_of` is not an ancestor of HEAD (or does not resolve here), so there is no history to trace from, but the anchored path is still present at HEAD → leave the entry exactly as recorded, report `unverified as_of`. The claim is neither confirmed nor refuted: the code is there, the provenance is unreadable. `why anchor` writes nothing, and `why doctor` reports it. This is the fate only of a bare line claim — a whole-file or symbol claim that re-verifies at HEAD without reading `as_of` gets its orphaned `as_of` repaired instead (see "Which commit `why anchor` stamps").
4. **Lost.** None of the above resolves → set `state: lost`, keep the last-known anchor for forensics, surface in `why doctor`. A lost anchor on an `active` concept is a warning; ten lost anchors after a big refactor is the signal to re-dig that area.

**`as_of` must be an ancestor.** An `as_of` is readable as history only when it is an ancestor of HEAD. This is not pedantry — it is the difference between a reproducible tool and a superstition:

- git answers `diff`/`blame` between *any* two commits it happens to have locally, related or not. A rename detected across a non-ancestor `as_of` therefore resolves on the machine whose clone still has that branch and fails in a fresh clone of the integration branch — the same bundle, the same commit, two different answers.
- `git blame --reverse` interprets `-L` against the **`as_of`** revision, not HEAD. So a plausible-but-unverified `as_of` does not merely fail; it re-points the anchor at whatever text occupied those line numbers there. That is the silently-wrong anchor §2's promise forbids.

Ancestry is the only property of an `as_of` that every clone of the same history agrees on, so it gates every read of history through one.

**Which commit `why anchor` stamps.** HEAD is the commit the span was verified against, so HEAD is the default and always truthful. But a squash merge (or rebase) rewrites a whole branch into one new commit, so an `as_of` stamped on a branch names a commit that never reaches the integration branch — truthful when written, unresolvable a day later. So when HEAD is *not* contained in the integration branch (`refs/remotes/origin/HEAD`, when git records one), `why anchor` prefers the merge-base — the newest commit certain to survive — **but only when the identical span verifiably holds there**. It usually does not for a span the branch just changed, and inventing one would be exactly the silently-wrong anchor above; so an unverifiable merge-base loses to a truthful HEAD, which may later orphan and degrade to `unverified` (step 3).

A stable anchor with a *readable* `as_of` is never re-stamped: a clean-ancestor `as_of` is provenance — the span survived unchanged since that commit ([as_of is provenance](.why/decisions/as-of-is-provenance.md)). An **orphaned** `as_of` on an otherwise-current claim carries no such meaning — no clone of the integration branch can resolve it — so `why anchor` repairs it, under two conditions ([decision](.why/decisions/orphaned-as-of-is-repaired.md)). First, the claim must have re-verified at HEAD without reading `as_of` at all: the path is present (whole-file claim) or the symbol was re-found — a bare line claim stays `unverified` (step 3) because re-stamping it would assert lines nothing verified. Second, the stamp must be durable: HEAD when `refs/remotes/origin/HEAD` contains it or git records no integration branch, the merge-base on a diverged branch only when the span verifiably holds there — and otherwise no repair, leaving the orphan reported for the post-merge run rather than stamping a branch HEAD the next squash would discard and re-orphan.

**Anchors are written from the integration branch.** The stamping rule above is damage control for a `why anchor` run somewhere it shouldn't be; the operational rule is that anchors are re-stamped by CI on `main` after a merge, never by a contributor on a branch (docs/ci.md). Only the integration branch hands out commits it keeps, so this is the only place every `as_of` is durable by construction — including for a file *born* on a squashed branch, where no earlier commit exists to point at and no branch-side stamp could have been right. The PR gate therefore reports drift without failing on it (`why anchor --check --allow-drift`) and fails only on an anchor the change destroyed. The cost is that the bundle is eventually consistent: between a merge and the re-anchor landing, `main`'s anchors can be stale — honestly `lost` or `unverified`, never silently wrong.

**Anchors update mechanically, concepts don't.** `why anchor` rewrites only the `why.anchors` entries (via okf-mcp `update_concept`, which patches frontmatter without touching the body). It never edits narrative.

**Granularity guidance:** anchor to the smallest span that would make a reader ask the question — a function, a config block, a pinned dependency line. Whole-file anchors (`lines` omitted) are allowed for architectural decisions.

## 5. Auditing — constraints must be falsifiable

A `constraint` is only useful if you can later discover it stopped being true. Every constraint carries a `verify` block:

```yaml
why:
  status: active
  verify:
    method: check | ask | review-by
    # method: check — machine-checkable, `why audit` evaluates it directly
    check: "jq -e '.dependencies.libfoo | startswith(\"1.\")' package.json"
    # method: ask — an agent re-verifies from the hint
    ask: "Is the Acme contract (SFDC #4471) still active? Owner: dan."
    # method: review-by — nothing checkable; a date forces a human look
    review_by: 2027-01-01
```

`why audit` sweeps active constraints: runs `check`s, hands `ask`s to an agent session, flags overdue `review_by`s. When a constraint flips to `expired`, the payoff fires: the audit walks `# Because of` edges *backwards* and reports every `active` decision downstream — "this code shape may now be scar tissue" — as a `question` concept plus a human-readable report. That report is the tool's reason to exist.

## 6. Archaeology — `why dig`

Judgment lives in agent prompts; everything deterministic lives in the CLI. The pipeline:

1. **Episode extraction (deterministic).** `why dig --episodes` walks git history and clusters commits into candidate episodes: merge/PR boundaries first, then temporal + file-overlap clustering for direct-commit histories. Emits JSON episodes: commits, files touched, messages, linked PR/issue numbers (parsed from messages), authors, date range. Also flags *tells* — reverts, `fix`-after-`fix` chains, long-lived files with sudden churn, code comments matching `HACK|workaround|don't|because` — which mark high-value dig sites.
2. **Evidence gathering (deterministic + `gh`).** For each episode: PR description and review threads, linked issues, referenced incident docs. Bundled into an evidence pack per episode.
3. **Reconstruction (agent).** An agent per episode reads the evidence pack and drafts concepts under the schema, citing every claim and assigning confidence per §2. Uses okf-mcp `search_concepts` first to update existing concepts rather than duplicate.
4. **Cross-episode synthesis (agent).** After a batch: merge duplicates, connect `# Superseded by` chains across episodes, promote recurring themes into `constraint`s, file `question`s for the gaps.
5. **Anchor pass.** `why anchor` resolves every new concept's anchors against HEAD.

Digs are **incremental**: a high-water mark (`.why/.dig-state.json`, last processed commit) means routine runs process only new history. First run on a big repo is chunked era-by-era, oldest first, so synthesis sees history in causal order.

Priority order for a cold-start dig (usefulness per token): tells first, then the most-blamed hot files, then breadth. A first dig that nails the 20 weirdest places in the repo beats a shallow sweep of everything.

## 7. Query — `why blame`

`why blame <path>[:line[-line]]`:

1. Resolve which concepts anchor a span covering the target (anchor index built by `why anchor`, cached).
2. Expand one hop out along typed edges (`# Because of`, `# Instead of`, `# Superseded by`).
3. Render newest-first: status glyph, title, type, date, confidence; hedge anything below `corroborated` (`inferred` → "likely — …", `speculative` or unstated → "speculation, thin evidence — …" — rendering never hedges less than the evidence supports); expired constraints render as warnings with their downstream blast radius. Every expired constraint in the bundle renders its warning, upstream of the matched concepts or not — the §5 payoff must never be invisible (the README example shows the Acme warning on a file no edge connects it to).
4. No anchored concepts → say so, and list the nearest anchored concepts in the same directory rather than returning nothing.

Same data over MCP: agents mount the bundle via okf-mcp and get story-of-this-code by `search_concepts` with a `resource`/anchor filter. If that proves clumsy in practice, Phase 5 considers a thin `why-mcp` wrapper exposing `blame` as a first-class tool; default is to not build it.

### Outcome-oriented interfaces

- `why bootstrap` composes episode extraction and evidence assembly into one
  atomic cold-start workspace and an ordered agent handoff. It does not call an
  LLM: rationale reconstruction remains the explicit judgment seam.
- `why maintain` composes lint, anchor writes, audit, doctor, and inbox summary
  on the integration branch.
- `why review` is the consolidated editorial queue for drafts, open questions,
  ownership/deadlines, and maintenance findings; it also exposes lint-gated
  promotion.
- `why impact [<git-range>]` maps a diff to exact-hunk and same-file concepts,
  then reports only expired constraints causally upstream of those concepts.

Their contracts and operational behavior are specified in
[docs/workflows.md](docs/workflows.md).

## 8. Implementation shape

- **Language:** TypeScript (Node), matching okf-mcp; depends on okf-mcp as a library where possible rather than shelling out.
- **CLI:** outcome interfaces are `why bootstrap | maintain | review | impact`; lower-level interfaces are `why dig | anchor | audit | blame | capture | lint | doctor | export`, plus `init | serve`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
- **UI surfaces:** two, both dumb renderers of the contract payloads with zero engine logic of their own. `why serve` is a read-only, localhost-only viewer (blame gutter, story panel, graph) whose endpoints wrap the same library calls the CLI uses; the `vscode-why/` extension shells out to the `why` CLI and renders coverage decorations, hovers, and story webviews from the same JSON. If either surface needs data the contract lacks, the contract is extended first.
- **Agent integration:** dig/audit agent prompts ship as Claude Code skills in `skills/`; the CLI's `--episodes`/`--evidence` subcommands are the deterministic tools those skills call.
- **No daemon.** No resident process is ever required: the pipeline is run-to-completion commands suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly). `why serve` is the one deliberate exception — an optional, foreground, localhost-only viewer the user starts and stops by hand; nothing in the pipeline depends on it.

## Open problems

Tracked honestly. These are the questions v1 does not settle.

1. **Anchor drift under heavy refactoring.** Symbol + blame-trace should survive renames and moves; wholesale rewrites (v1 → v2 of a subsystem) are genuinely new code — is `lost` + re-dig the right answer, or should decisions carry forward through a human-confirmed "successor anchor"? *Phase 2 decides with real data.*
2. **Hallucination pressure at scale.** One agent per episode with citation requirements is the design; does it hold when episodes are thin (terse commit messages, no PRs)? May need an adversarial verify pass — a second agent trying to refute each ≥`inferred` claim. *Phase 3 measures on a real repo before adding cost.*
3. **Evidence access.** PRs and issues are reachable via `gh`; Slack/Discord/docs often hold the best rationale and are org-specific. v1 accepts an `--evidence-dir` of exported text as the escape hatch; connectors are post-v1.
4. **Bundle scale.** Hundreds of concepts: fine (lexical search, in-memory graph). Org-wide multi-repo archives: needs okf-mcp multi-bundle mounts (already supported) and maybe semantic search bolted alongside. Explicitly deferred; single-repo is the product until it's excellent.
5. **Trust, scale, and evidence security.** Claim-level confidence, product-quality evaluation, warning scope, evidence retention/check execution, and human-confirmed successor anchors remain open. They are scoped for later design work in [docs/future-improvements.md](docs/future-improvements.md).
