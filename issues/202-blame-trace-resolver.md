# Blame-trace resolver: track a line range from as_of to HEAD
Labels: phase:2

## Context

DESIGN.md §4 resolution order, step 2. The core liveness primitive: given `{path, lines, as_of}`, compute where those lines live at HEAD — or prove they're gone. Start with `git log -L<start>,<end>:<path> <as_of>..HEAD --follow`-based tracing; measuring where that breaks is part of the deliverable.

## Scope

- `traceRange(repo, anchor) → { path, lines } | { lost: true, reason }`, pure library function, no bundle knowledge.
- Must handle: file renamed (follow), range shifted by edits above it, range partially edited (shrink to surviving lines; document the policy in code), file deleted (`lost: "file-deleted"`), range fully rewritten (`lost: "content-rewritten"`).
- Deterministic and side-effect-free: read-only git commands only.
- A `NOTES.md` section (or PR body) recording observed failure modes of the `-L` approach on the test matrix — this feeds the DESIGN.md open problem #1 decision.

## Acceptance criteria

- [ ] Tests construct throwaway git repos (temp dir, scripted commits) covering every case above; no test depends on this repo's history.
- [ ] Shift case: 10 lines inserted above the range → traced range moves down 10, same content.
- [ ] Rename case: `git mv` + edit elsewhere → traced path updates, lines stable.
- [ ] Rewrite case: replacing the function body wholesale → `lost: "content-rewritten"`, not a wrong range. **A silently-wrong result in any test is a failed PR, per the project invariant.**

## Out of scope

Symbol-based resolution, writing anchors back, CLI wiring.
