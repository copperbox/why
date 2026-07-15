# Contributing to `why`

Thanks for taking an interest. `why` is decision archaeology for codebases —
see [README.md](README.md) for what it does and [DESIGN.md](DESIGN.md) for the
schema and architecture, which is the source of truth for both.

## Setup

Node ≥ 20.

```bash
git clone https://github.com/copperbox/why && cd why
npm install
npm run verify          # typecheck + tests + vscode extension tests
npm run why -- doctor   # run the CLI from source against this repo's own bundle
```

`npm run why -- <args>` runs the CLI from TypeScript source via `tsx`; use it
instead of a global install while developing.

## Workflow

1. Open an issue before large changes so the design gets discussed first — a PR
   that contradicts DESIGN.md is a design conversation, not a patch.
2. Branch from `main`.
3. Make the change, with tests that fail without it.
4. `npm run verify` must pass.
5. Open a PR describing what changed and why.

The PR gate runs `why lint` and `why anchor --check --allow-drift` against this
repo's own `.why/` bundle, plus the test suite.

**Don't run `why anchor` on your branch.** If your change moves code that
concepts anchor to, the gate reports the drift and lets it through: the
`why-anchor` job re-stamps it from `main` after the merge. Anchoring from a
branch would write an `as_of` pointing at a commit the squash merge discards
(DESIGN.md §4), which is the one thing that cannot be done correctly from here.

The gate does fail if your change **destroys** an anchor — deletes code a
concept claims. No re-anchoring recovers that; update the concept, or file a
`question` if the rationale no longer has a home.

## The invariants

These are the promises the tool makes to its users. A change that breaks one
gets rejected regardless of how convenient it is:

- **Anchors are live or `lost`, never silently wrong.** Any code path that
  resolves or rewrites anchors must either succeed verifiably or mark the
  anchor `lost`. No best-effort guesses.
- **Rationale never exceeds its evidence.** Code that renders or writes
  concepts must respect the confidence ladder (DESIGN.md §2); anything below
  `corroborated` renders hedged. Unrecoverable rationale becomes a `question`
  concept, never a plausible guess.
- **Every bundle stays valid plain OKF.** `why`-specific data lives only in the
  `why:` frontmatter map and section conventions. Nothing may write a bundle
  that `okf-mcp validate` rejects.
- **DESIGN.md is the contract.** If an implementation deviates from it, the PR
  changes DESIGN.md in the same diff with the reasoning, or it is wrong.

## Style

- TypeScript, strict mode, ESM (`type: module`).
- camelCase functions/variables, PascalCase types. Named exports only.
- Small focused modules, one concern per file.
- Comments state constraints the code can't show — no narration.

## Testing

- New behavior needs tests that fail without the change.
- Use `examples/harbor/` as the fixture bundle. It is both the demo and the
  test fixture, so a schema change updates it in the same PR.
- If a test needs a git history, build a throwaway repo in a temp dir inside
  the test — never depend on this repo's own history.
- Test names describe behavior ("blame renders expired constraints as
  warnings"), not implementation.

## Dependencies

Prefer `@copperbox/okf-mcp` for all bundle reading and writing over hand-rolled
parsing. New dependencies need a one-line justification in the PR body.

## Decisions get recorded

This repo runs `why` on itself. When you make a durable design choice, record it
as a concept in [`.why/`](.why/index.md) — that bundle, not a wiki, is the
project's memory. Merged PRs get drafted into `.why/.drafts/` automatically by
`why capture`; promoting a draft into a real concept is a normal part of
finishing work.
