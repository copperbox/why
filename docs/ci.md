# CI recipes — the operational story

Four jobs keep an archive honest without anyone remembering to run anything: a
PR gate (the bundle may not merge in a state it cannot back), post-merge
re-anchoring (spans that moved are re-stamped from main), a weekly audit
(constraints are re-verified and expiry becomes a visible event), and post-merge
capture (new decisions are drafted while the rationale is fresh). All four are
run-to-completion commands — no daemon (DESIGN.md §8).

**Anchors are written from `main`, never from a branch.** This is the rule the
whole shape follows from. An `as_of` records the commit a span was verified at,
and a squash merge rewrites a branch's commits into one new commit — so an
`as_of` stamped on a branch names a commit that never reaches `main`, and a
day later names nothing at all. Only `main` hands out commits that `main`
keeps. Everything below is a consequence: the gate does not ask contributors to
re-anchor, and a separate job does it after the merge.

The workflows below are live in this repository under
[`.github/workflows/`](../.github/workflows), running `why` on its own
`.why/` bundle — the self-hosted demo. They execute the CLI from source via
the `why` npm script (`npm run why -- <command>`), since this repo *is* the
package. In a repo that consumes `why` as a dependency, replace
`npm ci` + `npm run why -- …` with `npx -y @copperbox/why …` and drop the
Node setup to taste; everything else transfers unchanged.

## The PR gate: `why lint` + `why anchor --check --allow-drift`

`why lint` fails on schema errors (missing required sections, bad edge
targets, confidence claims without citations).

`why anchor --check --allow-drift` re-resolves every anchor claim against the
PR's HEAD, writes nothing, and exits 1 on exactly one thing: an anchor this PR
**destroyed** — code a concept claimed, now gone. That is the author's problem,
because no amount of re-anchoring recovers it; the concept needs updating or
re-digging.

Drift — a span that merely moved — deliberately does **not** fail. It is
reported, then left to the `why-anchor` job. Failing on drift would force the
author to run `why anchor` on their branch, which stamps `as_of` at a branch
HEAD the squash merge then throws away: the gate would be demanding the one
thing that cannot be done correctly from a branch. An anchor already committed
as `state: lost` does not fail either; surfacing those is `why doctor`'s job.

Use plain `why anchor --check` (no `--allow-drift`) when you want the strict
question — "is this bundle fully up to date with this commit?" — which is the
right check on `main`, not on a PR.

`.github/workflows/why-pr-gate.yml`:

```yaml
name: why-pr-gate

# PR gate (docs/ci.md): the archive may not merge in a state it cannot back.
# `why lint` enforces the schema. `why anchor --check --allow-drift` fails only
# on an anchor this PR *destroyed* — code it claimed is gone, which no
# re-anchoring can recover and which the author has to resolve.
#
# Drift (a span that merely moved) is deliberately not a failure: fixing it here
# would mean running `why anchor` on this branch, stamping an `as_of` that the
# squash merge then discards (DESIGN.md §4). The why-anchor job re-stamps drift
# from main after the merge, where the commit survives.
on:
  pull_request:

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # anchor resolution traces line ranges from as_of to HEAD
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run why -- lint
      - run: npm run why -- anchor --check --allow-drift
```

## Post-merge re-anchoring: `why anchor` from `main`

The job that makes the rule above true. It triggers on every push to `main`,
re-resolves every anchor against the commit that actually landed, and PRs the
frontmatter-only result back. Because it runs with `main` checked out, every
`as_of` it writes names a commit `main` keeps — including for a file *born* on
the squashed branch, which has no earlier commit to point at and is the one
case a contributor could never have anchored correctly.

It PRs back rather than pushing, so branch protection stays on and the diff is
reviewable. Squashing *this* PR is harmless: the `as_of` values inside the
files name `main` commits, and content survives a squash unchanged. The job is
idempotent — a run with nothing to re-stamp opens no PR — so the push its own
merge generates simply finds nothing to do.

Two things to know. Anchors on `main` are briefly stale between a merge and
this PR landing: the bundle is eventually consistent, and `why blame` may
report an old span in that window (it reports an honest `lost`, never a wrong
one). And the `why-anchors` branch is excluded from `why-capture` below, or
capture would draft a concept about the anchor bot.

`.github/workflows/why-anchor.yml`:

```yaml
name: why-anchor

# Post-merge re-anchoring (docs/ci.md, DESIGN.md §4). Anchors are re-stamped
# only from main, never from a branch: `as_of` records the commit a span was
# verified at, and a squash merge rewrites branch commits into one new commit,
# so an as_of stamped on a branch names something that never reaches main. Run
# from main, every as_of is a commit main keeps.
#
# The result is PR'd back rather than pushed, so branch protection stays on and
# the frontmatter-only diff is reviewable. The as_of values inside the files
# name main commits, so squashing *this* PR does not orphan them.
on:
  push:
    branches: [main]

# One at a time: two merges in quick succession would otherwise race to write
# the same branch.
concurrency:
  group: why-anchor
  cancel-in-progress: false

jobs:
  anchor:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0 # anchor resolution traces line ranges from as_of to HEAD
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run why -- anchor
      - uses: peter-evans/create-pull-request@v6
        with:
          branch: why-anchors
          add-paths: .why
          title: "why: re-anchor from main"
          commit-message: "why anchor: re-stamp from ${{ github.sha }}"
          body: |
            Mechanical re-anchoring from `main` (`${{ github.sha }}`).

            `why anchor` rewrites only `why.anchors` entries — never narrative —
            so this diff is frontmatter-only. Anchors are stamped here rather
            than on the contributing branch because a squash merge discards
            branch commits, and an `as_of` must name a commit main keeps.
```

