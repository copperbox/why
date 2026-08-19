# Merge-time capture — recording the why while it's fresh

Digging history (docs/digging.md) is the cold start. The steady state is
capture at decision time: the moment a PR merges, its description and review
thread still hold the why, so a concept drafted *now* earns confidence
`recorded` — the top of the ladder — instead of being excavated later at
`inferred`. This is DESIGN.md open problem #5, and `why capture` is its
pipeline: cheapest data, best data.

Like the dig pipeline, judgment is split out of the CLI. `why capture` is
deterministic assembly; the editorial step that turns a draft into a finished
concept is [skills/capture/SKILL.md](../skills/capture/SKILL.md).

## The drafts directory: `.why/.drafts/`

Everything `why capture` emits is a **draft**, written to `.why/.drafts/` —
deliberately a dot-directory. okf-mcp's bundle walk serves every non-dot
`.md` under the bundle root and skips dot-directories only, so a plain
`.why/drafts/` would leak unedited machine output straight into `why blame`
and the mounted bundle. The dot-dir keeps drafts invisible to bundle loads,
`why blame`, `why lint`, `why doctor`, and the anchor index (whose content
hash also skips dot-directories) until a human or agent promotes them.

Drafts are meant to be committed: they are the promotion queue, not derived
state, so `.why/.drafts/` carries no self-ignoring `.gitignore` the way
`.why/.cache/` does.

## Drafting

```bash
why capture --pr 212          # primary: from a merged or closed PR, via gh
why capture --commit a3f9c2e  # fallback: from a local commit, no gh needed
```

`--pr` asks `gh` for the PR's state, discussion, and merge commit, then:

- **Type is guessed by outcome.** Merged → `decision` (status `active`);
  closed without merging → `attempt` (status `abandoned`); a still-open PR is
  refused — capture records outcomes.
- **`happened_on`** comes from the merge/close time.
- **Review pressure** is explicit: `owner` is the PR author, `captured_on` is
  the capture date, and `review_by` defaults to fourteen days later. `why
  review` uses these fields for its consolidated inbox.
- **Anchors come from the merge diff's hunks**: one anchor per hunk's
  new-side span (zero-context, exact to the changed lines), `as_of` the merge
  commit, `state: live`. A file with many hunks collapses to one whole-file
  anchor, said out loud; a deleted file anchors nothing; an unmerged PR gets
  no anchors at all — its diff never landed, so anchoring mainline code to it
  would be silently wrong.
- **Citations** point at the PR (and the merge commit, when an `origin`
  remote URL is derivable).
- **Rationale candidates are quoted verbatim**, never paraphrased: the PR
  description always, plus every comment/review paragraph matching the
  rationale-tell vocabulary (because/instead/chose/tradeoff/…), each with
  attribution. The pre-filled `confidence: recorded` is exactly as strong as
  those quotes — the skill's first job is checking they actually state the
  reason.
- **An evidence pack sidecar** (`<draft>.evidence.md`, built by the same
  module as `why dig --evidence`) lands beside the draft with the full
  thread, commit messages, and clipped diffs, so the finishing agent never
  fetches on its own.

`--commit` is the gh-free fallback for repos without PRs: same anchors and
draft shape, with the commit message body as the sole rationale candidate.

Every degradation — no merge commit locally, no remote to link to, zero
rationale candidates (in which case `confidence` is left unset rather than
overstated) — is reported on stdout *and* embedded in the draft as a
`<!-- capture: … -->` note. Re-capturing an existing draft is refused, never
an overwrite.

## Promoting

Promotion out of drafts is an editorial act, not an automatic one:

```bash
why capture --promote pr-212-replace-striped-locks.md
```

The draft is written into the type directory named by its frontmatter
(`decisions/`, `attempts/`, …) via okf-mcp — which stamps version-appropriate generation provenance and
normalizes citations — and the bundle is linted. Any error-severity finding
on the new file rolls the write back and keeps the draft, printing the
findings; warnings and findings elsewhere in the bundle never block. On
success the draft and its evidence sidecar are removed. Rename the draft to
its archive slug *before* promoting: the filename becomes the concept id.

The judgment between those two commands — verifying quotes, rewriting the
narrative, trimming anchors, wiring edges, retyping mis-guessed outcomes — is
the capture skill: [skills/capture/SKILL.md](../skills/capture/SKILL.md).

## Wiring it as a post-merge CI job

Run capture when a PR closes, and commit the draft back via a PR so the draft
itself gets a human glance (a direct push to a `why-drafts` branch works
too). The copy-pasteable workflow lives with the other CI recipes in
[docs/ci.md](ci.md#post-merge-capture-why-capture) — it is the same
`why-capture.yml` this repository runs on itself under `.github/workflows/`.

Notes that survive whatever workflow shape you pick:

- `fetch-depth: 0` (or at least a deep-enough fetch) matters: without the
  merge commit in the clone, capture still drafts but honestly reports "no
  anchors derived".
- The job is idempotent per PR — a re-run against an already-drafted PR exits
  with "already exists — promote or remove it before re-capturing".
- Drafts accumulate until someone runs the capture skill (or edits by hand)
  and promotes. A weekly reminder that lists `ls .why/.drafts/` output pairs
  well with the weekly `why audit` job.

Out of scope here: org-wide webhook plumbing; this recipe is one repo wiring
its own steady state.
