# AUTOBUILD — the zero-human pipeline

How `why` gets built from concept to working software with no human gate. The
division of labor:

| Role | Who | Where |
|---|---|---|
| Product/architecture | Claude (chat sessions with Dan) | README.md, DESIGN.md, PLAN.md |
| Issue authoring | Claude | [issues/](issues/) — filed by the bootstrap script |
| Planning, implementation, internal review, PR assembly | Sandcastle agents (Docker-sandboxed) | `@copperbox/sandcastle-workflow` |
| **Final review, remediation, merge, escalation** | **Gatekeeper agent** | [.sandcastle/gatekeeper.mts](.sandcastle/gatekeeper.mts) |
| Phase sequencing | Gatekeeper (promotion) | `phase:N` labels |

## The loop

`npm run sandcastle:auto` ([scripts/autonomous-loop.sh](scripts/autonomous-loop.sh)) alternates two runs forever:

```
           ┌──────────────────────────────────────────────────────────┐
           ▼                                                          │
  [build]  npm run sandcastle                                         │
           issues labeled "Sandcastle" → plan → implement → review    │
           → merge onto feature branch → ready (non-draft) PR         │
           ▼                                                          │
  [gate]   npm run sandcastle:gate      (oldest ready PR, one per run)│
           worktree of PR branch → run verify (hard gate)             │
           → reviewer agent: diff vs issues' acceptance criteria,     │
             DESIGN.md, CODING_STANDARDS invariants                   │
           ├─ merge:            squash-merge, issues close ───────────┤
           ├─ request-changes:  fixer agent on branch → push →        │
           │                    fresh review round (≤3 rounds) ───────┤
           └─ escalate:         close PR unmerged, findings posted    │
                                to each issue → issues requeue;       │
                                2nd escalation of an issue trips the  │
                                CIRCUIT BREAKER: queue label removed, │
                                needs-chat added, chat agenda posted ─┤
           ▼                                                          │
  [gate]   phase promotion: queue empty + no PRs                      │
           → any needs-chat issue → exit 5: HALTED (chat with Dan,    │
             rewrite the spec, re-arm the label, rerun)               │
           → else add "Sandcastle" label to lowest phase:N issues ────┘
           → nothing left anywhere → exit 4: DONE
```

Phase 1 issues are filed pre-queued; phases 2–4 sit as labeled backlog until
everything before them has merged, so the dependency order in PLAN.md is
enforced by the ratchet, not by hope.

## Design decisions (and their whys — this file eats its own dog food)

- **The gate does its own remediation instead of using the workflow's
  responder.** The responder deliberately ignores reviews from its own gh
  login (`feedback.mts` filters on `me`), and the gate runs on the same
  `GH_TOKEN` — its feedback would be invisible. A second machine account would
  unlock the native path (and real `REQUEST_CHANGES` reviews); until then the
  gate reviews, fixes, and re-reviews in its own worktree. *Confidence:
  recorded (read from source, not docs).*
- **Comment reviews, not approvals.** GitHub forbids approving your own PR,
  and every PR here is authored by the same token identity. Approval is
  cosmetic in a no-branch-protection repo anyway; the merge itself is the
  approval. The gate's review reports live as `<!-- gatekeeper -->` PR
  comments. *Confidence: recorded.*
- **A red verify can never be argued green.** The gate runs `npm run verify`
  itself, in its own worktree, before any agent sees the PR; a failure is a
  request-changes verdict by construction. Agent judgment gates quality;
  code gates correctness claims. *Confidence: recorded.*
- **One PR per gate run.** Merging changes `main`; sibling PRs need the build
  side's refresh/rebump machinery before they're honestly reviewable. The
  alternating loop gives them that window. *Confidence: recorded.*
- **Round state lives in PR comments.** Rounds are counted from gatekeeper
  markers on the PR, so a killed process resumes with its attempt budget
  intact — same no-local-state philosophy as the workflow package.
  *Confidence: recorded.*
