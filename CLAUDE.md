# why — agent orientation

Decision archaeology for codebases: recover the *why* behind code from git/PR/issue history into an OKF markdown bundle, keep it anchored to the living code, and audit whether its constraints are still true.

## How this project gets built

Implementation is **autonomous**: issues in `issues/` are filed to GitHub and
built by the Sandcastle pipeline, with an agent gatekeeper reviewing, fixing,
and merging PRs — see `AUTOBUILD.md`. Chat sessions here do architecture, not
implementation: refine DESIGN.md, author/adjust issues, improve the gate and
its prompts, and un-stick escalation loops (an issue that escalated twice
needs its spec rewritten, not another attempt). Don't hand-implement a feature
an open issue covers — fix the issue text instead. Before the GitHub repo
exists, `scripts/bootstrap-github.sh` is the launch switch; it commits, so it
runs only when Dan says go.

## Session start

0. **Check for tripped breakers first** (once the GitHub repo exists):
   `gh issue list --label needs-chat --state open`. A hit means the autonomous
   loop is halted waiting for exactly this conversation — read the issue's
   gatekeeper agenda comment, decide with Dan whether each surviving finding
   is an implementation defect (tighten acceptance criteria) or a spec defect
   (rewrite scope), edit the issue, then re-arm:
   `gh issue edit <n> --remove-label needs-chat --add-label Sandcastle`.
1. The build is complete — all phases shipped. Remaining or newly-scoped work lives as issues in `issues/` (filed to GitHub, built by Sandcastle) and as open `question` concepts in [.why/](.why/index.md). The project's decision memory *is* the `.why/` bundle, not a plan file: consult it before changing load-bearing code, and record durable choices back into it. `HOWTO.md` is the operator's guide for running `why` on any repo.
2. `DESIGN.md` is the source of truth for the schema and architecture. If reality disagrees with it, fix DESIGN.md in the same session and record the change as a `decision` concept in `.why/`.

## Ground rules

- **Never assert rationale above its evidence.** The confidence ladder (DESIGN.md §2) is the project's core promise. When writing example concepts, dig prompts, or rendering code: unsupported rationale becomes a `question`, not a guess.
- **Anchors are live or lost, never silently wrong.** No code path may quietly emit a stale anchor.
- Every `why` bundle must stay a valid plain-OKF bundle — all extensions live in the `why:` frontmatter map and section conventions. If a feature needs to break that, it's a design discussion, not a patch.
- `examples/harbor/` is both the demo and the test fixture — schema changes must update it in the same session.

## Neighbors

- `../okf-mcp` — the OKF MCP server this builds on (same author, source available locally). Its README documents the full tool surface; prefer depending on it over reimplementing bundle handling.
- Serve the example: `cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect`
