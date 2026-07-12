# `why anchor` — full re-resolution with frontmatter-only writes
Labels: phase:2

## Context

DESIGN.md §4: compose symbol-first then blame-trace into the real command. Writes go through okf-mcp's `update_concept`-equivalent library path so ONLY `why.anchors` entries change — narrative bodies are untouchable by machinery.

## Scope

- `why anchor`: for every anchor in the bundle, run the §4 resolution order; update `lines`/`path`/`as_of` (to HEAD) on success; set `state: lost` (keeping last-known values) on failure. Print a summary table: resolved / moved / lost / already-current.
- `--check`: CI mode — resolve everything, write nothing, exit 1 if any anchor would change or be lost (so a PR that moves anchored code without running `why anchor` fails its gate).
- `--concept <id>` scopes to one concept.
- A `lost` anchor whose symbol/range reappears later resolves back to `live` (test this — recovery must not require hand-editing).

## Acceptance criteria

- [ ] End-to-end temp-repo test: seed a mini bundle + code, commit, refactor (rename file, shift lines, delete one function), run `why anchor` — assert one moved, one shifted, one lost, and the frontmatter diff touches only `why.anchors` (byte-compare the rest of each file).
- [ ] `--check` exits nonzero on the same scenario without writing.
- [ ] Idempotence: second run reports all current, writes nothing.

## Out of scope

`why doctor` reporting (next issue), torture-scale evaluation (after that).
