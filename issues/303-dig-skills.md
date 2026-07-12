# Dig skills: reconstruction and synthesis agent prompts
Labels: phase:3

## Context

DESIGN.md §6 steps 3–4: the judgment half. Ships as Claude Code skills (markdown prompt-docs under `skills/`), NOT as code that calls an LLM API — the CLI stays deterministic; agents drive the CLI.

## Scope

- `skills/dig/SKILL.md`: instructs an agent to take one evidence pack and draft concepts — embedding the schema contract (DESIGN.md §2–3 restated operationally), the confidence ladder with assignment examples, the cite-everything rule, prefer-`question`-over-`speculative`, and update-don't-duplicate (search the bundle first). Output via okf-mcp write tools against the repo's `.why/` bundle; every written concept must pass `why lint` before the agent finishes.
- `skills/dig-synthesize/SKILL.md`: the cross-episode pass — merge duplicates, wire `# Superseded by` chains, promote recurring forces into `constraint`s, file `question`s for unresolved gaps; ends by running `why lint` and `why doctor` and fixing what it introduced.
- A `docs/digging.md` runbook: the end-to-end sequence (episodes → evidence → per-episode skill runs → synthesis), including the era-chunked cold-start order from DESIGN.md §6.

## Acceptance criteria

- [ ] Both skills contain the confidence ladder verbatim-equivalent to DESIGN.md §2 and an explicit "when in doubt, file a question" rule — reviewer should reject paraphrases that weaken it.
- [ ] Skills reference only CLI commands and okf-mcp tools that exist at this point in the plan; no fictional tooling.
- [ ] Runbook walked through against `examples/harbor` as a dry description (no live agent run required in CI).

## Out of scope

Executing a live dig in CI (that's PLAN.md Phase 3's real-world test, run by the orchestrator, not by this PR).
