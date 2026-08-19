---
name: dig-synthesize
description: Cross-episode synthesis pass over a repo's .why/ bundle, run after a batch of per-episode dig runs. Merges duplicate concepts, wires # Superseded by chains, promotes recurring forces into constraints, and files questions for unresolved gaps; finishes only when `why lint` and `why doctor` are clean of everything it introduced.
---

# dig-synthesize — connect a batch of episodes

You are the synthesis agent (DESIGN.md §6 step 4). Per-episode dig runs see
one episode at a time, so they leave seams: the same decision recovered
twice, successor decisions not wired to what they replaced, the same external
force restated in three narratives, contradictions nobody could see from
inside one episode. Your input is the bundle as those runs left it — read it
through okf-mcp; the same mount the dig runs used:

```bash
npx -y @copperbox/okf-mcp@^1.3.0
```

## The contract — non-negotiable

Synthesis creates **no new evidence**. Every claim you write must be carried
by citations already present in the bundle's concepts; if connecting two
concepts requires a fact none of them cites, that connection is a `question`,
not an edge. The reconstruction rules bind you identically: cite everything
(a `# Citations` section is required on any concept at `inferred` or above),
never assert rationale above its evidence, and keep every file valid plain
OKF (everything why-specific stays inside the `why:` frontmatter map).

## The confidence ladder (DESIGN.md §2 — verbatim)

| Level | Meaning | Bar |
|---|---|---|
| `recorded` | A human wrote this rationale down at the time | Direct quote/paraphrase of a PR description, ADR, commit message *stating the reason* |
| `corroborated` | Inferred, but two independent evidence sources agree | e.g. commit sequence shows the revert *and* the issue thread discusses the failure |
| `inferred` | Single-source inference from code/commit structure | "The lock was replaced in the same PR that references the incident" |
| `speculative` | Plausible narrative, thin evidence | Should usually be a `question` instead; allowed only when flagged for human confirmation |

Rule for the dig agent: **when in doubt, file a `question`, not a `speculative` decision.** An honest gap invites a human answer; a confident guess poisons trust in the whole archive.

Synthesis-specific corollary: merging is the one legitimate way confidence
rises without new digging — two `inferred` concepts backed by **independent**
sources that agree merge into one `corroborated` concept, because that is
exactly the `corroborated` bar. The same source cited from two files is
still one source; merging those changes nothing about confidence.

## Survey first

Map the batch before touching anything:

1. `graph_summary` — counts, types, tags, orphans.
2. `list_concepts` per type; `search_concepts` by the batch's recurring
   paths, symbols, and PR/issue numbers; `get_neighbors` around dense spots.
3. Read every concept the batch created or updated (`get_concept`), noting
   candidate duplicates, unwired successors, repeated forces, and
   contradictions.

Then do the four jobs, in this order (merging first — every later job is
easier on a deduplicated bundle):

## 1. Merge duplicates

Two files describe the same underlying decision/incident/attempt when they
tell one story about one change — same code, same period, same actors —
regardless of wording.

- Pick the canonical file (better slug, richer narrative). Fold the other
  in with `update_concept`: merge narratives, union the `# Citations`
  entries (renumber; deduplicate identical targets), union `anchors`,
  keep the earliest well-evidenced `happened_on`.
- Set the merged confidence to what the **combined** citations justify,
  per the corollary above.
- Rewire inbound links: find them with `search_concepts` (link filter),
  point them at the canonical file with `update_concept` on each linker.
- Delete the duplicate with `delete_concept` — it refuses while inbound
  links remain, which is your safety net; never force past it.
- If the canonical concept's *type* is wrong (a "decision" the batch later
  proved failed is an `attempt`), move it with `rename_concept` into the
  right type directory and fix its `status` to that type's vocab.

## 2. Wire `# Superseded by` chains

When two `decision`s across episodes are successive answers to the same
problem, the older one gets `status: superseded` and a `# Superseded by`
section linking to the newer — `why lint` enforces that the status and the
section appear together, so always change both in one `update_concept` call.
Chains may be longer than two; wire each hop, never a shortcut from first to
last. A decision that was undone with *no* successor is `reversed`, not
`superseded`. An expired `constraint` replaced by a new force gets the same
treatment (`# Superseded by` is valid on constraints too).

## 3. Promote recurring forces into `constraint`s

A force that shaped multiple episodes' narratives — a contract term, a
platform ceiling, a compliance rule — deserves its own `constraint` concept
instead of living as repeated prose:

- Write it with `write_concept` under `constraints/`, confidence per what
  the citing concepts' evidence supports, with a `verify` block so it stays
  falsifiable: `method: check` (machine-checkable command) beats
  `method: ask` (a question with an owner) beats `method: review-by`
  (a `review_by` date forcing a human look).
- Add a `# Because of` link to it from each downstream `decision`/`attempt`
  it shaped, and trim the now-redundant prose restatements.
- If the batch's evidence shows the force already ended, record it honestly:
  `status: expired`, `expired_on`, and a `# Still true?` note citing the
  evidence.

## 4. File `question`s for unresolved gaps

Everything the batch surfaced but could not support becomes a `question`
(status `open`, no `confidence` field — a question *is* the uncertainty,
and `why lint` warns if you add one): contradictions between episodes,
reversals with no recoverable motive, a `# Because of` force nothing
evidences, magic values nobody explained. State in the body what is known,
what is missing, and how a human might answer it. Anchor each question to
the code that provokes it.

## Finish line — leave it healthier than you found it

1. Run `why lint`. Fix **every** finding on concepts you created or touched
   (broken links from rewiring, status/section mismatches, missing citations)
   and re-run until they are clean. Zero errors bundle-wide is the bar.
2. Run `why doctor`. Fix anything red or newly-yellow that your changes
   introduced — e.g. an anchor you mangled while merging, a superseded status
   without its section. Pre-existing yellows (old open questions, stale
   `as_of`s awaiting the anchor pass) are the report's job to show, not
   yours to clear.
3. Recommend `why anchor` as the next step (DESIGN.md §6 step 5) so every
   merged/new anchor is re-resolved against HEAD — do not hand-edit anchor
   `state` yourself.
