# `why dig --evidence` — evidence-pack assembly
Labels: phase:3

## Context

DESIGN.md §6 step 2: turn an episode into everything a reconstruction agent may cite, so the agent never fetches on its own (bounded context, no prompt-time surprises).

## Scope

- Input: an episode JSON (from `--episodes`). Output: an evidence pack — one markdown document per episode: commit messages in full, PR title/body/review-thread comments and issue title/body/comments via `gh` (graceful degradation with a clear `[unavailable: …]` marker when there's no remote, no `gh` auth, or the PR predates the remote), plus diffs clipped per-file with a size budget.
- `--evidence-dir <path>`: merge in local exported context (postmortems, chat exports) — files whose names mention an episode's PR/issue numbers or touched paths get included, with provenance headers.
- Deterministic ordering and stable formatting (packs get cached and diffed).
- Respect a total size budget (`--max-chars`, sane default); when clipping, say what was clipped where.

## Acceptance criteria

- [ ] Tests with a temp repo + fixture `gh` (inject a command-runner seam; do NOT hit the network in tests) cover: full pack, missing-remote degradation, evidence-dir matching by issue number and by path, budget clipping markers.
- [ ] Pack format documented in `docs/dig-evidence.md` with an annotated example.

## Out of scope

Reconstruction prompts, concept writing.
