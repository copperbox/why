---
name: capture
description: Turn `why capture` drafts in .why/.drafts/ into finished concepts. Each draft carries machine-extracted rationale quotes, anchors, and citations from one merged/closed PR plus an evidence pack sidecar; the judgment step is verifying the quotes actually state the why, rewriting them into narrative, and promoting through the lint gate. Run once per draft, soon after the merge.
---

# capture — finish one merge-time draft

You are the judgment half of merge-time capture (DESIGN.md open problem #5).
`why capture --pr <n>` already did the deterministic half: it assembled the
PR's evidence into a pack and emitted a draft into `.why/.drafts/` with
frontmatter pre-filled (type guessed from merge-vs-close, `happened_on`,
editorial `owner`/`captured_on`/`review_by`, anchors derived from the merge
diff's hunks, citations to the PR) and the
rationale candidates quoted verbatim. Drafts are deliberately **not served**
— nothing in `.why/.drafts/` reaches `why blame` or the mounted bundle until
you promote it. Your input is one draft plus its `.evidence.md` sidecar; your
output is either a promoted concept, an update to an existing concept, a
`question`, or a recorded reason to drop the draft.

The bundle is mounted writable:

```bash
npx -y @copperbox/okf-mcp@^1.3.0
```

## The contract — non-negotiable

1. **The draft and its evidence pack are your entire evidence universe.** Do
   not fetch anything yourself — no `gh`, no web, no extra git spelunking. An
   `[unavailable: …]` marker in the pack means that evidence does not exist
   for this run. What you cannot see, you cannot cite; what you cannot cite,
   you cannot claim.
2. **The pre-filled `recorded` is a hypothesis, not a fact.** The CLI set
   `confidence: recorded` because a human wrote *something* down at the time.
   `recorded` survives only if the quotes you keep actually **state the
   reason**. Quotes that describe the change without saying why support at
   most `inferred` — and usually mean a `question`.
3. **Never assert rationale above its evidence.** Assign confidence from the
   ladder below, bottom-up from what the kept quotes support — never from how
   plausible the story feels.
4. **When in doubt, file a `question`.** The full rule is under the ladder;
   it overrides completeness.
5. **Update, don't duplicate.** Search the bundle before promoting anything.
   If a concept about this decision already exists, fold the draft into it
   with `update_concept` and delete the draft; never promote a second file
   about the same idea.

## The confidence ladder (DESIGN.md §2 — verbatim)

| Level | Meaning | Bar |
|---|---|---|
| `recorded` | A human wrote this rationale down at the time | Direct quote/paraphrase of a PR description, ADR, commit message *stating the reason* |
| `corroborated` | Inferred, but two independent evidence sources agree | e.g. commit sequence shows the revert *and* the issue thread discusses the failure |
| `inferred` | Single-source inference from code/commit structure | "The lock was replaced in the same PR that references the incident" |
| `speculative` | Plausible narrative, thin evidence | Should usually be a `question` instead; allowed only when flagged for human confirmation |

Rule for the dig agent: **when in doubt, file a `question`, not a `speculative` decision.** An honest gap invites a human answer; a confident guess poisons trust in the whole archive.

Capture-specific application: quotes from one PR thread — description,
comments, reviews — are **one source**. A capture draft alone never reaches
`corroborated`; it is `recorded` when a kept quote states the reason, and it
drops down the ladder from there.

## Procedure

1. **Read the draft and its evidence pack** (`<draft>.evidence.md`, same
   directory). Note every `[unavailable: …]`/`[clipped: …]` marker and every
   `<!-- capture: … -->` note the CLI left — those are honest degradations,
   not decoration.
2. **Search the bundle first.** Use `search_concepts` with the PR number,
   touched paths, and key phrases; open hits with `get_concept`, check
   `get_neighbors`. This decides promote-vs-update before anything else.
3. **Judge the quotes.** Keep only candidates that state or directly evidence
   the why; delete the rest. Verify each kept claim against the pack — the
   draft's extraction is keyword-matched, not judged.
4. **Confirm the type and status.** Merged → `decision` and closed-unmerged →
   `attempt` are guesses. A merged PR that documents a failed direction being
   removed may really be recording an `attempt` or an `incident`; retype and
   move accordingly (the promote step derives the target directory from the
   frontmatter `type`).
5. **Rewrite the body.** Replace the summary comment with what is true now
   because of this change; turn the kept quotes into a `# Why` narrative for
   the engineer who just ran `why blame` here, citing `[1]`, `[2]`. Wire
   `# Because of` / `# Instead of` edges only to concepts that exist in the
   bundle right now.
6. **Trim the anchors.** The CLI anchored every hunk of the diff. Keep the
   spans a reader would actually ask the question from; add `symbol` where
   the span is a named declaration; prefer whole-file only for architectural
   decisions. `as_of` stays the merge commit — never a sha you didn't see.
7. **Rename for the archive.** Draft names carry PR provenance
   (`pr-212-….md`); rename the file to a short kebab-case slug for the idea
   (`queue-based-locking.md`) before promoting — the filename becomes the
   concept id.
8. **Promote.** `why review --promote <draft>` (or the lower-level `why capture
   --promote <draft>`) moves the draft into its type
   directory only if it lints clean; a refusal prints the findings and keeps
   the draft — fix and re-run. If the draft instead folded into an existing
   concept or became a `question` you wrote directly, delete the draft and
   its `.evidence.md` sidecar so the queue stays honest.

## Finish line

- No draft you processed is left in limbo: promoted, folded into an existing
  concept, converted to a `question`, or deleted with the reason recorded in
  the commit message.
- Every promoted concept passed the promote gate (`why lint` clean on it),
  every claim traces to a citation, and nothing sits above its rung on the
  ladder.
- You fetched nothing outside the draft and its pack.
