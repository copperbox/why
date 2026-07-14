# Digging a repo — the archaeology runbook

The end-to-end sequence for recovering a `.why/` bundle from history
(DESIGN.md §6). Judgment lives in agent prompts; everything deterministic
lives in the CLI:

| Step | What | Runs as |
|---|---|---|
| 1 | Episode extraction | `why dig --episodes` (deterministic) |
| 2 | Evidence packs | `why dig --evidence` (deterministic + `gh`) |
| 3 | Reconstruction, per episode | agent, prompted by [skills/dig/SKILL.md](../skills/dig/SKILL.md) |
| 4 | Cross-episode synthesis, per batch | agent, prompted by [skills/dig-synthesize/SKILL.md](../skills/dig-synthesize/SKILL.md) |
| 5 | Anchor pass | `why anchor` (deterministic) |

## Prerequisites

- A `.why/` bundle at the repo root — `why init` scaffolds one.
- `gh` installed and authenticated for step 2's PR/issue threads. Optional:
  without it, packs degrade to explicit `[unavailable: …]` markers and the
  dig agents simply have less to cite (they never fetch on their own).
- For steps 3–4, an agent session with the bundle mounted writable:
  `npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable`, and the
  relevant skill loaded (in Claude Code, install `skills/dig` and
  `skills/dig-synthesize` as project skills and invoke them per pack/batch).

## The steps

### 1. Extract episodes

```bash
why dig --episodes --out episodes.json
```

Walks git history and clusters commits into candidate episodes — merge/PR
boundaries first, temporal + file-overlap clustering for direct-commit
histories — and flags *tells*: reverts, fix-after-fix chains, sudden churn on
long-quiet files, comment tells (`HACK`, `workaround`, `for now`, …). Tells
mark high-value dig sites; use them to order step 3.

### 2. Assemble evidence packs

```bash
why dig --evidence episodes.json [--evidence-dir <exports>] [--max-chars <n>] [--out <dir>]
```

One deterministic markdown pack per episode — full commit messages, PR/issue
threads via `gh`, local exported context, per-file-clipped diffs — landing in
`<bundle>/.cache/evidence/` by default. `--evidence-dir` is the escape hatch
for rationale living outside git (postmortems, chat exports): files matching
an episode's PR/issue numbers or touched filenames get embedded with
provenance headers. Format and budgets: [dig-evidence.md](dig-evidence.md).

### 3. Reconstruct, one agent run per pack

For each pack, run an agent on [skills/dig/SKILL.md](../skills/dig/SKILL.md)
with the pack as its input. The skill binds it to the schema contract: work
only from the pack, cite everything, assign confidence from the DESIGN.md §2
ladder, prefer a `question` over a `speculative` guess, search the bundle
before writing (update, don't duplicate), and finish only when `why lint` is
clean. One episode at a time keeps context bounded and hallucination pressure
low — do not batch packs into one run.

### 4. Synthesize, once per batch

After a batch of episode runs (an era on cold start, the new episodes on an
incremental run), run one agent on
[skills/dig-synthesize/SKILL.md](../skills/dig-synthesize/SKILL.md): merge
duplicates, wire `# Superseded by` chains, promote recurring forces into
`constraint`s, file `question`s for the gaps, then leave `why lint` and
`why doctor` clean of anything it introduced.

### 5. Anchor pass

```bash
why anchor        # re-resolve every anchor claim against HEAD
why doctor        # bundle health: lost anchors, stale as_of's, open questions
```

`why anchor` re-resolves the new concepts' anchors (symbol-first, then
blame-trace, then honestly `lost` — never a silent guess). Finish with
`why doctor` for the health picture, and spot-check a few stories with
`why blame <path>` to see what an engineer will actually get.

## Cold start: dig era by era, oldest first

A first dig on a big repo must not process history in one pass — synthesis
needs to see events in causal order, the way the team lived them (a decision
digested before the incident that caused it reads backwards). Chunk history
into **eras** at natural boundaries — major releases, architecture changes,
year marks; a few hundred commits per era is a good size — and run steps 1–4
per era, oldest era first, before moving forward. Later eras then find the
earlier concepts already in the bundle, so their dig runs *update* them
(a decision gets superseded, a constraint expires) instead of rediscovering
them out of order.

Priority order within a cold start (usefulness per token): **tells first**,
then the most-blamed hot files, then breadth. A first dig that nails the 20
weirdest places in the repo beats a shallow sweep of everything.

## Incremental re-digs: the high-water mark

Routine digs are incremental. `.why/.dig-state.json` records, per branch, the
last commit a successful `why dig --episodes` run processed — plain,
schema-versioned JSON:

