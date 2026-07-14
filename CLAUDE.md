# why — agent orientation

Decision archaeology for codebases: recover the *why* behind code from git/PR/issue history into an OKF markdown bundle, keep it anchored to the living code, and audit whether its constraints are still true.

## Session start

1. `why` is built and shipping — all ten subcommands, both viewers, and the three
   CI recipes are live. Work now arrives as GitHub issues and as open `question`
   concepts in [.why/](.why/index.md).
2. **The project's decision memory *is* the `.why/` bundle.** Consult it before
   changing load-bearing code — `why blame <path>` on this repo answers "why is
   this like this" faster than reading the diff history — and record durable
   choices back into it.
3. `DESIGN.md` is the source of truth for the schema and architecture. If reality
   disagrees with it, fix DESIGN.md in the same session and record the change as
   a `decision` concept in `.why/`.
4. `CONTRIBUTING.md` is the development workflow (branch, `npm run verify`, PR).
   `HOWTO.md` is the operator's guide for running `why` on any repo.

## Ground rules

- **Never assert rationale above its evidence.** The confidence ladder (DESIGN.md §2) is the project's core promise. When writing example concepts, dig prompts, or rendering code: unsupported rationale becomes a `question`, not a guess.
- **Anchors are live or lost, never silently wrong.** No code path may quietly emit a stale anchor.
- Every `why` bundle must stay a valid plain-OKF bundle — all extensions live in the `why:` frontmatter map and section conventions. If a feature needs to break that, it's a design discussion, not a patch.
- `examples/harbor/` is both the demo and the test fixture — schema changes must update it in the same session.
- Run `npm run verify` before proposing a change as done. The PR gate runs `why lint` + `why anchor --check` on this repo's own bundle, so a change that moves anchored code needs `why anchor` run too.

## Neighbors

- `../okf-mcp` — the OKF MCP server this builds on (same author, source available locally). Its README documents the full tool surface; prefer depending on it over reimplementing bundle handling.
- Serve the example: `cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect`

## Repo tooling

`.sandcastle/` holds an optional agent pipeline that built the initial codebase
and is kept for well-specified batch work; it is not the default path for
changes and nothing shipped depends on it. See `.sandcastle/README.md`.
