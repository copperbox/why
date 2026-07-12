# Anchor torture test: replay a real history, measure survival
Labels: phase:2

## Context

PLAN.md Phase 2's gate: **>90% of anchors either resolve correctly or honestly report lost — zero silently-wrong anchors.** This issue builds the measurement harness; the number it produces decides DESIGN.md open problem #1.

## Scope

- `test/torture/` harness (runs under `npm run test:torture`, excluded from default `verify` for speed): given a git repo URL/path, a start ref, and a set of seeded anchors (path+symbol+lines at start ref), replay history commit-by-commit (or PR-merge-by-merge) to HEAD, running the resolver at each step; at the end, compare resolved locations against ground truth.
- Ground truth: for the harness's built-in scenario, generate a synthetic repo with scripted refactors so truth is known exactly. Additionally support `--repo <path>` for manual runs against real repos (ground truth then checked by spot-audit output: a markdown report of every anchor's journey).
- Output: survival stats (correct / honestly-lost / WRONG), per-failure journey traces. WRONG > 0 fails the harness run.

## Acceptance criteria

- [ ] Synthetic scenario covers ≥ 8 refactor classes (rename, move, split file, inline, shift, rewrite, delete, revert) and passes with zero WRONG.
- [ ] Report generation tested (structure, not prose).
- [ ] README section in `test/torture/` documenting how to run it against an arbitrary repo and read the report.

## Out of scope

Acting on the results (that's a human/planner decision recorded in PLAN.md).
