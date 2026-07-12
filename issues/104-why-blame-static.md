# `why blame` — the story behind a file or line range (static anchors)
Labels: Sandcastle, phase:1

## Context

DESIGN.md §7 specifies the query; the README's example session is the rendering target. This issue is the *static* version: anchors are trusted as written (no re-resolution — Phase 2 adds that). This is the command that makes the whole tool legible, so rendering quality is in scope, not polish.

## Scope

- `why blame <path>[:line[-line]]`: find concepts whose anchors cover the target (path match; line-range overlap when lines are given; whole-file anchors match any line).
- Expand one hop along `# Because of`, `# Instead of`, `# Superseded by` edges.
- Render per DESIGN.md §7: newest-first; status glyph (● active, ⚠ expired/superseded, ? question); type, `happened_on`, confidence; one-line description; indented edge lines (`because of ▸`, `instead of ▸`, `evidence ▸` from citations).
- Hedging is mandatory rendering logic, not copy: `inferred` prefixes its rationale line with "likely —"; `speculative` with "speculation, thin evidence —".
- Expired upstream constraints render as warnings with the downstream note (see the README example's last block).
- No anchored concepts → say so and list anchored concepts in the same directory (nearest-first), never empty output. `--json` emits the resolved structure.

## Acceptance criteria

- [ ] `why blame src/lock.rs:47 --bundle examples/harbor` output contains: the queue-based-locking block with its `because of`/`instead of` lines, and the expired-Acme warning block — assert on substrings, not exact bytes.
- [ ] `why blame config/defaults.toml:31` surfaces the open question with `?` glyph and no invented rationale.
- [ ] A path with no anchors produces the nearest-concepts fallback (test it).
- [ ] Hedging: a temp-fixture concept with `confidence: inferred` renders the hedge prefix (test fails if hedging is removed).

## Out of scope

Anchor re-resolution, `as_of` drift handling (Phase 2 — assume anchors are current), MCP exposure.
