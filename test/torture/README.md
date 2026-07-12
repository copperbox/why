# Anchor torture test

The measurement harness for PLAN.md Phase 2's gate: **>90% of anchors either
resolve correctly or honestly report lost — zero silently-wrong anchors.** The
number this produces decides DESIGN.md open problem #1 (wholesale-rewrite
policy); acting on the results is a human/planner decision recorded in
PLAN.md, not something this harness does.

## What it does

Given a repo, a start ref, and a set of seeded anchors, the harness:

1. Clones the repo into a temp dir (the original is never touched).
2. Checks out the start ref and plants a `.why/` bundle there — one minimal
   concept per seeded anchor, `as_of` the start ref, `state: live`. The
   bundle stays untracked, so checkouts leave it alone.
3. Replays `startRef..HEAD` **first-parent** commit by commit (on a PR-based
   history that means merge-by-merge), running the real `why anchor` command
   at every step — the same compounding, write-back loop a CI hook would run.
4. Records every anchor's journey (span + state after each commit) and, when
   ground truth is available, judges each final claim:

   | verdict | meaning |
   |---|---|
   | `correct` | the final claim matches ground truth — including honestly reporting `lost` for code that is truly gone |
   | `honestly-lost` | the code still exists somewhere, but the resolver gave up and said `lost`; a recall gap, never a lie |
   | `WRONG` | the final claim is **live and points at the wrong code** — the one outcome the project promises never happens |

**WRONG > 0 fails the run** (test assertion / exit code 1). `honestly-lost`
only lowers the survival rate.

## Running the built-in scenario

```sh
npm run test:torture
```

Deliberately excluded from `npm run verify` (it clones and replays a repo per
run). The scenario scripts nine refactor classes, one commit each, over a
synthetic repo so ground truth is exact: **rename**, **move**, **split file**,
**inline**, **shift**, **rewrite**, **delete**, **revert**, plus an untouched
control. The test asserts zero WRONG, pins the expected verdict per class,
and checks the report structure.

## Running against a real repo

```sh
npx tsx test/torture/run.ts \
  --repo ../okf-mcp \
  --start v0.10.0 \
  --anchors anchors.json \
  --report torture-report.md
```

`--repo` takes any path or URL git can clone. `--start` is the ref the
anchors were written against. `--anchors` is JSON — either a bare array of
anchors, or an object when you also know some ground truth:

```json
{
  "anchors": [
    { "id": "load-bundle", "path": "src/bundle.ts", "symbol": "loadBundle", "lines": "120-160" },
    { "id": "server-entry", "path": "src/server.ts" }
  ],
  "expectations": {
    "load-bundle": { "kind": "span", "path": "src/load.ts", "lines": "88-130" },
    "server-entry": { "kind": "lost" }
  }
}
```

Anchor fields mirror the `why.anchors` schema: `path` (repo-root-relative),
optional `symbol`, optional `lines` (`"41-58"` or `"41"`, as a string; omit
for a whole-file anchor). Seed them by reading the code at `--start` — pick
spans a real concept would anchor (a function, a config block).

Caveat: the target repo must not track its own `.why/` directory at the start
ref — the harness plants one there and refuses to clobber an existing archive.

## Reading the report

- **Survival** — the headline counts, and the gate percentage when ground
  truth was given. Without expectations the report says so and shows final
  live/lost counts instead: ground truth is then *you*, spot-auditing.
- **Failures** — every WRONG anchor with its final claim vs the truth.
- **Journeys** — one section per anchor: the seeded claim, the expected and
  final spans, then a table with one row per replayed commit. A `*` next to
  a commit sha means `why anchor` rewrote the claim at that step — a healthy
  journey shows `*` exactly at the commits that touched the anchored code.
  For spot-audits, follow an anchor's rows across the refactors you know
  happened and check the spans track them; a lost row that never recovers on
  code you know survived is an honest loss (recall gap), while a live row
  pointing somewhere the concept isn't about is a WRONG the harness could
  not see without expectations.
