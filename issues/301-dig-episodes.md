# `why dig --episodes` — deterministic episode extraction and tells
Labels: phase:3

## Context

DESIGN.md §6 step 1: the deterministic half of archaeology. Agents do the judgment later; this issue gives them well-shaped raw material.

## Scope

- Walk `git log` over a ref range (default: high-water mark → HEAD; full history on first run) and cluster commits into episodes: merge/PR boundaries first (parse `Merge pull request #N` and squash-merge `(#N)` suffixes), then temporal + file-overlap clustering (same author, <48h apart, overlapping paths) for direct commits.
- Per episode, emit JSON: commits (sha, message, author, date), files touched with churn counts, extracted PR/issue references, date range.
- Tells detection, flagged on the episode and summarized globally: reverts (`Revert "`), fix-chains (≥2 `fix`-prefixed commits touching the same file within an episode window), sudden churn on old-quiet files (churn z-score over trailing window), and comment tells — added lines matching `HACK|workaround|do not|don't|because|temporarily` in diffs.
- `--json` to stdout or `--out <file>`; stable schema documented in a `docs/dig-episodes.md`.

## Acceptance criteria

- [ ] Temp-repo tests: PR-merge history clusters by merge; direct-commit history clusters by the heuristic; a scripted revert and a fix-chain are both flagged with the right episode.
- [ ] Runs against a real repo (point it at this repo's own history in a test marked slow/optional) without crashing and produces parseable output.
- [ ] Schema documented and asserted by a test that validates emitted JSON against it.

## Out of scope

Network calls (`gh` evidence is the next issue), any agent involvement, writing concepts.
