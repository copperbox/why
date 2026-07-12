# `why dig --evidence` — the evidence pack format

DESIGN.md §6 step 2. `why dig --evidence <episodes.json>` turns each episode
from `why dig --episodes` into one markdown document — the *evidence pack* —
holding everything the reconstruction agent (§6 step 3) may cite: full commit
messages, PR and issue threads fetched via `gh`, local exported context, and
per-file-clipped diffs. The agent works from the pack alone and never fetches
on its own, so its context is bounded and there are no prompt-time surprises.

```
why dig --evidence episodes.json [--evidence-dir <dir>] [--max-chars <n>] [--out <dir>]
```

- **Input** — an episodes JSON file: a bare array or `{"episodes": [...]}`.
  Each episode needs a non-empty `commits` array (`{"sha": …}` objects or bare
  sha strings; an optional `message` is used only as a fallback when the sha
  is missing from the clone). Optional: `id` (defaults to the first sha,
  shortened), `files` (strings or `{path, …}` objects), `prs`, `issues`
  (numbers or digit strings).
- **Output** — one `<episode-id>.md` per episode, default under
  `<bundle>/.cache/evidence/` (self-ignoring, like the anchor-index cache);
  `--out <dir>` redirects to a directory you manage yourself.
- **Determinism** — packs get cached and diffed, so a pack contains no
  timestamps and uses stable ordering throughout: commits in episode order,
  references deduped and sorted ascending, local evidence sorted by path.
  Same inputs → byte-identical pack.

Two invariants, matching the project's ground rules:

- **Nothing degrades silently.** Anything the assembler could not fetch —
  no git remote, `gh` missing or unauthenticated, a PR that predates the
  remote, a sha absent from the clone — becomes an explicit
  `[unavailable: <what> — <why>]` marker in the pack (and on stderr-adjacent
  CLI output), never a missing section.
- **Nothing is dropped without saying where.** Size limits leave
  `[clipped: …]` markers naming exactly what was cut and how much.

## Budgets

- `--max-chars <n>` (default **200000**, ~50k tokens) caps the whole pack.
  Blocks are assembled in rationale-density order — header, commits, PRs,
  issues, local evidence, diffs — so under pressure prose survives and diffs
  are what gets cut. The first overflowing block is truncated in place with a
  `[clipped: --max-chars <n> reached — <block> truncated]` marker (an open
  diff fence is re-closed so the document stays well-formed); everything
  after it collapses into one final
  `[clipped: --max-chars <n> reached — omitted: …]` line listing what was
  dropped. Only the markers themselves may exceed the budget.
- Each individual file diff — and each local evidence file — is additionally
  capped (8000 chars) with a `[clipped: diff of <path> in <sha> — showing X
  of Y chars]` marker, so one giant lockfile diff can't starve the rest.

## `--evidence-dir` — local exported context

The escape hatch for rationale that lives outside git (DESIGN.md open
problem 3): postmortems, chat exports, docs. Files under the directory
(recursively; dot-files skipped) are matched **by filename** against the
episode:

- a filename mentioning one of the episode's PR/issue numbers,
  digit-bounded — `postmortem-7.md` matches PR #7; `notes-30.md` does *not*
  match #3;
- or a filename mentioning a touched path's basename — with extension
  (`lock.rs`) or as a bare stem of ≥ 3 characters (`lock`), case-insensitive.

Matched files are embedded under `## Local evidence` with a provenance
header naming the source path and why it matched. If the directory was given
but nothing matched, the section says so rather than vanishing. A file that
is not UTF-8 text is listed with an `[unavailable: …]` marker instead of its
content.

## Annotated example

Generated from a two-commit repo with no remote and
`--evidence-dir` pointing at a folder containing `postmortem-7.md`.
Annotations in `<-- like this` are not part of the format.

````````markdown
# Evidence pack: queue-locking          <-- episode id (or first sha if none)

- commits: 7c9cadb, a31b8ad             <-- episode order, never re-sorted
- files touched: src/lock.rs
- references: PR #7, issue #3           <-- deduped, ascending

## Commits                              <-- messages IN FULL, from `git show`,
                                            not the episode JSON's copy
### commit 7c9cadb

- author: t <t@e.c>
- date: 2026-07-12

add striped lock

### commit a31b8ad

- author: t <t@e.c>
- date: 2026-07-12

replace striped locks with queue (#7)

The striped RwLock deadlocked under load.

## Pull requests                        <-- via `gh pr view --json`; with a
                                            remote this holds title, body,
                                            comments, and review verdicts
[unavailable: PR #7 — no git remote configured]

## Issues                               <-- via `gh issue view --json`

[unavailable: issue #3 — no git remote configured]

## Local evidence                       <-- only when --evidence-dir is given

### postmortem-7.md

[source: /exports/postmortem-7.md — matched PR #7]   <-- provenance header

We hit the deadlock in staging first.

## Diffs                                <-- last: first to go under budget

### diff of commit 7c9cadb              <-- one fenced block per file, each
                                            clipped at the per-file cap
````diff
diff --git a/src/lock.rs b/src/lock.rs
new file mode 100644
index 0000000..6c39e57
--- /dev/null
+++ b/src/lock.rs
@@ -0,0 +1 @@
+fn acquire() {}
````
````````

With a reachable remote, the PR section instead looks like:

```markdown
### PR #7 — Replace striped locks with queue

by @jane

Serializes shard access through a queue.

Comments:

- **alice** (2026-07-01):
  What about deadlocks?

Reviews:

- **bob** [approved] (2026-07-02):
  LGTM after the fix.
```

Review entries carry their verdict (`[approved]`, `[changes_requested]`);
body-less `COMMENTED` reviews are dropped as noise. Diff fences use four
backticks so diffs that themselves contain markdown code fences cannot break
the document.
