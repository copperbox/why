# Incremental digs: high-water mark state
Labels: phase:3

## Context

DESIGN.md §6: routine digs process only new history. State must be explicit, inspectable, and safe to delete.

## Scope

- `.why/.dig-state.json`: last processed commit per branch, schema-versioned. `--episodes` default range starts there; `--from`/`--full` override.
- State is written only after a successful episode emission, atomically (write-temp-rename).
- Deleting the state file is documented (in `docs/digging.md`) as "re-dig everything, synthesis dedupes" — and must actually be safe: episode extraction is deterministic, and the dig skill's update-don't-duplicate rule handles re-encounters.
- `why doctor` gains one line: dig-state freshness (commits since last dig).

## Acceptance criteria

- [ ] Temp-repo tests: first run full-history, second run empty (no new commits), third run after 2 new commits yields exactly the new-episode delta; killed-mid-run simulation (state file untouched by a failed emission).
- [ ] Doctor freshness line tested.

## Out of scope

Multi-branch strategies beyond the current branch; remote state.
