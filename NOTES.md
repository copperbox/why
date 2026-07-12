# NOTES — implementation findings

Working observations that feed DESIGN.md decisions. Newest first.

## Blame-trace resolver: why not `git log -L` (issue 202, feeds open problem #1)

The issue's suggested starting point was `git log -L<start>,<end>:<path>
<as_of>..HEAD --follow`. Tried on the test matrix (git 2.39.5, throwaway
repos); it is structurally the wrong primitive for tracing an *as_of-relative*
range forward. Observed failure modes:

1. **The range is interpreted at the newest revision, not at `as_of`.**
   `git log -L5,8:f.txt <as_of>..HEAD` after a commit inserting 10 lines at
   the top traced the *inserted* lines ("new 5".."new 8"), not the anchored
   ones. Our anchor claim is defined at `as_of`; `-L` walks backwards from the
   tip, so the query is inverted at the foundation.
2. **The path is also newest-revision.** After `git mv f.txt g.txt`,
   `-L…:f.txt` dies with `fatal: There is no path f.txt in the commit`. The
   caller would need the HEAD-side path — which is part of what we're trying
   to compute. (Also, `-L` cannot be combined with an explicit `--follow`;
   its internal rename-following only helps walking backwards.)
3. **A deleted file is a hard `fatal`,** indistinguishable up front from a
   typo'd path — no way to get a `lost: file-deleted` verdict out of it.
4. **Pure shifts and pure renames produce no output at all.** Commits that
   move the range without modifying its content aren't listed, so there is no
   machine-readable mapping from the old range to the new one — the one thing
   the resolver exists to produce. You'd have to parse the newest listed diff
   hunk *and* hope some commit touched the range.

Conclusion: `-L` answers "how did these HEAD lines evolve?" (archaeology,
useful for `why dig`) — not "where did these as_of lines go?" (liveness).

**What shipped instead** (`src/trace-range.ts`): walk the first-parent commit
sequence `as_of..HEAD`; per step, `git diff --name-status --find-renames`
classifies the tracked file's fate (modified / renamed / deleted / type-
changed) and zero-context hunks shift or kill each tracked line individually.
Before returning a live result, every surviving line's HEAD content is
compared byte-for-byte against its as_of content — the never-silently-wrong
backstop. Shrink policy for partial edits is documented in the module header
(bounding span of verified survivors).

Known limits of the shipped approach (candidates for the torture test, issue
206, and the open problem #1 decision):

- **Delete-then-re-add reports `file-deleted`** even if identical content
  returns later (e.g. a revert). Continuity is broken and re-anchoring after
  a resurrection is symbol-resolver territory (issue 203).
- **Cross-file moves are not followed.** If the anchored function moves to
  another file while `--find-renames` doesn't classify the whole file as a
  rename, the range dies as `content-rewritten`/`file-deleted`. `-C`
  (copy detection) or the symbol resolver could recover this; measure first.
- **Rename detection is similarity-based.** A rename plus a heavy same-commit
  edit can drop below git's threshold and appear as delete+add →
  `file-deleted`. Honest, but earlier than a human would call it.
- **Merges are traced along first parents.** Net effect of a merge is one
  diff step; ranges edited *conflictingly* on both sides resolve to whatever
  the merge result says, which is correct but coarse.
- **Wholesale rewrite → `lost: content-rewritten`** with no successor
  suggestion. Whether `lost` + re-dig suffices, or decisions need a
  human-confirmed successor anchor, is exactly open problem #1 — decide from
  torture-test data.

Worth benchmarking later: `git blame --reverse --porcelain -L<start>,<end>
<as_of>..HEAD -- <path>` got the insert+rename case *right* in a quick
experiment (HEAD-side line numbers and the renamed filename per line). It
could be a cross-check oracle in the torture test; it wasn't chosen as the
primary because survival-vs-death per line needs sha comparison against HEAD,
delete/rewrite verdicts still need separate classification, and its rename
handling under merges is less predictable than an explicit forward walk.
