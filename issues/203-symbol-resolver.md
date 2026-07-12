# Symbol resolver: find a named symbol at HEAD
Labels: phase:2

## Context

DESIGN.md §4 resolution order, step 1: symbol lookup is preferred over line tracing when an anchor carries `symbol`. Cross-file moves are only followed when git history connects the files.

## Scope

- `findSymbol(repo, path, symbol) → { path, lines } | null` using tree-sitter grammars for ts/js, rust, python, go (`web-tree-sitter` or the per-language npm grammars; pick and justify in the PR body); regex-heuristic fallback for other extensions (function/def/fn/class declaration patterns), clearly marked lower-confidence in the return type.
- Same-file hit: return its current span. Not in file: search files git connects to the original (`git log --follow --name-only` between the anchor's `as_of` and HEAD); a hit in an unconnected file is NOT followed (return null — the invariant beats recall).
- Multiple matches in one file (overloads/re-declarations): return null with a `reason: ambiguous` — never guess.

## Acceptance criteria

- [ ] Temp-repo tests per language for: symbol present, symbol renamed away (null), file `git mv`ed with symbol intact (followed), same-named symbol in an unrelated file (not followed), duplicate symbol (ambiguous → null).
- [ ] Fallback heuristic tested on a `.toml`-adjacent case: returns lower-confidence marker or null, never a fabricated range.
- [ ] No network at test time: grammar assets vendored or installed via package.json, not fetched in code.

## Out of scope

Anchor writing, resolution-order orchestration (next issue).
