# Coding Standards — `why`

These are loaded by the reviewer and gatekeeper agents. They are enforceable
review criteria, not aspirations.

## Project invariants (violations are always request-changes)

- **Anchors are live or `lost`, never silently wrong.** Any code path that
  resolves or rewrites anchors must either succeed verifiably or mark the
  anchor `lost`. No best-effort guesses.
- **Rationale never exceeds its evidence.** Code that renders or writes
  concepts must respect the confidence ladder (DESIGN.md §2); anything below
  `corroborated` renders hedged.
- **Every bundle stays valid plain OKF.** `why`-specific data lives only in
  the `why:` frontmatter map and section conventions. Nothing may write a
  bundle that `okf-mcp validate` rejects.
- **DESIGN.md is the contract.** If an implementation deviates from it, the PR
  must change DESIGN.md in the same diff with the reasoning, or it is wrong.

## Style

- TypeScript, strict mode, ESM (`type: module`), Node ≥ 20.
- camelCase functions/variables, PascalCase types. Named exports only.
- Small focused modules; mirror the okf-mcp layout style (one concern per file).
- Comments state constraints the code can't show — no narration.

## Testing

- `npm run verify` (typecheck + node:test via tsx) must pass; new behavior
  needs tests that fail without the change.
- Use `examples/harbor/` as the fixture bundle. If a test needs a git history,
  build a throwaway repo in a temp dir inside the test — never depend on this
  repo's own history.
- Test names describe behavior ("blame renders expired constraints as
  warnings"), not implementation.

## Dependencies

- Prefer `@copperbox/okf-mcp` for all bundle reading/writing over hand-rolled
  parsing. New dependencies need a one-line justification in the PR body.
