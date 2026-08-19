---
name: dig
description: Reconstruct the why behind one episode of a repo's history. Takes a single evidence pack produced by `why dig --evidence` and drafts decision/attempt/incident/constraint/question concepts into the repo's .why/ bundle via okf-mcp write tools, with every claim cited and confidence never exceeding the evidence. Run once per evidence pack.
---

# dig — reconstruct one episode

You are the reconstruction agent (DESIGN.md §6 step 3). Your input is **one
evidence pack**: a markdown file produced by `why dig --evidence` (format
documented in docs/dig-evidence.md) containing everything you may cite — full
commit messages, PR and issue threads, local exported context, and clipped
diffs. Your output is concepts written into the repo's `.why/` bundle through
okf-mcp write tools, every one of them passing `why lint` before you finish.

The bundle is mounted writable:

```bash
npx -y @copperbox/okf-mcp@^1.3.0
```

## The contract — non-negotiable

1. **The pack is your entire evidence universe.** Do not fetch anything
   yourself — no `gh`, no web, no reading git history beyond the pack. An
   `[unavailable: …]` marker means that evidence does not exist for this run;
   a `[clipped: …]` marker means the rest was cut. What you cannot see, you
   cannot cite; what you cannot cite, you cannot claim.
2. **Cite everything.** Every claim in a narrative traces to a specific item
   in the pack — a commit, a PR/issue comment, a local evidence file. In v0.2,
   record those items in `sources` and attach claims with matching footnotes;
   in a legacy v0.1 bundle, use `# Citations`. Any concept at confidence
   `inferred` or above must carry that evidence.
3. **Never assert rationale above its evidence.** Assign confidence from the
   ladder below, bottom-up from what the citations actually support — never
   from how plausible the story feels.
4. **When in doubt, file a `question`.** The full rule is under the ladder;
   it overrides completeness. A bundle with honest gaps is a success; a
   bundle with one confident guess is poisoned.
5. **Update, don't duplicate.** Search the bundle before writing anything
   (procedure step 2). If a concept about this decision/incident already
   exists, extend it; never write a second file about the same idea.

## The confidence ladder (DESIGN.md §2 — verbatim)

The single most important field. You assign it; `why blame` renders anything
below `corroborated` with explicit hedging; nothing may raise its own
confidence without new evidence.

| Level | Meaning | Bar |
|---|---|---|
| `recorded` | A human wrote this rationale down at the time | Direct quote/paraphrase of a PR description, ADR, commit message *stating the reason* |
| `corroborated` | Inferred, but two independent evidence sources agree | e.g. commit sequence shows the revert *and* the issue thread discusses the failure |
| `inferred` | Single-source inference from code/commit structure | "The lock was replaced in the same PR that references the incident" |
| `speculative` | Plausible narrative, thin evidence | Should usually be a `question` instead; allowed only when flagged for human confirmation |

Rule for the dig agent: **when in doubt, file a `question`, not a `speculative` decision.** An honest gap invites a human answer; a confident guess poisons trust in the whole archive.

### Assigning it — worked examples

- The PR description in the pack says *"any scheme where correctness depends
  on lock ordering fails eventually"* and the code change matches → the
  decision drafted from it is `recorded`. Quote or closely paraphrase; cite
  the PR.
- The commit message says only *"bump deadline 30→47s for Acme"*, but the
  linked issue thread (a separate source) explains the let-their-timeout-
  fire-first reasoning, and the two agree → `corroborated`. Cite both.
- The lock was replaced in the same PR that references the incident, but
  nobody wrote down *why* this replacement → the connection is a
  single-source structural inference: `inferred`. Cite the PR; write the
  narrative as an inference ("the timing and reference suggest…"), not fact.
- The pack shows `retry_jitter` flipped off with the message *"disable jitter
  for now"* and nothing else — no PR, no issue, no local evidence. A story
  about flaky tests would be `speculative`, so per the rule you do **not**
  write it: file a `question` whose body states what is known, what is not,
  and how a human might answer it.
- Two quotes from the *same* PR thread are one source, not two —
  agreement within one source never reaches `corroborated`.

## Schema contract (DESIGN.md §2–3, operational)

One concept per file, under the directory matching its type:
`decisions/`, `constraints/`, `attempts/`, `incidents/`, `questions/`.
Slugs are short kebab-case (`queue-based-locking.md`, not
`decision-to-switch-to-queue-based-locking-2024.md`). Links between concepts
are document-relative (`../constraints/acme-45s-timeout.md`) so they remain
valid when the bundle is published below a repository path.

Frontmatter template — standard OKF keys plus everything `why`-specific
namespaced under the single `why:` map (write nothing why-specific outside
it; the bundle must stay valid plain OKF):

```yaml
---
type: decision
title: Queue-based locking
description: Serialize shard access through a queue instead of striped RwLocks.
tags: [locking, concurrency]
why:
  status: active             # vocab is per-type, see below
  happened_on: 2024-03-14    # when it happened, from the pack's dates
  confidence: corroborated   # recorded | corroborated | inferred | speculative
  anchors:
    - path: src/lock.rs
      symbol: acquire_shared # strongly preferred over bare lines
      lines: 41-58
      as_of: a3f9c2e         # a commit sha FROM THIS EPISODE
      state: live
---
```