- **Escalation feeds forward.** A closed PR posts the surviving findings to
  each member issue; the workflow's requeue picks the issues up with those
  comments in the next implementation prompt. Failure makes the next attempt
  smarter instead of identical. *Confidence: recorded.*
- **Two escalations trip a circuit breaker, and a breaker halts the loop.**
  Escalations are counted from `<!-- gatekeeper:escalation -->` markers on the
  issue (durable, resume-safe). At `GATE_CHAT_THRESHOLD` (default 2) the issue
  loses its queue label — it *cannot* requeue — gains `needs-chat`, and gets a
  chat-agenda comment: attempts, surviving findings, and the
  spec-vs-implementation question a session must answer. The gate halts (exit
  5) at the phase boundary rather than promoting past the hole, so sibling
  work finishes flowing but nothing downstream builds on a gap. Rationale:
  two failures by fresh implementers with feed-forward findings means the
  SPEC is wrong, and the issue text is the one artifact this pipeline cannot
  rewrite for itself — it is the human-facing contract everything else is
  judged against. Re-arming (swap `needs-chat` back to `Sandcastle`) is the
  deliberate "spec fixed, try again" act. *Confidence: recorded.*

## Honest risks

- **Self-review bias.** Reviewer, fixer, implementer are all Claude. The
  mitigations are structural: acceptance criteria written far in advance (the
  issues), invariants that are checkable rather than aspirational
  (CODING_STANDARDS.md), a verify the agent can't overrule, and a
  merge-is-expensive prompt stance. It is still one model family grading its
  own homework; the Phase 2 torture test and Phase 3 hand-grading exist
  precisely to audit the gate's judgment after the fact.
- **Cost.** Every issue is multiple agent runs (plan, implement, review,
  merge, gate, possibly fix rounds). The per-phase ratchet caps the blast
  radius of a bad stretch; `GATE_MAX_ROUNDS` caps per-PR spend.
- **Runaway loops.** Escalation → requeue → same failure was the loop to
  fear; the circuit breaker now bounds it mechanically at two escalations per
  issue, converting a potential infinite token burn into a halted loop plus a
  chat agenda. Residual risk: a *pair* of issues whose specs conflict burns
  up to two attempts each before the halt — acceptable, and the agenda
  comments from both make the conflict visible in one place.
- **Host-side gate agents.** Build agents run in Docker; gate agents run on
  the host with tool allowlists (read/git-read/npm for review; +edit/commit
  for fix, push done by the script). Tighter than the build side's sandbox?
  No — narrower tools, weaker walls. Acceptable for a private repo of our own
  generated code; revisit before pointing this at anything public.

## Runbook

```bash
# once
cp .sandcastle/.env.example .sandcastle/.env   # fill in both tokens
scripts/bootstrap-github.sh                    # repo + labels + issue backlog + image

# the whole build
npm run sandcastle:auto

# pieces, when wanted
npm run sandcastle        # one build cycle
npm run sandcastle:gate   # one gate pass
                          # (env: GATE_MODEL, GATE_MAX_ROUNDS, GATE_CHAT_THRESHOLD)
```

Everything durable is on GitHub; Ctrl-C is always safe.

**Usage limits are survived, not fatal.** The build side already soft-fails
limit-struck agents ("will retry next cycle"); the loop greps its output for
failed-agent limit signatures and naps `SANDCASTLE_LIMIT_SLEEP` (default 900s)
instead of busy-spinning. The gate detects the same signatures on failed
`claude` runs and exits `LIMIT` (6), which the loop also answers with a nap.
Aborting mid-gate is safe — round budgets live in PR comments — so the
pipeline self-resumes within one nap interval of the window resetting, with
no human involvement.

When the loop exits with `HALTED`, the last log block lists the `needs-chat`
issue(s). Open a chat session; its CLAUDE.md step 0 picks the agenda up from
there. After the spec is rewritten and the label swapped back to `Sandcastle`,
rerun `npm run sandcastle:auto`.