`fetch-depth: 0` matters: blame-tracing an anchor from its `as_of` commit to
HEAD needs that history in the clone. A shallow clone makes honest anchors
unresolvable.

## The weekly audit: `why audit`, expiry becomes an issue

`why audit` sweeps every active constraint: `verify.method: check` commands
run directly; overdue `review_by` dates are flagged; `method: ask` constraints
are listed for an agent session (export them with `--questions-out`, apply the
filled-in questionnaire with `--answers` — the CLI never calls an LLM, so the
scheduled job only reports them). Exit 1 means something *newly expired*: the
constraint's status was flipped in place, evidence was appended to its
`# Still true?` section, and a `question` concept was filed for every active
decision downstream. That is the archive learning something, so the report
becomes a GitHub issue and the write-back becomes a PR; any other failure
fails the job loudly.

`.github/workflows/why-audit.yml`:

```yaml
name: why-audit

# Weekly constraint re-verification (docs/ci.md). `why audit` exits 1 when a
# constraint newly expired — the signal that the archive learned something —
# so the report becomes a GitHub issue and the flipped bundle a PR; any other
# non-zero exit fails the job loudly.
on:
  schedule:
    - cron: "17 6 * * 1" # Mondays 06:17 UTC
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: run the audit
        id: audit
        run: |
          set +e
          npm run --silent why -- audit > audit-report.txt 2>&1
          echo "exit=$?" >> "$GITHUB_OUTPUT"
          cat audit-report.txt
      - name: fail on audit errors
        if: steps.audit.outputs.exit != '0' && steps.audit.outputs.exit != '1'
        run: |
          echo "why audit failed (exit ${{ steps.audit.outputs.exit }})"
          exit 1
      - name: open an issue from the scar-tissue report
        if: steps.audit.outputs.exit == '1'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh issue create \
            --title "why audit: a constraint expired ($(date -u +%Y-%m-%d))" \
            --body-file audit-report.txt
      - name: PR the expiry write-back (status flip + question concepts)
        if: steps.audit.outputs.exit == '1'
        uses: peter-evans/create-pull-request@v6
        with:
          branch: why-audit
          add-paths: .why
          title: "why audit: expired constraint write-back"
          commit-message: "why audit: constraint expired — status flip + downstream questions"
```

Without the write-back PR the flip would evaporate with the runner and the
same constraint would re-expire (and re-open an issue) every week — the flip
and the report travel together or the loop never converges.

## Post-merge capture: `why capture --pr`

When a PR closes, `why capture` drafts a concept from its description and
review thread into `.why/.drafts/` — merged PRs become `decision` drafts,
closed-unmerged ones become `attempt` drafts, anchors come from the merge
commit's diff, and rationale candidates are quoted verbatim with attribution
(docs/capture.md has the full drafting contract). Drafts are never served;
they leave the queue only through the editorial, lint-gated
`why capture --promote` step, so the job PRs the draft back for that human or
agent pass rather than pushing to main.

`.github/workflows/why-capture.yml`:

```yaml
name: why-capture

# Post-merge capture (docs/ci.md, docs/capture.md): when a PR closes, draft a
# concept from its discussion into .why/.drafts/ while the rationale is fresh, and
# PR the draft back for the editorial promotion step (skills/capture).
on:
  pull_request:
    types: [closed]

jobs:
  capture:
    # `why`'s own bot PRs carry no rationale to capture — drafting from them
    # would recurse and record the machinery instead of a decision.
    if: github.event.pull_request.head.ref != 'why-drafts' && github.event.pull_request.head.ref != 'why-anchors'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0 # capture reads the merge commit's diff
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run why -- capture --pr ${{ github.event.pull_request.number }}
        env:
          GH_TOKEN: ${{ github.token }}
      - uses: peter-evans/create-pull-request@v6
        with:
          branch: why-drafts
          add-paths: .why
          title: "why: capture draft for #${{ github.event.pull_request.number }}"
          commit-message: "why capture: draft from #${{ github.event.pull_request.number }}"
```

Notes:

- The job is idempotent per PR — re-running against an already-drafted PR
  exits with "already exists — promote or remove it before re-capturing".
- Drafts accumulate on the `why-drafts` branch until someone runs the capture
  skill (or edits by hand) and promotes; pairing a weekly look at
  `.why/.drafts/` with the audit job's cadence works well.
- `ref: main` + `fetch-depth: 0`: without the merge commit in the clone,
  capture still drafts but honestly reports "no anchors derived".

## What stays out of CI

Digging (docs/digging.md) is an agent-driven, judgment-heavy pass — run it
deliberately, not on a schedule. The `method: ask` questionnaire loop is the
same kind of work: the audit job *reports* ask-constraints; answering them is
an agent session with `why audit --questions-out` / `--answers`.