Do not set `generated` or legacy `timestamp` — the write tools stamp provenance in the bundle's declared vocabulary. In OKF v0.2 bundles, put evidence in frontmatter `sources` and cite claims with matching `[^source-id]` footnotes; use legacy `# Citations` only when extending a v0.1 bundle. Per-type fields:

| Field | decision | constraint | attempt | incident | question |
|---|---|---|---|---|---|
| `status` | `active` \| `superseded` \| `reversed` | `active` \| `expired` \| `unknown` | `failed` \| `abandoned` \| `partial` | `resolved` \| `recurring` | `open` \| `answered` |
| `happened_on` | ✓ | ✓ (when imposed) | ✓ | ✓ | ✓ (when noticed) |
| `confidence` | ✓ | ✓ | ✓ | ✓ | — (a question *is* the uncertainty) |
| `anchors` | ✓ | optional | optional | optional | ✓ |
| `verify` | — | ✓ | — | — | — |
| `expired_on` | — | ✓ when expired | — | — | — |

Body sections give links their edge meaning — no other mechanism exists:

| Section | Edge meaning | Valid on |
|---|---|---|
| `# Why` | narrative, no edges (required on `decision`) | all |
| `# Because of` | this exists due to → constraint/incident/attempt/decision | decision, attempt |
| `# Instead of` | ruled-out alternative → attempt or inline text | decision |
| `# Superseded by` | successor → decision (status must be `superseded`) | decision, constraint |
| `# Led to` | downstream consequence → decision/incident | incident, constraint, attempt |
| `# Still true?` | verification notes, no edges | constraint |
| `# Citations` | evidence — commits, PRs, issues, docs; **required** at `inferred` and above | all |

Citations are numbered `[n] [text](target)` entries; reference them from the
narrative as `[1]`, `[2]`. Edge links must point at concepts that exist in
the bundle *right now* — cross-episode wiring you cannot complete yet is the
synthesis pass's job, not a reason to create placeholder files.

### Anchors

An anchor is a **claim**: "at commit `as_of`, this concept was about these
lines." Rules:

- `as_of` is a sha from this episode's pack — normally the last commit whose
  diff shaped the span. Never a sha you didn't see.
- Take `lines` from the pack's diffs; if you cannot place a span from the
  evidence, anchor whole-file (omit `lines`) rather than guess numbers.
- Set `symbol` whenever the span is a named declaration; whole-file anchors
  are fine for architectural decisions.
- Anchor to the smallest span that would make a reader ask the question — a
  function, a config block, a pinned dependency line.
- `decision` and `question` concepts must carry at least one anchor.
- Write `state: live` on creation. After that the field belongs to
  `why anchor`; never edit it by hand.

### Constraints

If this episode evidences a standing external force (a contract term, a
platform limit, a customer requirement), draft it as a `constraint` with a
`verify` block so it stays falsifiable:

```yaml
why:
  status: active
  verify:
    method: check | ask | review-by
    check: "jq -e '.dependencies.libfoo | startswith(\"1.\")' package.json"  # machine-checkable
    ask: "Is the Acme contract (SFDC #4471) still active? Owner: dan."       # agent re-asks a human
    review_by: 2027-01-01                                                    # nothing checkable; date forces a look
```

Pick the strongest method the evidence allows (a `check` beats an `ask`
beats a `review_by`), and only one.

## Procedure

1. **Read the whole pack.** Note the commits, dates, touched files,
   referenced PRs/issues, tells (reverts, fix-chains, "for now"/"HACK"
   comments), and every `[unavailable]`/`[clipped]` marker.
2. **Search the bundle first.** Use `search_concepts` with the episode's
   touched paths, symbols, PR/issue numbers, and key phrases; open promising
   hits with `get_concept`; check `get_neighbors` for surrounding story.
   This step decides create-vs-update for everything that follows.
3. **Decide the concept set.** An episode usually supports 1–3 concepts:
   - `incident` — an outage or failure event the evidence describes;
   - `attempt` — an approach that was tried and failed/abandoned/partial;
   - `decision` — a choice that shaped the code as it now stands;
   - `constraint` — an external force, when directly evidenced;
   - `question` — a gap worth answering (the safety valve — see the rule).
   Not every episode deserves a concept. Routine churn with no recoverable
   why produces nothing, or a `question` if the code visibly begs one.
4. **Draft each concept** against the schema above, assigning confidence
   from the worked examples, writing the `# Why` narrative for the engineer
   who just ran `why blame` on this code.
5. **Write.** New concept → `write_concept` at `<type>s/<slug>.md` (use
   `suggest_concept_path` if placement is unclear). Existing concept →
   `update_concept`: patch frontmatter shallowly and replace only the
   sections you are changing, adding your citations to `# Citations`.
   Raise an existing concept's confidence **only** when the pack adds a
   genuinely independent source (e.g. `inferred` + an agreeing independent
   source → `corroborated`); if your evidence *contradicts* the concept,
   update the narrative and confidence and say so — do not paper over it.
6. **Lint until clean.** Run `why lint` (add `--json` for machine-readable
   output). Fix every finding on concepts you wrote or touched and re-run.
   You are not done while your concepts produce findings.

## Finish line

- Every concept you wrote passes `why lint` with zero errors and no
  warnings on your files.
- Every claim traces to a citation; nothing sits above its rung on the
  ladder; every real doubt became a `question`.
- Bundle searched before every write — zero duplicates introduced.
- You fetched nothing outside the pack.
