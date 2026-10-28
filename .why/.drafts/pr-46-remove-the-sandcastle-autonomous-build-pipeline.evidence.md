# Evidence pack: pr-46

- commits: 591b858
- files touched: .gitignore, .sandcastle/.env.example, .sandcastle/.gitignore, .sandcastle/CODING_STANDARDS.md, .sandcastle/config.mts, .sandcastle/Dockerfile, .sandcastle/gate-fix-prompt.md, .sandcastle/gate-review-prompt.md, .sandcastle/gatekeeper.mts, .sandcastle/main.mts, .sandcastle/README.md, .sandcastle/tsconfig.json, .why/decisions/autonomous-build-via-sandcastle.md, .why/decisions/escalation-circuit-breaker.md, .why/decisions/issues-are-the-spec-surface.md, CLAUDE.md, package-lock.json, package.json, scripts/autonomous-loop.sh, scripts/sandcastle-loop.sh
- references: PR #46

## Commits

### commit 591b858

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-10-27

[ci skip] Remove the Sandcastle autonomous build pipeline (#46)

* Remove the .sandcastle autonomous build pipeline

* Keep .sandcastle/.env ignored after removing the pipeline

Existing checkouts still carry the untracked .sandcastle/.env that the
removed runbook told operators to fill with Claude and GitHub tokens.
Dropping the ignore rule let a later 'git add -A' stage that file, so
the rule stays.

---------

Co-authored-by: Dan Essig <2682437+dantheuber@users.noreply.github.com>

## Pull requests

### PR #46 — Remove the Sandcastle autonomous build pipeline

by @dantheuber

Removes the Sandcastle autonomous build pipeline. CLAUDE.md already described it as optional, with nothing shipped depending on it.

- Deletes `.sandcastle/`, `scripts/sandcastle-loop.sh` and `scripts/autonomous-loop.sh`
- Drops the four `sandcastle*` npm scripts and the `@copperbox/sandcastle-workflow` devDependency; lockfile regenerated (removals only)
- Removes the `.sandcastle/.env` ignore and the "Repo tooling" section from CLAUDE.md

**`.why/` changes.** Three decisions were anchored to `.sandcastle/README.md`: `autonomous-build-via-sandcastle`, `escalation-circuit-breaker` and `issues-are-the-spec-surface`. Deleting that file makes the PR gate fail on destroyed anchors. Leaving the anchors as `state: lost` would fail `test/ci.test.ts`, because doctor has to report zero lost anchors on the self-hosted bundle. So each of the three decisions now:

- has `status: reversed` and a one-line note saying why
- has no anchor; the last-known location is kept as a citation pinned to `.sandcastle/README.md` at fa87a3b

Ran locally: `why lint` reports no findings, `why anchor --check --allow-drift` exits 0 with 0 lost (6 pre-existing drifts, which the why-anchor job re-stamps from main), `npm run typecheck` passes, and `npm test` passes 265/265.

Comments:

- **cb-jeeves** (2026-10-28):
  <!-- dispatch-pr-respond: {"headSha":"0fa0fa2262d93730b8e22fde7457bc44a6793e5e","reviewId":5676757098,"outcome":"pushed"} -->
  
  Responded to review round 1, pushed 26cb58a:
  
  - Addressed `.gitignore` `.sandcastle/.env` removal: restored the ignore rule. The removed runbook told operators to copy the Claude and GitHub tokens into `.sandcastle/.env`, and that untracked file survives in existing checkouts, so dropping the rule let a later `git add -A` stage it.
  
  Typecheck passes. One test, the `/api/blame` author assertion in `test/serve.test.ts`, fails identically on the reviewed head 0fa0fa2 in this environment because an exported `GIT_AUTHOR_NAME` overrides the fixture's `user.name`. It is unrelated to this change.

Reviews:

- **cb-jeeves** (2026-10-28):
  <!-- dispatch-pr-review: {"headSha":"0fa0fa2262d93730b8e22fde7457bc44a6793e5e","round":1,"verdict":"comment"} -->
  
  The PR removes the Sandcastle pipeline and marks its recorded decisions as reversed. One suggestion remains to protect credentials left in existing checkouts.
- **cb-jeeves** [approved] (2026-10-28):
  <!-- dispatch-pr-review: {"headSha":"26cb58ac6a0c94d09ef113dd1e8d928eae55a806","round":2,"verdict":"approve"} -->
  
  The previous credential exposure finding is addressed by retaining `.sandcastle/.env` in the root `.gitignore`.


## Diffs

### diff of commit 591b858

````diff
diff --git a/.gitignore b/.gitignore
index 27b06ae..76d14c6 100644
--- a/.gitignore
+++ b/.gitignore
@@ -5,4 +5,4 @@ dist/
 vscode-why/out/
 vscode-why/.vscode-test/
 .sandcastle/.env
-.why/.obsidian/
\ No newline at end of file
+.why/.obsidian/
````

````diff
diff --git a/.sandcastle/.env.example b/.sandcastle/.env.example
deleted file mode 100644
index 2e375a9..0000000
--- a/.sandcastle/.env.example
+++ /dev/null
@@ -1,6 +0,0 @@
-# Claude Code OAuth token — `claude setup-token` on the host.
-CLAUDE_CODE_OAUTH_TOKEN=
-# Or an Anthropic API key instead:
-# ANTHROPIC_API_KEY=
-# GitHub token with repo scope (issues read/write, PRs, contents push).
-GH_TOKEN=
````

````diff
diff --git a/.sandcastle/.gitignore b/.sandcastle/.gitignore
deleted file mode 100644
index 4c49bd7..0000000
--- a/.sandcastle/.gitignore
+++ /dev/null
@@ -1 +0,0 @@
-.env
````

````diff
diff --git a/.sandcastle/CODING_STANDARDS.md b/.sandcastle/CODING_STANDARDS.md
deleted file mode 100644
index 1d72730..0000000
--- a/.sandcastle/CODING_STANDARDS.md
+++ /dev/null
@@ -1,40 +0,0 @@
-# Coding Standards — `why`
-
-These are loaded by the reviewer and gatekeeper agents. They are enforceable
-review criteria, not aspirations.
-
-## Project invariants (violations are always request-changes)
-
-- **Anchors are live or `lost`, never silently wrong.** Any code path that
-  resolves or rewrites anchors must either succeed verifiably or mark the
-  anchor `lost`. No best-effort guesses.
-- **Rationale never exceeds its evidence.** Code that renders or writes
-  concepts must respect the confidence ladder (DESIGN.md §2); anything below
-  `corroborated` renders hedged.
-- **Every bundle stays valid plain OKF.** `why`-specific data lives only in
-  the `why:` frontmatter map and section conventions. Nothing may write a
-  bundle that `okf-mcp validate` rejects.
-- **DESIGN.md is the contract.** If an implementation deviates from it, the PR
-  must change DESIGN.md in the same diff with the reasoning, or it is wrong.
-
-## Style
-
-- TypeScript, strict mode, ESM (`type: module`), Node ≥ 20.
-- camelCase functions/variables, PascalCase types. Named exports only.
-- Small focused modules; mirror the okf-mcp layout style (one concern per file).
-- Comments state constraints the code can't show — no narration.
-
-## Testing
-
-- `npm run verify` (typecheck + node:test via tsx) must pass; new behavior
-  needs tests that fail without the change.
-- Use `examples/harbor/` as the fixture bundle. If a test needs a git history,
-  build a throwaway repo in a temp dir inside the test — never depend on this
-  repo's own history.
-- Test names describe behavior ("blame renders expired constraints as
-  warnings"), not implementation.
-
-## Dependencies
-
-- Prefer `@copperbox/okf-mcp` for all bundle reading/writing over hand-rolled
-  parsing. New dependencies need a one-line justification in the PR body.
````

````diff
diff --git a/.sandcastle/Dockerfile b/.sandcastle/Dockerfile
deleted file mode 100644
index 1170087..0000000
--- a/.sandcastle/Dockerfile
+++ /dev/null
@@ -1,70 +0,0 @@
-FROM node:22-bookworm
-
-# Install system dependencies
-RUN apt-get update && apt-get install -y \
-  git \
-  curl \
-  jq \
-  && rm -rf /var/lib/apt/lists/*
-
-# Install GitHub CLI
-RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
-  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
-  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
-  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
-  && apt-get update && apt-get install -y gh \
-  && rm -rf /var/lib/apt/lists/*
-
-# ---------------------------------------------------------------------------
-# PROJECT TOOLING -- add anything your agents need at runtime here, while the
-# build is still running as root (apt packages, browsers, extra runtimes,
-# CLIs). Anything an agent would otherwise have to bootstrap from scratch at
-# runtime burns its context window; bake it in instead.
-#
-# Example -- headless Chromium for verifying web-UI changes end-to-end:
-#   ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
-#   ENV PLAYWRIGHT_VERSION=1.49.1
-#   RUN npx -y playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
-#     && chmod -R a+rwX /ms-playwright
-# (Then tell the implementer how to use it via `implementNotes` in config.mts.)
-# ---------------------------------------------------------------------------
-
-# Build-args for UID/GID alignment: `sandcastle docker build-image` defaults
-# these to the host user's UID/GID so image-built files and bind-mounted files
-# share an owner without runtime chown.
-ARG AGENT_UID=1000
-ARG AGENT_GID=1000
-
-# Rename the base image's "node" user to "agent" and align UID/GID.
-RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
-USER ${AGENT_UID}:${AGENT_GID}
-
-# Pin HOME so per-user installs reliably land in /home/agent/.local/bin,
-# which is added to PATH below.
-ENV HOME=/home/agent
-
-# Install Claude Code CLI
-RUN curl -fsSL https://claude.ai/install.sh | bash
-
-# Add Claude to PATH
-ENV PATH="/home/agent/.local/bin:$PATH"
-
-# rtk (https://github.com/rtk-ai/rtk): token-optimized CLI proxy for the agent.
-# Telemetry is opt-in; the init consent prompt is skipped on non-TTY stdin, and
-# this env var hard-disables collection regardless of config.
-ENV RTK_TELEMETRY_DISABLED=1
-
-# `rtk init -g --auto-patch` is the non-interactive path: it patches
-# ~/.claude/settings.json (hook that rewrites commands through rtk), writes
-# ~/.claude/RTK.md, and adds an @RTK.md reference to ~/.claude/CLAUDE.md.
-RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh \
-  && mkdir -p /home/agent/.claude \
-  && rtk init -g --auto-patch
-
-WORKDIR /home/agent
-
-# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at
-# /home/agent/workspace and overrides the working directory to it at container
-# start. Structure this Dockerfile so /home/agent/workspace can serve as the
-# project root.
-ENTRYPOINT ["sleep", "infinity"]
````

````diff
diff --git a/.sandcastle/README.md b/.sandcastle/README.md
deleted file mode 100644
index 414c87f..0000000
--- a/.sandcastle/README.md
+++ /dev/null
@@ -1,157 +0,0 @@
-# The Sandcastle pipeline
-
-An optional issue→PR pipeline: labelled GitHub issues become implemented,
-reviewed, merged PRs, with an agent gatekeeper standing in for the human merge
-gate. It built the initial `why` codebase (phases 1–4, issues #1–#22) and is
-kept here for bulk work that suits it — a batch of well-specified,
-independent tasks. Day-to-day development does not use it; see
-[CONTRIBUTING.md](../CONTRIBUTING.md) for the normal workflow.
-
-Nothing in the shipped product depends on this directory. It is repo tooling.
-
-| Role | Who | Where |
-|---|---|---|
-| Product/architecture | Chat sessions | README.md, DESIGN.md, HOWTO.md |
-| Issue authoring | Chat sessions | GitHub issues, labelled `Sandcastle` |
-| Planning, implementation, internal review, PR assembly | Sandcastle agents (Docker-sandboxed) | `@copperbox/sandcastle-workflow` |
-| **Final review, remediation, merge, escalation** | **Gatekeeper agent** | [gatekeeper.mts](gatekeeper.mts) |
-| Phase sequencing | Gatekeeper (promotion) | `phase:N` labels |
-
-## The loop
-
-`npm run sandcastle:auto` ([scripts/autonomous-loop.sh](../scripts/autonomous-loop.sh)) alternates two runs forever:
-
-```
-           ┌──────────────────────────────────────────────────────────┐
-           ▼                                                          │
-  [build]  npm run sandcastle                                         │
-           issues labeled "Sandcastle" → plan → implement → review    │
-           → merge onto feature branch → ready (non-draft) PR         │
-           ▼                                                          │
-  [gate]   npm run sandcastle:gate      (oldest ready PR, one per run)│
-           worktree of PR branch → run verify (hard gate)             │
-           → reviewer agent: diff vs issues' acceptance criteria,     │
-             DESIGN.md, CODING_STANDARDS invariants                   │
-           ├─ merge:            squash-merge, issues close ───────────┤
-           ├─ request-changes:  fixer agent on branch → push →        │
-           │                    fresh review round (≤3 rounds) ───────┤
-           └─ escalate:         close PR unmerged, findings posted    │
-                                to each issue → issues requeue;       │
-                                2nd escalation of an issue trips the  │
-                                CIRCUIT BREAKER: queue label removed, │
-                                needs-chat added, chat agenda posted ─┤
-           ▼                                                          │
-  [gate]   phase promotion: queue empty + no PRs                      │
-           → any needs-chat issue → exit 5: HALTED (chat with Dan,    │
-             rewrite the spec, re-arm the label, rerun)               │
-           → else add "Sandcastle" label to lowest phase:N issues ────┘
-           → nothing left anywhere → exit 4: DONE
-```
-
-Issues carrying a `phase:N` label sit as backlog until everything in earlier
-phases has merged, so dependency order across a batch is enforced by the
-ratchet rather than by hope. A batch with no `phase:N` labels just drains.
-
-## Design decisions (and their whys — this file eats its own dog food)
-
-- **The gate does its own remediation instead of using the workflow's
-  responder.** The responder deliberately ignores reviews from its own gh
-  login (`feedback.mts` filters on `me`), and the gate runs on the same
-  `GH_TOKEN` — its feedback would be invisible. A second machine account would
-  unlock the native path (and real `REQUEST_CHANGES` reviews); until then the
-  gate reviews, fixes, and re-reviews in its own worktree. *Confidence:
-  recorded (read from source, not docs).*
-- **Comment reviews, not approvals.** GitHub forbids approving your own PR,
-  and every PR here is authored by the same token identity. Approval is
-  cosmetic in a no-branch-protection repo anyway; the merge itself is the
-  approval. The gate's review reports live as `<!-- gatekeeper -->` PR
-  comments. *Confidence: recorded.*
-- **A red verify can never be argued green.** The gate runs `npm run verify`
-  itself, in its own worktree, before any agent sees the PR; a failure is a
-  request-changes verdict by construction. Agent judgment gates quality;
-  code gates correctness claims. *Confidence: recorded.*
-- **One PR per gate run.** Merging changes `main`; sibling PRs need the build
-  side's refresh/rebump machinery before they're honestly reviewable. The
-  alternating loop gives them that window. *Confidence: recorded.*
-- **Round state lives in PR comments.** Rounds are counted from gatekeeper
-  markers on the PR, so a killed process resumes with its attempt budget
-  intact — same no-local-state philosophy as the workflow package.
-  *Confidence: recorded.*
-- **Escalation feeds forward.** A closed PR posts the surviving findings to
-  each member issue; the workflow's requeue picks the issues up with those
-  comments in the next implementation prompt. Failure makes the next attempt
-  smarter instead of identical. *Confidence: recorded.*
-- **Two escalations trip a circuit breaker, and a breaker halts the loop.**
-  Escalations are counted from `<!-- gatekeeper:escalation -->` markers on the
-  issue (durable, resume-safe). At `GATE_CHAT_THRESHOLD` (default 2) the issue
-  loses its queue label — it *cannot* requeue — gains `needs-chat`, and gets a
-  chat-agenda comment: attempts, surviving findings, and the
-  spec-vs-implementation question a session must answer. The gate halts (exit
-  5) at the phase boundary rather than promoting past the hole, so sibling
-  work finishes flowing but nothing downstream builds on a gap. Rationale:
-  two failures by fresh implementers with feed-forward findings means the
-  SPEC is wrong, and the issue text is the one artifact this pipeline cannot
-  rewrite for itself — it is the human-facing contract everything else is
-  judged against. Re-arming (swap `needs-chat` back to `Sandcastle`) is the
-  deliberate "spec fixed, try again" act. *Confidence: recorded.*
-
-## Honest risks
-
-- **Self-review bias.** Reviewer, fixer, implementer are all Claude. The
-  mitigations are structural: acceptance criteria written far in advance (the
-  issues), invariants that are checkable rather than aspirational
-  (CODING_STANDARDS.md), a verify the agent can't overrule, and a
-  merge-is-expensive prompt stance. It is still one model family grading its
-  own homework — which is why the pipeline is reserved for well-specified
-  batch work and not the default path for changes to this repo.
-- **Cost.** Every issue is multiple agent runs (plan, implement, review,
-  merge, gate, possibly fix rounds). The per-phase ratchet caps the blast
-  radius of a bad stretch; `GATE_MAX_ROUNDS` caps per-PR spend.
-- **Runaway loops.** Escalation → requeue → same failure was the loop to
-  fear; the circuit breaker now bounds it mechanically at two escalations per
-  issue, converting a potential infinite token burn into a halted loop plus a
-  chat agenda. Residual risk: a *pair* of issues whose specs conflict burns
-  up to two attempts each before the halt — acceptable, and the agenda
-  comments from both make the conflict visible in one place.
-- **Host-side gate agents.** Build agents run in Docker; gate agents run on
-  the host with tool allowlists (read/git-read/npm for review; +edit/commit
-  for fix, push done by the script). Tighter than the build side's sandbox?
-  No — narrower tools, weaker walls. **This was scoped to a private repo of
-  our own generated code. The repo is now public, so issue text is
-  attacker-controllable input that reaches a host-side agent: never point the
-  loop at issues you did not write.** Contributor PRs go through the normal
-  human review in [CONTRIBUTING.md](../
[clipped: diff of .sandcastle/README.md in 591b858 — showing 8000 of 9459 chars]
````

````diff
diff --git a/.sandcastle/config.mts b/.sandcastle/config.mts
deleted file mode 100644
index f871e48..0000000
--- a/.sandcastle/config.mts
+++ /dev/null
@@ -1,32 +0,0 @@
-// Sandcastle configuration for the optional agent pipeline.
-// See README.md in this directory for how this composes with the gatekeeper.
-
-import { defineConfig } from "@copperbox/sandcastle-workflow";
-
-export default defineConfig({
-  verifyCommand: "npm run verify",
-  targetBranch: "main",
-
-  // npm-shaped repo: version-bump each feature PR.
-  release: { enabled: true },
-
-  // Explicit because the gatekeeper relies on its own comments being trusted.
-  // These were chosen when the repo was private with a single trusted owner;
-  // the repo is now public, so only ever queue issues written by a maintainer.
-  security: { trustedCommentsOnly: true, lockOnQueue: false },
-
-  // The gatekeeper does its own remediation (it cannot route feedback through
-  // the responder: responder ignores reviews from its own gh login, and the
-  // gate runs on the same token). Leaving feedback enabled is harmless — it
-  // reacts only to OTHER trusted humans, if any ever comment.
-  feedback: { enabled: true, maxAttempts: 2 },
-
-  implementNotes: [
-    "DESIGN.md at the repo root is the source of truth for the `why` schema and",
-    "architecture; the issue body carries the per-task spec. Read the DESIGN.md",
-    "sections an issue cites before writing code. examples/harbor/ is the fixture bundle —",
-    "tests should run against it rather than inventing new fixtures. Never let a",
-    "code path emit a silently-wrong anchor, and never assert rationale above its",
-    "evidence — these two rules override convenience every time.",
-  ].join(" "),
-});
````

````diff
diff --git a/.sandcastle/gate-fix-prompt.md b/.sandcastle/gate-fix-prompt.md
deleted file mode 100644
index 39172aa..0000000
--- a/.sandcastle/gate-fix-prompt.md
+++ /dev/null
@@ -1,28 +0,0 @@
-You are the gatekeeper's fixer for PR #{{PR_NUMBER}} (remediation round
-{{ROUND}}). The reviewer rejected the branch with the findings below. Your
-working directory is a checkout of the PR branch; fix the findings here.
-
-Rules:
-
-- Address EVERY finding. If a finding is genuinely wrong, leave the code as-is
-  and say why in your final reply — but the bar for disagreeing with the
-  reviewer is high, and the next round's reviewer will re-check.
-- Stay inside the findings plus the member issues' scope. This is remediation,
-  not a rewrite: smallest correct change wins.
-- `DESIGN.md` and `.sandcastle/CODING_STANDARDS.md` bind you the same way they
-  bind the reviewer.
-- Run `{{VERIFY_COMMAND}}` before finishing; it must pass.
-- You may `git add` and `git commit` (small, well-messaged commits). Do NOT
-  push, do not touch branches, do not run any other git write operation —
-  the gate pushes for you.
-
-## Findings to address
-
-{{FINDINGS}}
-
-## Member issues (for scope)
-
-{{ISSUES}}
-
-Finish with a short summary of what you changed and, if anything, what you
-declined to change and why.
````

````diff
diff --git a/.sandcastle/gate-review-prompt.md b/.sandcastle/gate-review-prompt.md
deleted file mode 100644
index 4d4f33d..0000000
--- a/.sandcastle/gate-review-prompt.md
+++ /dev/null
@@ -1,51 +0,0 @@
-You are the autonomous gatekeeper for this repository. You are the LAST line of
-review: there is no human after you. If you say merge, PR #{{PR_NUMBER}}
-("{{PR_TITLE}}") merges into `{{TARGET_BRANCH}}` immediately and its issues
-close. A wrong merge propagates into every later feature; a wrong
-request-changes only costs one remediation round. When genuinely uncertain,
-request changes.
-
-Your working directory is a checkout of the PR branch. `{{VERIFY_COMMAND}}`
-already passed here (output below) — a green verify is the floor, not the bar.
-
-## What to review
-
-1. Read the diff: `git diff origin/{{TARGET_BRANCH}}...HEAD -- . ':!package-lock.json'`
-   (use `git log origin/{{TARGET_BRANCH}}..HEAD --oneline` for shape). Read any
-   touched file in full when the diff alone is ambiguous.
-2. Judge against the member issues below. Every acceptance criterion must be
-   demonstrably met — find the code and the test that satisfies each one.
-   Unrequested scope is a finding.
-3. Judge against the repo contracts:
-   - `DESIGN.md` — the source of truth. Behavior that contradicts it is wrong
-     unless the PR also amends DESIGN.md with reasoning.
-   - `.sandcastle/CODING_STANDARDS.md` — the "Project invariants" section is
-     merge-blocking; the rest is judgment.
-4. Judge the tests, not just their existence: would they fail if the feature
-   were broken? Tests that only exercise the happy path against
-   `examples/harbor/` fixtures they were written to match are a finding.
-5. You may run `npm run test`, `npm run typecheck`, or `node` on files to
-   probe behavior directly. Prefer probing over speculating.
-
-## Member issues (acceptance criteria)
-
-{{ISSUES}}
-
-## Verify output (already run for you)
-
-```
-{{VERIFY_OUTPUT}}
-```
-
-## Verdict
-
-End your reply with ONLY a JSON object, no code fences, no trailing prose:
-
-{"verdict": "merge" | "request-changes",
- "summary": "one paragraph: what this PR does and why it passes or fails",
- "findings": ["each independently actionable problem, with file paths and what correct looks like — empty array when verdict is merge"]}
-
-Findings must be specific enough that a fixer agent with no other context can
-act on them. "Improve test coverage" is not a finding; "blame.ts:87 renders
-`inferred` rationale without hedging, violating DESIGN.md §2 — add the hedge
-prefix and a test asserting it" is.
````

````diff
diff --git a/.sandcastle/gatekeeper.mts b/.sandcastle/gatekeeper.mts
deleted file mode 100644
index fbd2f24..0000000
--- a/.sandcastle/gatekeeper.mts
+++ /dev/null
@@ -1,520 +0,0 @@
-// Autonomous gatekeeper: the stage that replaces the human PR gate.
-//
-// Each run:
-//   1. Finds ready (non-draft) sandcastle feature PRs and takes the OLDEST one
-//      — at most one PR is gated per run, so the build side can refresh the
-//      others against the new target branch between gate runs.
-//   2. In a throwaway worktree of the PR branch: runs the verify command
-//      itself (a hard gate — no agent verdict can override a red verify),
-//      then spawns a reviewer agent with the linked issues' acceptance
-//      criteria, DESIGN.md, and CODING_STANDARDS.md.
-//   3. verdict "merge"  -> posts the review report, squash-merges, deletes the
-//      branch. `Closes #…` lines in the PR body close the member issues.
-//      verdict "request-changes" -> posts findings, spawns a fixer agent on
-//      the branch, pushes, and re-reviews (a fresh round). The gate CANNOT
-//      route findings through the workflow's responder: that agent ignores
-//      feedback from its own gh login, and the gate runs on the same token.
-//   4. After MAX_ROUNDS failed rounds the PR is closed unmerged (escalation):
-//      findings are posted to each member issue so the next implementation
-//      attempt inherits them, and the workflow's normal close-unmerged
-//      behavior requeues the issues.
-//   5. CIRCUIT BREAKER: an issue's escalations are counted from marker
-//      comments on the issue itself. Reaching CHAT_THRESHOLD (default 2)
-//      trips the breaker: the queue label is removed (so the issue cannot
-//      requeue), `needs-chat` is added, and a chat-agenda comment is posted.
-//      Repeated failure means the SPEC is wrong, and rewriting an issue is a
-//      human+chat decision, not another attempt.
-//   6. When nothing is queued and no feature PRs are open: if any open issue
-//      carries `needs-chat`, HALT (exit 5) listing them — never promote past
-//      a hole. Otherwise promote the next phase: add the queue label to the
-//      lowest open `phase:N` issues. Nothing left anywhere -> exit 4.
-//
-// Round state is durable in GitHub, not local: rounds are counted from
-// `<!-- gatekeeper … -->` markers in the PR's comments, so a killed process
-// resumes where it left off (same philosophy as the workflow package).
-//
-// Exit codes (contract with scripts/autonomous-loop.sh):
-//   0 - did work (merged, remediated, escalated, or promoted a phase)
-//   1 - crash
-//   3 - idle (nothing ready to gate, nothing to promote yet)
-//   4 - all phases complete: no queue, no PRs, no backlog
-//   5 - HALTED: one or more issues need a human chat (label: needs-chat)
-//   6 - LIMIT: the Claude session/usage limit is exhausted — the loop should
-//       sleep and retry; aborting mid-gate is safe (all state is on GitHub)
-
-import { execFile } from "node:child_process";
-import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
-import { tmpdir } from "node:os";
-import path from "node:path";
-import { fileURLToPath } from "node:url";
-
-const HERE = path.dirname(fileURLToPath(import.meta.url));
-const REPO_ROOT = path.resolve(HERE, "..");
-
-const FEATURE_PREFIX = "sandcastle/feature-";
-const TARGET_BRANCH = "main";
-const QUEUE_LABEL = "Sandcastle";
-const PHASE_LABEL = /^phase:(\d+)$/;
-const VERIFY_COMMAND = "npm run verify";
-const MAX_ROUNDS = Number(process.env.GATE_MAX_ROUNDS ?? "3");
-const CHAT_THRESHOLD = Number(process.env.GATE_CHAT_THRESHOLD ?? "2");
-const GATE_MODEL = process.env.GATE_MODEL ?? "claude-fable-5";
-const GATE_EFFORT = process.env.GATE_EFFORT ?? "high";
-const MARKER = "<!-- gatekeeper";
-const ESC_MARKER = "<!-- gatekeeper:escalation -->";
-const NEEDS_CHAT_LABEL = "needs-chat";
-const IDLE_EXIT = 3;
-const COMPLETE_EXIT = 4;
-const HALT_EXIT = 5;
-const LIMIT_EXIT = 6;
-
-// Signatures the claude CLI emits when the subscription window / rate limit
-// is exhausted. Checked only on FAILED agent runs, so agent prose about rate
-// limits can't false-positive.
-const LIMIT_SIGNATURE = /usage limit|rate.?limit|limit reached|quota exceeded|overloaded/i;
-
-class UsageLimitError extends Error {}
-
-// --- plumbing ---------------------------------------------------------------
-
-interface ExecResult {
-  code: number;
-  stdout: string;
-  stderr: string;
-}
-
-function run(
-  cmd: string,
-  args: string[],
-  opts: { cwd?: string; input?: string; timeoutMs?: number } = {},
-): Promise<ExecResult> {
-  return new Promise((resolve) => {
-    const child = execFile(
-      cmd,
-      args,
-      {
-        cwd: opts.cwd ?? REPO_ROOT,
-        maxBuffer: 64 * 1024 * 1024,
-        timeout: opts.timeoutMs ?? 0,
-        env: process.env,
-      },
-      (err, stdout, stderr) => {
-        const code =
-          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number"
-            ? ((err as unknown as { code: number }).code as number)
-            : err
-              ? 1
-              : 0;
-        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
-      },
-    );
-    if (opts.input !== undefined) {
-      child.stdin?.write(opts.input);
-      child.stdin?.end();
-    }
-  });
-}
-
-async function must(cmd: string, args: string[], opts?: { cwd?: string; input?: string }): Promise<string> {
-  const res = await run(cmd, args, opts);
-  if (res.code !== 0) {
-    throw new Error(`${cmd} ${args.join(" ")} failed (${res.code}): ${res.stderr.trim() || res.stdout.trim()}`);
-  }
-  return res.stdout;
-}
-
-const gh = (args: string[], opts?: { input?: string }) => must("gh", args, { ...opts, cwd: REPO_ROOT });
-
-// Load .sandcastle/.env so the claude CLI sees the same tokens the build side
-// uses; existing process env wins.
-function loadEnv(): void {
-  const envPath = path.join(HERE, ".env");
-  if (!existsSync(envPath)) return;
-  for (const line of readFileSync(envPath, "utf8").split("\n")) {
-    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
-    if (m && m[1] && process.env[m[1]] === undefined && m[2] !== "") {
-      process.env[m[1]] = m[2];
-    }
-  }
-}
-
-function clip(text: string, max: number): string {
-  return text.length <= max ? text : `${text.slice(0, max)}\n… [clipped ${text.length - max} chars]`;
-}
-
-// --- agents -----------------------------------------------------------------
-
-interface Verdict {
-  verdict: "merge" | "request-changes";
-  summary: string;
-  findings: string[];
-}
-
-function loadPrompt(name: string, vars: Record<string, string>): string {
-  let text = readFileSync(path.join(HERE, name), "utf8");
-  for (const [key, value] of Object.entries(vars)) {
-    text = text.replaceAll(`{{${key}}}`, value);
-  }
-  return text;
-}
-
-// Runs `claude -p` and returns the agent's final text. The gate agents run on
-// the HOST (unlike the build agents' docker sandboxes) with tool allowlists
-// scoped to reading, git inspection, and npm scripts in the worktree.
-async function runAgent(opts: {
-  prompt: string;
-  cwd: string;
-  allowedTools: string;
-  permissionMode?: string;
-  label: string;
-}): Promise<string> {
-  console.log(`  · agent: ${opts.label} (${GATE_MODEL}, effort ${GATE_EFFORT})`);
-  const args = [
-    "-p",
-    opts.prompt,
-    "--model",
-    GATE_MODEL,
-    "--effort",
-    GATE_EFFORT,
-    "--output-format",
-    "json",
-    "--allowedTools",
-    opts.allowedTools,
-  ];
-  if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
-  const res = await run("claude", args, { cwd: opts.cwd, timeoutMs: 45 * 60 * 1000 });
-  const combined = `${res.stdout}\n${res.stderr}`;
-  if (res.code !== 0) {
-    if (LIMIT_SIGNATURE.test(combined)) {
-      throw new UsageLimitError(clip(combined.trim(), 500));
-    }
-    throw new Error(`${opts.label} agent failed (${res.cod
[clipped: diff of .sandcastle/gatekeeper.mts in 591b858 — showing 8000 of 22657 chars]
````

````diff
diff --git a/.sandcastle/main.mts b/.sandcastle/main.mts
deleted file mode 100644
index e077fc5..0000000
--- a/.sandcastle/main.mts
+++ /dev/null
@@ -1,14 +0,0 @@
-// Entry point for the Sandcastle feature-PR workflow (build side).
-// The autonomous gate is separate: .sandcastle/gatekeeper.mts.
-// scripts/autonomous-loop.sh alternates the two.
-//
-// Exit codes (contract with the loop scripts):
-//   0 -- a cycle ran (there may be more to do)
-//   1 -- crash
-//   3 -- idle: nothing queued or everything is blocked/in-review
-
-import { IDLE_EXIT_CODE, runFeatureFlow } from "@copperbox/sandcastle-workflow";
-import config from "./config.mts";
-
-const result = await runFeatureFlow(config);
-process.exit(result.status === "idle" ? IDLE_EXIT_CODE : 0);
````

````diff
diff --git a/.sandcastle/tsconfig.json b/.sandcastle/tsconfig.json
deleted file mode 100644
index bd63018..0000000
--- a/.sandcastle/tsconfig.json
+++ /dev/null
@@ -1,13 +0,0 @@
-{
-  "compilerOptions": {
-    "module": "nodenext",
-    "moduleResolution": "nodenext",
-    "target": "es2022",
-    "strict": true,
-    "types": ["node"],
-    "allowImportingTsExtensions": true,
-    "noEmit": true,
-    "skipLibCheck": true
-  },
-  "include": ["*.mts"]
-}
````

````diff
diff --git a/.why/decisions/autonomous-build-via-sandcastle.md b/.why/decisions/autonomous-build-via-sandcastle.md
index cbeb696..0784109 100644
--- a/.why/decisions/autonomous-build-via-sandcastle.md
+++ b/.why/decisions/autonomous-build-via-sandcastle.md
@@ -6,19 +6,17 @@ description: Phases 1–4 are implemented by an issue→PR pipeline with an agen
 tags: [ process, autobuild ]
 timestamp: 2026-07-13
 why:
-  status: active
+  status: reversed
   happened_on: 2026-07-11
   confidence: recorded
-  anchors:
-    - path: .sandcastle/README.md
-      as_of: fa87a3b
-      state: live
 ---
 
 # Autonomous build via Sandcastle + gatekeeper
 
 Implementation is delegated to the Sandcastle issue→PR pipeline; an agent gatekeeper reviews, remediates in-gate, and merges. Chat sessions do architecture — DESIGN.md, issue specs, and the gate itself — not implementation.
 
+Reversed: the Sandcastle pipeline, gatekeeper, and loop scripts were removed from the repo once the initial build was done; changes now go through ordinary PRs. Its last-known anchor was `.sandcastle/README.md` as of fa87a3b [3].
+
 # Why
 
 Recorded at project bootstrap [1]: remediation happens in the gate rather than through the workflow's responder (which ignores its own login's feedback), and phase labels plus gate promotion enforce PLAN.md's ordering mechanically. The full rationale and risk register were written down in AUTOBUILD.md at decision time [2].
@@ -27,3 +25,4 @@ Recorded at project bootstrap [1]: remediation happens in the gate rather than t
 
 [1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
 [2] [AUTOBUILD.md as of the bootstrap commit (now .sandcastle/README.md)](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/AUTOBUILD.md)
+[3] [.sandcastle/README.md as of fa87a3b, before the pipeline was removed](https://github.com/copperbox/why/blob/fa87a3b49ff4d7bf41df7178b7e02e45bcc28b0a/.sandcastle/README.md)
````

````diff
diff --git a/.why/decisions/escalation-circuit-breaker.md b/.why/decisions/escalation-circuit-breaker.md
index 6c824cc..e6f8c39 100644
--- a/.why/decisions/escalation-circuit-breaker.md
+++ b/.why/decisions/escalation-circuit-breaker.md
@@ -6,19 +6,17 @@ description: An issue's second gate escalation removes it from the queue, labels
 tags: [ process, autobuild ]
 timestamp: 2026-07-13
 why:
-  status: active
+  status: reversed
   happened_on: 2026-07-12
   confidence: recorded
-  anchors:
-    - path: .sandcastle/README.md
-      as_of: fa87a3b
-      state: live
 ---
 
 # Circuit breaker: repeated escalation halts the loop for a chat
 
 When an issue escalates out of the gate twice, it leaves the queue with a `needs-chat` label and a chat-agenda comment, and the gate exits HALTED (5) at the phase boundary rather than promoting past the hole.
 
+Reversed: the breaker lived in the gatekeeper, which was removed along with the rest of the Sandcastle pipeline. Its last-known anchor was `.sandcastle/README.md` as of fa87a3b [3].
+
 # Why
 
 Recorded at decision time [1]: rewriting a failing spec is the one act the pipeline reserves for humans+chat, and the breaker enforces that mechanically instead of advising it in prose. Details live in AUTOBUILD.md [2].
@@ -31,3 +29,4 @@ Recorded at decision time [1]: rewriting a failing spec is the one act the pipel
 
 [1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-12](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
 [2] [AUTOBUILD.md as of the bootstrap commit (now .sandcastle/README.md)](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/AUTOBUILD.md)
+[3] [.sandcastle/README.md as of fa87a3b, before the pipeline was removed](https://github.com/copperbox/why/blob/fa87a3b49ff4d7bf41df7178b7e02e45bcc28b0a/.sandcastle/README.md)
````

````diff
diff --git a/.why/decisions/issues-are-the-spec-surface.md b/.why/decisions/issues-are-the-spec-surface.md
index bb10a12..4c52f20 100644
--- a/.why/decisions/issues-are-the-spec-surface.md
+++ b/.why/decisions/issues-are-the-spec-surface.md
@@ -6,19 +6,17 @@ description: Each Phase 1–4 task is a self-contained issue with testable
 tags: [ process, autobuild ]
 timestamp: 2026-07-13
 why:
-  status: active
+  status: reversed
   happened_on: 2026-07-11
   confidence: recorded
-  anchors:
-    - path: .sandcastle/README.md
-      as_of: fa87a3b
-      state: live
 ---
 
 # Issues are the spec surface
 
 Every delegated task became a self-contained issue in `issues/` with testable acceptance criteria, and those issue bodies — not chat context — are what the pipeline's implementers and the gatekeeper judge against.
 
+Reversed: issues were the spec surface for the Sandcastle pipeline's implementers and gate, which have been removed. Its last-known anchor was `.sandcastle/README.md` as of fa87a3b [2].
+
 # Why
 
 Recorded at project bootstrap [1]: the pipeline's implementers and the gate both judge against issue text, so vague issues make autonomous review meaningless. The same entry anticipated this bundle: "When `why` can run on its own repo, these migrate into `.why/` — until then this section *is* the bundle."
@@ -30,3 +28,4 @@ Recorded at project bootstrap [1]: the pipeline's implementers and the gate both
 # Citations
 
 [1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
+[2] [.sandcastle/README.md as of fa87a3b, before the pipeline was removed](https://github.com/copperbox/why/blob/fa87a3b49ff4d7bf41df7178b7e02e45bcc28b0a/.sandcastle/README.md)
````

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 5f2b6f8..b2b06d8 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -30,9 +30,3 @@ Decision archaeology for codebases: recover the *why* behind code from git/PR/is
 
 - `../okf-mcp` — the OKF MCP server this builds on (same author, source available locally). Its README documents the full tool surface; prefer depending on it over reimplementing bundle handling.
 - Serve the example: `cd ../okf-mcp && npm run dev -- --bundle harbor=../why/examples/harbor inspect`
-
-## Repo tooling
-
-`.sandcastle/` holds an optional agent pipeline that built the initial codebase
-and is kept for well-specified batch work; it is not the default path for
-changes and nothing shipped depends on it. See `.sandcastle/README.md`.
````

````diff
diff --git a/package-lock.json b/package-lock.json
index 71b073f..5bf57a5 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -19,7 +19,6 @@
         "why": "dist/cli.js"
       },
       "devDependencies": {
-        "@copperbox/sandcastle-workflow": "^0.4.2",
         "@types/jsdom": "^28.0.3",
         "@types/node": "^22.10.0",
         "ajv": "^8.20.0",
@@ -28,31 +27,6 @@
         "typescript": "^5.7.0"
       }
     },
-    "node_modules/@ai-hero/sandcastle": {
-      "version": "0.12.0",
-      "resolved": "https://registry.npmjs.org/@ai-hero/sandcastle/-/sandcastle-0.12.0.tgz",
-      "integrity": "sha512-kdQ414rM8t1QiWeqZ3Klz4KSd0PqQG4bRVuqGpRDUomWhojSZkEAc1tbcEcThVmBEaHkCt8LmYR49vqEPNIoYQ==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "@clack/prompts": "^1.1.0"
-      },
-      "bin": {
-        "sandcastle": "dist/main.js"
-      },
-      "peerDependencies": {
-        "@daytona/sdk": "^0.164.0",
-        "@vercel/sandbox": ">=1.0.0"
-      },
-      "peerDependenciesMeta": {
-        "@daytona/sdk": {
-          "optional": true
-        },
-        "@vercel/sandbox": {
-          "optional": true
-        }
-      }
-    },
     "node_modules/@asamuzakjp/css-color": {
       "version": "5.1.11",
       "resolved": "https://registry.npmjs.org/@asamuzakjp/css-color/-/css-color-5.1.11.tgz",
@@ -117,36 +91,6 @@
         "specificity": "bin/cli.js"
       }
     },
-    "node_modules/@clack/core": {
-      "version": "1.4.3",
-      "resolved": "https://registry.npmjs.org/@clack/core/-/core-1.4.3.tgz",
-      "integrity": "sha512-/kr3UWNtdJfxZtPgDqUOmG2pvwlmcLGheex5yiZKdwbzZJxhV+HMNR9QNmyY5cGwTNV6LrR7Jtp+KjhUAP1qBQ==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "fast-wrap-ansi": "^0.2.0",
-        "sisteransi": "^1.0.5"
-      },
-      "engines": {
-        "node": ">= 20.12.0"
-      }
-    },
-    "node_modules/@clack/prompts": {
-      "version": "1.7.0",
-      "resolved": "https://registry.npmjs.org/@clack/prompts/-/prompts-1.7.0.tgz",
-      "integrity": "sha512-y7/yvZ2TPAnR9+jnc00klvNNLkJiXFFrQA/hlLCcxA9a2A4zQIOimyFQ9XfwYKiGD1fb5GY8vbKIIgO8d5Tb2A==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "@clack/core": "1.4.3",
-        "fast-string-width": "^3.0.2",
-        "fast-wrap-ansi": "^0.2.0",
-        "sisteransi": "^1.0.5"
-      },
-      "engines": {
-        "node": ">= 20.12.0"
-      }
-    },
     "node_modules/@copperbox/okf-mcp": {
       "version": "1.3.0",
       "resolved": "https://registry.npmjs.org/@copperbox/okf-mcp/-/okf-mcp-1.3.0.tgz",
@@ -173,23 +117,6 @@
         "url": "https://github.com/sponsors/colinhacks"
       }
     },
-    "node_modules/@copperbox/sandcastle-workflow": {
-      "version": "0.4.2",
-      "resolved": "https://registry.npmjs.org/@copperbox/sandcastle-workflow/-/sandcastle-workflow-0.4.2.tgz",
-      "integrity": "sha512-1w+x2xWRn2DxJ61kIta7+uQaZsq4zS5bS0ru0CMcXM4odINqrmnZEp9n4MLcPdQXwSqf+N7Lw9cdy77g5YW25w==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "@ai-hero/sandcastle": "^0.12.0",
-        "zod": "^4.4.0"
-      },
-      "bin": {
-        "sandcastle-workflow": "dist/init.mjs"
-      },
-      "engines": {
-        "node": ">=20"
-      }
-    },
     "node_modules/@csstools/color-helpers": {
       "version": "6.1.0",
       "resolved": "https://registry.npmjs.org/@csstools/color-helpers/-/color-helpers-6.1.0.tgz",
@@ -1332,23 +1259,6 @@
       "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
       "license": "MIT"
     },
-    "node_modules/fast-string-truncated-width": {
-      "version": "3.0.3",
-      "resolved": "https://registry.npmjs.org/fast-string-truncated-width/-/fast-string-truncated-width-3.0.3.tgz",
-      "integrity": "sha512-0jjjIEL6+0jag3l2XWWizO64/aZVtpiGE3t0Zgqxv0DPuxiMjvB3M24fCyhZUO4KomJQPj3LTSUnDP3GpdwC0g==",
-      "dev": true,
-      "license": "MIT"
-    },
-    "node_modules/fast-string-width": {
-      "version": "3.0.2",
-      "resolved": "https://registry.npmjs.org/fast-string-width/-/fast-string-width-3.0.2.tgz",
-      "integrity": "sha512-gX8LrtNEI5hq8DVUfRQMbr5lpaS4nMIWV+7XEbXk2b8kiQIizgnlr12B4dA3ZEx3308ze0O4Q1R+cHts8kyUJg==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "fast-string-truncated-width": "^3.0.2"
-      }
-    },
     "node_modules/fast-uri": {
       "version": "3.1.3",
       "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.3.tgz",
@@ -1365,16 +1275,6 @@
       ],
       "license": "BSD-3-Clause"
     },
-    "node_modules/fast-wrap-ansi": {
-      "version": "0.2.2",
-      "resolved": "https://registry.npmjs.org/fast-wrap-ansi/-/fast-wrap-ansi-0.2.2.tgz",
-      "integrity": "sha512-7F2Fl+TjRSenLqlU3UjSH0iyqopqoZIu7eZVpEirP2g1GtWa2G/ecEmBdgz31+Mxr+ELclgg6sokpSFIQiZ02Q==",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "fast-string-width": "^3.0.2"
-      }
-    },
     "node_modules/finalhandler": {
       "version": "2.1.1",
       "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
@@ -2108,13 +2008,6 @@
         "url": "https://github.com/sponsors/ljharb"
       }
     },
-    "node_modules/sisteransi": {
-      "version": "1.0.5",
-      "resolved": "https://registry.npmjs.org/sisteransi/-/sisteransi-1.0.5.tgz",
-      "integrity": "sha512-bLGGlR1QxBcynn2d5YmDX4MGjlZvy2MRBDRNHLJ8VI6l6+9FUiyTFNJ0IveOSP0bcXgVDPRcfGqA0pjaqUpfVg==",
-      "dev": true,
-      "license": "MIT"
-    },
     "node_modules/source-map-js": {
       "version": "1.2.1",
       "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
````

````diff
diff --git a/package.json b/package.json
index 20de07b..090231a 100644
--- a/package.json
+++ b/package.json
@@ -23,14 +23,9 @@
     "test:e2e": "tsx --test test/e2e/*.e2e.test.ts",
     "test:vscode": "tsx --test vscode-why/test/*.test.ts",
     "verify": "npm run typecheck && npm run test && npm run test:vscode",
-    "build": "tsc -p tsconfig.build.json && node -e \"fs.chmodSync('dist/cli.js', 0o755)\"",
-    "sandcastle": "tsx .sandcastle/main.mts",
-    "sandcastle:loop": "scripts/sandcastle-loop.sh",
-    "sandcastle:gate": "tsx .sandcastle/gatekeeper.mts",
-    "sandcastle:auto": "scripts/autonomous-loop.sh"
+    "build": "tsc -p tsconfig.build.json && node -e \"fs.chmodSync('dist/cli.js', 0o755)\""
   },
   "devDependencies": {
-    "@copperbox/sandcastle-workflow": "^0.4.2",
     "@types/jsdom": "^28.0.3",
     "@types/node": "^22.10.0",
     "ajv": "^8.20.0",
````

````diff
diff --git a/scripts/autonomous-loop.sh b/scripts/autonomous-loop.sh
deleted file mode 100755
index ef10da4..0000000
--- a/scripts/autonomous-loop.sh
+++ /dev/null
@@ -1,84 +0,0 @@
-#!/usr/bin/env bash
-# The zero-human loop: alternate the Sandcastle build cycle (issues -> ready
-# feature PRs) with the gatekeeper (review -> remediate -> merge/escalate,
-# then phase promotion). Runs until the gatekeeper reports the backlog fully
-# shipped, or something crashes.
-#
-# Exit-code contract:
-#   sandcastle:   0 cycle ran | 3 idle | else crash
-#                 (limit hits are detected by grepping its output — the build
-#                 side soft-fails agents internally and still exits 0/3)
-#   gate:         0 did work  | 3 idle | 4 ALL PHASES COMPLETE
-#                 | 5 HALTED: an issue needs a human chat
-#                 | 6 LIMIT: usage window exhausted — sleep and retry
-set -uo pipefail
-root="$(cd "$(dirname "$0")/.." && pwd)"
-cd "$root"
-
-IDLE=3
-COMPLETE=4
-HALT=5
-LIMIT=6
-# Poll interval while the Claude usage window is exhausted. Each retry probe
-# costs one failing agent call, so a modest interval converges within minutes
-# of the window resetting.
-LIMIT_SLEEP_SECONDS="${SANDCASTLE_LIMIT_SLEEP:-900}"
-# Requires failure context on the same line: agents legitimately *talk about*
-# rate limits (docs, code) — only a failed-agent line may trigger the nap.
-LIMIT_SIGNATURE='(failed|error|⚠).*(usage limit|rate.?limit|limit reached|quota exceeded|overloaded)'
-build_log="$(mktemp -t sandcastle-build-XXXXXX.log)"
-trap 'rm -f "$build_log"' EXIT
-
-limit_nap() {
-  echo "=== Claude usage limit hit ($1); sleeping ${LIMIT_SLEEP_SECONDS}s before retrying ==="
-  echo "=== (all state is on GitHub — Ctrl-C now and rerunning later is equally safe) ==="
-  sleep "$LIMIT_SLEEP_SECONDS"
-}
-IDLE_SLEEP_SECONDS="${SANDCASTLE_IDLE_SLEEP:-30}"
-
-run=0
-while true; do
-  run=$((run + 1))
-  echo "=== autonomous run #$run: build cycle ==="
-  npm run sandcastle 2>&1 | tee "$build_log"
-  build="${PIPESTATUS[0]}"
-  if [ "$build" -ne 0 ] && [ "$build" -ne "$IDLE" ]; then
-    echo "=== build cycle crashed (exit $build); stopping ==="
-    exit "$build"
-  fi
-  # The build side catches agent failures internally ("will retry next cycle")
-  # and exits 0 — detect limit-struck agents from its output so the loop waits
-  # for the window instead of busy-spinning through no-op cycles.
-  if grep -qiE "$LIMIT_SIGNATURE" "$build_log"; then
-    limit_nap "build cycle"
-    continue
-  fi
-
-  echo "=== autonomous run #$run: gatekeeper ==="
-  npm run sandcastle:gate
-  gate=$?
-  if [ "$gate" -eq "$COMPLETE" ]; then
-    echo "=== all phases complete: backlog empty, no open feature PRs. Done. ==="
-    exit 0
-  fi
-  if [ "$gate" -eq "$HALT" ]; then
-    echo "=== HALTED: the gatekeeper tripped a circuit breaker. ==="
-    echo "=== A spec needs rewriting in a chat session — the needs-chat issue(s) and"
-    echo "=== their agenda comments are listed above. Re-arm the issue, then rerun. ==="
-    command -v notify-send >/dev/null && notify-send "why autonomous build HALTED" "An issue needs a chat — see its needs-chat agenda on GitHub." || true
-    exit "$HALT"
-  fi
-  if [ "$gate" -eq "$LIMIT" ]; then
-    limit_nap "gatekeeper"
-    continue
-  fi
-  if [ "$gate" -ne 0 ] && [ "$gate" -ne "$IDLE" ]; then
-    echo "=== gatekeeper crashed (exit $gate); stopping ==="
-    exit "$gate"
-  fi
-
-  if [ "$build" -eq "$IDLE" ] && [ "$gate" -eq "$IDLE" ]; then
-    echo "=== both sides idle; sleeping ${IDLE_SLEEP_SECONDS}s ==="
-    sleep "$IDLE_SLEEP_SECONDS"
-  fi
-done
````

````diff
diff --git a/scripts/sandcastle-loop.sh b/scripts/sandcastle-loop.sh
deleted file mode 100755
index 4d3eee2..0000000
--- a/scripts/sandcastle-loop.sh
+++ /dev/null
@@ -1,32 +0,0 @@
-#!/usr/bin/env bash
-# Continuously runs `npm run sandcastle`, monitoring for queued work:
-#   - exit 0   (a full cycle ran)        -> run again immediately
-#   - exit 3   (idle, no work to do)     -> sleep, then re-check for new issues
-#   - any other non-zero (a real error)  -> stop and propagate the code
-# The loop only stops on a real failure or Ctrl-C; being idle is NOT a stop, so it
-# keeps watching for newly-tagged issues.
-set -uo pipefail
-root="$(cd "$(dirname "$0")/.." && pwd)"
-cd "$root"
-
-# Must match IDLE_EXIT_CODE exported by @copperbox/sandcastle-workflow.
-IDLE_EXIT_CODE=3
-# Seconds to wait before re-checking when there is no work (override with env).
-IDLE_SLEEP_SECONDS="${SANDCASTLE_IDLE_SLEEP:-15}"
-
-run=0
-while true; do
-  run=$((run + 1))
-  echo "=== sandcastle run #$run ==="
-  npm run sandcastle
-  code=$?
-  if [ "$code" -eq "$IDLE_EXIT_CODE" ]; then
-    echo "=== no sandcastle work; sleeping ${IDLE_SLEEP_SECONDS}s before re-checking ==="
-    sleep "$IDLE_SLEEP_SECONDS"
-    continue
-  fi
-  if [ "$code" -ne 0 ]; then
-    echo "=== sandcastle exited with code $code; stopping after $run run(s) ==="
-    exit "$code"
-  fi
-done
````