```json
{ "version": 1, "branches": { "main": { "lastProcessed": "<full sha>" } } }
```

The next run's default range starts at that mark; `--from <rev>` starts
anywhere, `--full` re-digs all history. The mark advances to HEAD **only
after a successful episode emission**, atomically (write-temp-rename), so a
killed or failed run never moves it. A mark the repository can no longer
verify — orphaned by a history rewrite, or a state file this build cannot
read — is an explicit error naming the ways out, never a silently wrong
range.

Deleting the state file means "re-dig everything", and that is safe, not
just allowed: episode extraction is deterministic (same history in, same
episodes out), and the dig skill's update-don't-duplicate rule plus the
synthesis pass turn re-encounters into updates, not copies. `why doctor`
reports freshness — how many commits the current branch has accumulated
since the last dig.

## Dry run: the harbor story

A walkthrough of what each step would do on `harbor`, the fictional job-queue
service whose finished bundle lives at [examples/harbor](../examples/harbor)
— the expected *end state* of exactly this pipeline. (Harbor's repo is
fictional, so this is a dry description; nothing here executes in CI.)

**Eras.** Harbor's history splits at its architecture change: era 1 (2023,
the striped-locking design), era 2 (2024–2025, the queue redesign and the
Acme era). Steps 1–4 run twice, era 1 first.

**Era 1 — episodes & evidence.** Step 1 clusters PR #61 ("striped shard
locks") plus the follow-ups PR #114/#171 into episodes; no tells yet. Step 2
packs each with its PR thread. **Reconstruction** drafts one concept: a
*decision* "Striped RwLock" — the PR describes the design and its benchmarks,
so the rationale is written down at the time: `recorded`, cited to PR #61,
anchored to `src/lock.rs` as of that era's HEAD. **Synthesis** over a
one-concept era has nothing to merge and files nothing.

**Era 2 — episodes & evidence.** Step 1 emits, among others:

- the January episode: commit `51be07d` "bump deadline 30→47s for Acme",
  referencing issue #143;
- the March episode: a churn spike on `src/lock.rs` (a tell), the
  postmortem doc commit, and PR #212 "replace striped locks with queue";
- the June episode: commit `9e02c1f` "disable jitter for now" — a comment
  tell ("for now"), no PR, no issue;
- the 2025 episode: issue #612, the Acme contract ending.

Step 2 with `--evidence-dir docs/postmortems` pulls the stall postmortem
into the March pack by filename match.

**Reconstruction, per pack.**

- *January*: the commit message alone would be `inferred`, but the issue
  #143 thread independently explains the fire-first reasoning → a decision
  "47s request deadline" at `corroborated`, plus a constraint "Acme 45s
  gateway timeout" with `verify.method: ask` (the contract is a fact to
  re-ask, not a command to run) at `recorded`, cited to issue #143.
- *March*: an incident "2024-03 lock stall" (`recorded` — the postmortem is
  in the pack) and a decision "Queue-based locking" (`recorded` — PR #212's
  description states the reasoning verbatim). The agent's bundle search
  finds era 1's striped-lock concept and **updates** it instead of
  duplicating: the pack proves the design failed.
- *June*: the pack is thin — one sha, four words, nothing else. Any story
  (flaky test? deterministic-retry customer?) would be `speculative`, so
  per the rule the agent files the *question* "Why is retry jitter
  disabled?" anchored to the config line, and no decision.
- *2025*: issue #612 evidences the Acme contract ending → the constraint is
  updated to `status: expired` with `expired_on: 2025-06-30` and a
  `# Still true?` note.

**Synthesis, after era 2.** The updated striped-lock concept is really a
failed *attempt* now — it moves to `attempts/striped-rwlock.md`
(`status: failed`) with inbound links rewritten; "Queue-based locking" gets
its `# Because of` edges (incident + attempt) and `# Instead of` edge; the
"47s request deadline" keeps its `# Because of` edge to the now-expired
constraint — which is the §5 payoff: `why blame` will flag the deadline as
candidate scar tissue. No `# Superseded by` chain exists in harbor (the
queue replaced a failed attempt, not a prior decision — supersession would
apply if, say, a queue-v2 later replaced it). The jitter question stays
open. Nothing merges; lint and doctor come back clean of introduced
findings.

**Anchor pass.** `why anchor` re-resolves the six concepts' anchors against
harbor's HEAD; `why doctor` shows the expired constraint (yellow, by
design) and the open question. The result is byte-for-byte the shape of
[examples/harbor](../examples/harbor): incident → failed attempt → decision
→ constraint → expired-constraint fallout → open question — one complete
causal story, every claim cited, nothing asserted above its evidence.
