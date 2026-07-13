# Evidence pack: pr-26

- commits: a735c62
- files touched: .github/workflows/why-audit.yml, .github/workflows/why-capture.yml, .github/workflows/why-pr-gate.yml, .why/decisions/autonomous-build-via-sandcastle.md, .why/decisions/blame-warns-on-every-expired-constraint.md, .why/decisions/consumption-before-archaeology.md, .why/decisions/doctor-expired-constraints-section.md, .why/decisions/edge-types-by-section-convention.md, .why/decisions/escalation-circuit-breaker.md, .why/decisions/issues-are-the-spec-surface.md, .why/decisions/namespaced-why-frontmatter.md, .why/decisions/okf-as-substrate.md, .why/index.md, .why/log.md, DESIGN.md, docs/capture.md, docs/ci.md, package-lock.json, package.json, PLAN.md, README.md, skills/capture/SKILL.md, src/audit.ts, src/capture.ts, src/cli.ts, src/evidence.ts, test/audit.test.ts, test/capture.test.ts, test/ci.test.ts, test/cli.test.ts, test/skills.test.ts
- references: PR #26

## Commits

### commit a735c62

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-12

Steady-state operational loop: audit, capture, and CI self-hosting (#26)

* RALPH: why audit — constraint re-verification and the scar-tissue report (issue #15 / issues/401, DESIGN.md §5)

The payoff feature: sweep every active constraint, falsify what can be
falsified, and propagate expiry downstream as a report plus question
concepts — never a code change (out of scope per the issue).

Key decisions:
- Sweep semantics: verify.method check runs via the shell confined to the
  repo dir (cwd = dirname(bundle root)) with a timeout (30s default,
  injectable) and captured stdout+stderr, clipped at 4k chars with an
  explicit [clipped: …] marker. method: ask is exported to an agent
  questionnaire (--questions-out, markdown) and applied back with
  --answers — the CLI never calls an LLM. Overdue review_by flagged
  (unparseable dates count as due, matching doctor). An active constraint
  with no usable verify block lands in an `unverifiable` report item,
  never a silent skip.
- Evidence discipline: only a non-zero exit code or an explicit
  no-longer-true answer flips a constraint. A check that cannot produce
  an exit code (timeout, spawn failure) is outcome "error" — a problem to
  report, but not evidence of falsity, so nothing flips. A no-longer-true
  answer without evidence text is an AuditError: the flip writes that
  evidence into # Still true?, so it cannot be empty.
- Flip write path: okf-mcp updateConcept — frontmatter patch
  (status: expired + expired_on) and # Still true? section patch appending
  the evidence (command + output indented; answer text blockquoted) in one
  call; everything outside the touched spans survives byte-for-byte. A
  constraint missing its required section (lint W202) still flips and
  gains the section by plain append. Flipped bundles lint clean (W402
  satisfied), pinned in a test.
- Blast radius: reverse-# Because of BFS, transitive (decision←decision
  chains reached), collecting active decisions only, sorted. Each pair
  gets a generated question (writeConcept, links to both concepts in the
  intro — not an edge section, so no W3xx exposure) unless an open
  question already links the pair (dedupe by link pair; report says which
  question covers it).
- Already-expired constraints are report-only: their active downstream
  decisions render as "candidate scar tissue" lines, no re-flip, no new
  questions — harbor's Acme constraint is never double-flagged while the
  47s decision's candidacy stays visible (acceptance test asserts the
  mention and that harbor stays byte-clean under git).
- Exit 1 only when something newly expired (the CI "archive learned
  something" signal); questionnaire round-trips through parseAnswers
  (strict: unknown answer values, duplicate ids, stale/typo'd concept ids
  all error loudly).

Files: src/audit.ts (new), src/cli.ts (runAudit + --json/--questions-out/
--answers, notImplemented stub removed — all seven subcommands now real),
test/audit.test.ts (new, 12 tests: pass/fail/dedupe/review-by/ask-export/
answers/validation/round-trip/timeout/unverifiable/harbor/usage),
test/cli.test.ts (discovery test retargeted to implemented audit),
README.md Status. npm run verify: 187/187.

Notes for next iteration: issues/403 (CI recipes) can cite
`why audit --questions-out` + `--answers` for the weekly job; an audit
skill (agent answering the questionnaire) would slot beside skills/dig.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* Refine audit rendering and imports

- Reuse plural() from dig.ts instead of a duplicate count() helper in audit.ts
- Unfold the nested ternary in renderAuditReport's check-line suffix into an
  explicit if/else chain
- Restore alphabetical import order in cli.ts (anchors before audit)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* RALPH: why capture — merge-time capture into lint-gated drafts (issue #16 / issues/402, DESIGN.md open problem #5)

The steady-state pipeline: record decisions at merge time, confidence
recorded, while the PR discussion still holds the why. Deterministic
assembly in the CLI; judgment ships as the capture skill.

Key decisions:
- Drafts dir is .why/.drafts/ (dot-dir), not the issue's suggested
  .why/drafts/: verified against okf-mcp's walkMarkdownFiles that the
  bundle walk serves every non-dot .md and skips dot-dirs only, so a
  plain drafts/ would leak machine output into blame and the served
  bundle. Documented in docs/capture.md; the anchor-index content hash
  skips dot-dirs too, so drafts never touch caches. Drafts carry no
  self-ignoring .gitignore — they are the promotion queue, meant to be
  committed, unlike derived .cache/ state.
- --pr <n> classifies by outcome via gh (MERGED → decision/active,
  CLOSED → attempt/abandoned, OPEN refused), reuses the dig evidence
  module (buildEvidencePack + the CommandRunner seam) for an
  .evidence.md sidecar, and quotes rationale candidates verbatim with
  attribution: the PR description always, plus comment/review paragraphs
  matching RATIONALE_TELL_RE (dig's tell vocab widened with decision
  language). confidence: recorded is pre-filled only when candidates
  exist; zero candidates leave it unset with a said-out-loud note —
  never rationale above its evidence.
- Anchors come from the merge commit's zero-context (-U0) diff: one
  anchor per hunk's new-side span (exact changed lines, roundtripped
  through parseLineRange so an unwritable span is an error), pure
  deletions anchor the line the cut sits after, >4 hunks collapse to a
  whole-file anchor with a note, deleted files anchor nothing, and a
  close-unmerged PR gets no anchors at all — its diff never landed, so
  anchoring mainline code to it would be silently wrong.
- --commit <sha> is the gh-free fallback (message body as the sole
  candidate; commit citation only when an origin URL is derivable —
  no fabricated links). Re-capturing an existing draft is refused.
- Promotion is editorial and atomic-ish: writeConcept into the type dir
  named by the draft's frontmatter (stamps timestamp, normalizes
  citations), reload + lint, any error-severity finding on the new file
  rolls the write back and keeps the draft; findings elsewhere never
  block. Draft + sidecar removed on success.
- skills.test.ts now pins the capture skill to the same mechanical
  contract as the dig skills (verbatim ladder, when-in-doubt rule,
  no fictional tooling); IMPLEMENTED_SUBCOMMANDS grew audit + capture.

Files: src/capture.ts (new), src/cli.ts (capture command, three modes),
src/evidence.ts (asComments/GhComment exported for reuse),
skills/capture/SKILL.md (new), docs/capture.md (new: post-merge CI
recipe), test/capture.test.ts (new, 13 tests: fixture-gh merged/closed
drafts, PATH-shim gh CLI e2e, --commit, served-bundle guarantee via
loadBundle/blame/lint, promote roundtrip + refusal + guardrails),
test/skills.test.ts, README.md Status, DESIGN.md §8 CLI list.
npm run verify: 200/200.

Notes for next iteration: issues/403 (CI recipes) can fold docs/capture.md's
workflow into the consolidated doc; running the capture skill itself stays
out of scope per the issue.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* Simplify capture assembly helpers

- Reuse bundle.ts's exported isPlainMap instead of a duplicate private
  isRecord in capture.ts.
- Replace the nested ternary building the episode's commits list with an
  if/else chain.
- Normalize captureCommit's date/subject handling once (asString + ||
  fallback) instead of repeating undefined/empty checks at each use site.
- Pass happenedOn to whyMap directly; the conditional-spread dance was
  only needed under exactOptionalPropertyTypes, which this tsconfig
  doesn't set.
- mergeSha is never reassigned — const.

No behavior change; npm run verify passes (200 tests).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* RALPH: CI recipes + the self-hosting switch (issue #17 / issues/403, PLAN.md Phase 4 final task)

why now runs on its own repository: docs/ci.md documents the three
operational workflows, the same workflows are live under
.github/workflows/, and PLAN.md's Decision log became the repo's own
.why/ bundle.

Key decisions:
- Workflows run the CLI from source via a new `why` npm script
  (npm ci + `npm run why -- <cmd>`), since this repo IS the package and
  publishing to npm is out of scope; docs/ci.md says consumers swap in
  `npx -y @copperbox/why`. PR gate: lint + anchor --check with
  fetch-depth 0 (blame-trace needs as_of..HEAD history). Weekly audit:
  exit 1 (newly expired) opens a GitHub issue from the report AND PRs
  the .why write-back — without committing the flip the same constraint
  would re-expire and re-open an issue every week; exit >1 fails the
  job loudly instead of silently opening nothing. Post-merge capture:
  docs/capture.md's recipe folded into docs/ci.md (as the capture
  iteration notes suggested) and adapted to the self-hosted script;
  drafts PR back on the why-drafts branch, never push to main.
- The nine Decision log entries became decisions/ concepts, all
  status active + confidence recorded (each was written down at
  decision time), happened_on from the entry dates, citations to the
  actual commits/PRs (bootstrap 9f0dc16, PR #18, PR #19), and honest
  whole-file anchors (as_of = the commit that landed the behavior;
  verified each path exists at its as_of). Whole-file anchors resolve
  "already current" so the new PR gate passes; doctor shows them as
  yellow stale-as_of only — healthy, matching the harbor precedent.
  Bundle scaffolded by actually running `why init`; index.md curated
  to headings+bullets (OKF spec §6 rejects prose in the index).
- PLAN.md keeps the "## Decision log" heading (session-protocol links
  point at it) but the section is now a pointer to .why/decisions/;
  protocol steps 3/4 record new choices in the bundle.
- test/ci.test.ts is the actionlint-equivalent (actionlint isn't
  installed here): structural YAML validation via the yaml package
  (now an explicit devDependency), npm-scripts-must-exist check, and
  byte-verbatim embedding of each workflow in docs/ci.md so doc and
  live workflows cannot drift; plus lint-clean/doctor-healthy on .why/
  and the two spot-asserted slugs (okf-as-substrate,
  escalation-circuit-breaker). docs/ci.md joined skills.test.ts's
  DOC_PATHS drift guard (workflow names hyphenated — "name: why pr
  gate" reads as a fictional subcommand to that guard).

Files: .github/workflows/{why-pr-gate,why-audit,why-capture}.yml (new),
docs/ci.md (new), .why/ (new: index + 9 decision concepts),
test/ci.test.ts (new, 8 tests), docs/capture.md (recipe -> pointer),
PLAN.md (Decision log retired), README.md (Self-hosted section),
package.json (why script, yaml devDep), test/skills.test.ts.
npm run verify: 208/208.

Notes for next iteration: doctor's stale-as_of advice ("run `why
anchor`") is a no-op for current whole-file anchors whose as_of is
merely behind HEAD — cosmetic, maybe worth a quieter wording. The
weekly audit's method:ask questionnaire loop stays an agent session by
design.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* Polish docs after the audit/capture landing

The CLI exit-code comment still described unimplemented commands, a state
this branch removed; the README file table gains a row for the new
self-hosted .why/ bundle.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* chore(release): v0.6.0 (minor)

---------

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>

## Pull requests

### PR #26 — Steady-state operational loop: audit, capture, and CI self-hosting

by @dantheuber

<!-- sandcastle-feature: {"slug":"operational-loop","branch":"sandcastle/feature-operational-loop","members":[{"id":"15","title":"`why audit` — constraint re-verification and the scar-tissue report"},{"id":"16","title":"Merge-time capture: record decisions while they're fresh"},{"id":"17","title":"CI recipes and the self-hosting switch"}]} -->

**Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.

### Issues in this feature
- [x] #15 `why audit` — constraint re-verification and the scar-tissue report
- [x] #16 Merge-time capture: record decisions while they're fresh
- [x] #17 CI recipes and the self-hosting switch

### Release
`v0.6.0` (minor bump)

### Summary
## What & why

Closes out PLAN.md Phase 4: `why` gains a full re-verification/capture loop and becomes self-hosting.

- **`why audit`** — sweeps active constraints, runs their `verify.method: check` commands (or exports `method: ask` items as a questionnaire), flips falsified constraints to `expired` with evidence written in-place, and reports downstream "scar tissue" (active decisions that trace back to an expired constraint) plus dedup'd questions for blast-radius pairs.
- **`why capture`** — turns a merged/closed PR (or a bare commit) into a lint-gated draft concept: classifies outcome via `gh`, pulls rationale candidates from the PR body/comments/reviews with attribution, derives anchors from the merge commit's zero-context diff, and promotes drafts atomically (rollback on any error-severity lint finding).
- **CI recipes** — `why` now runs against its own repo: PR gate (lint + anchor --check), weekly audit (opens an issue + PRs the `.why` write-back on newly-expired constraints), and post-merge capture (drafts PR on `why-drafts`). The repo's own Decision log is retired in favor of `.why/decisions/` — nine entries migrated as real concepts.

## Changes

- `src/audit.ts`, `src/capture.ts` (new) + `cli.ts` wiring for `audit`/`capture` subcommands — all seven subcommands are now implemented, no more `notImplemented` stub.
- `.github/workflows/{why-pr-gate,why-audit,why-capture}.yml` + `docs/ci.md` documenting them; workflows run the CLI from source (`npm run why --`) since this repo *is* the package.
- `.why/` bundle (index + 9 migrated decisions) replacing PLAN.md's Decision log (PLAN.md keeps the heading as a pointer).
- `docs/capture.md` (post-merge recipe, folded into `docs/ci.md` per issue #17), `skills/capture/SKILL.md`.
- Minor cleanups: dedup'd helpers (`isPlainMap`, `plural`), de-nested ternaries, `README.md`/`DESIGN.md` updates, stale CLI exit-code comment removed.

## Review notes

- Evidence discipline is the load-bearing invariant in both features: audit only flips a constraint on a non-zero exit or an explicit "no longer true" answer (never on a timeout/error); capture only pre-fills `confidence: recorded` when it found actual rationale text, otherwise leaves it unset. Worth double-checking against `test/audit.test.ts` / `test/capture.test.ts`.
- `.why/.drafts/` (dot-dir, not the issue's suggested `drafts/`) is deliberate — verified against okf-mcp's bundle walk to avoid leaking draft output into the served bundle/anchor cache; see the capture commit message for the reasoning.
- CI docs are guarded against drift: `test/ci.test.ts` byte-embeds each live workflow into `docs/ci.md` and checks npm scripts referenced actually exist.
- Test status: `npm run verify` green throughout (208/208 as of the last functional commit); this commit only bumps `package.json`/`package-lock.json` to v0.6.0, no test re-run needed.

Closes #15
Closes #16
Closes #17

Comments:

- **dantheuber** (2026-07-13):
  <!-- gatekeeper round:1 verdict:merge -->
  ## Gatekeeper — round 1: merge
  
  This PR delivers the steady-state operational loop: `why audit` (constraint re-verification with check/ask/review-by methods, expiry flips through okf-mcp's byte-preserving patch path, transitive # Because of blast-radius walk filing deduped question concepts, exit 1 on new expiry), `why capture` (PR/commit → lint-gated drafts in the dot-dir `.why/.drafts/` that provably never serve, verbatim rationale quotes, hunk-derived anchors, editorial promotion with rollback), and the CI recipes plus self-hosting switch (three tested workflows, docs/ci.md pinned verbatim, the nine PLAN.md Decision log entries converted into honest recorded decision concepts that lint clean and read healthy to doctor). Every acceptance criterion across issues #15/#16/#17 has corresponding code and a test that would fail if the feature broke; the repo invariants hold (no rationale above evidence, all writes stay valid OKF via okf-mcp, DESIGN.md amended for the capture command); live probes confirm `why anchor --check` and `why audit` pass on the new self-hosted bundle so the activated PR gate is safe.
  
  Verified with `npm run verify` on the branch before merging.


## Diffs

### diff of commit a735c62

````diff
diff --git a/.github/workflows/why-audit.yml b/.github/workflows/why-audit.yml
new file mode 100644
index 0000000..606a105
--- /dev/null
+++ b/.github/workflows/why-audit.yml
@@ -0,0 +1,55 @@
+name: why-audit
+
+# Weekly constraint re-verification (docs/ci.md). `why audit` exits 1 when a
+# constraint newly expired — the signal that the archive learned something —
+# so the report becomes a GitHub issue and the flipped bundle a PR; any other
+# non-zero exit fails the job loudly.
+on:
+  schedule:
+    - cron: "17 6 * * 1" # Mondays 06:17 UTC
+  workflow_dispatch:
+
+jobs:
+  audit:
+    runs-on: ubuntu-latest
+    permissions:
+      contents: write
+      issues: write
+      pull-requests: write
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          fetch-depth: 0
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - name: run the audit
+        id: audit
+        run: |
+          set +e
+          npm run --silent why -- audit > audit-report.txt 2>&1
+          echo "exit=$?" >> "$GITHUB_OUTPUT"
+          cat audit-report.txt
+      - name: fail on audit errors
+        if: steps.audit.outputs.exit != '0' && steps.audit.outputs.exit != '1'
+        run: |
+          echo "why audit failed (exit ${{ steps.audit.outputs.exit }})"
+          exit 1
+      - name: open an issue from the scar-tissue report
+        if: steps.audit.outputs.exit == '1'
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: |
+          gh issue create \
+            --title "why audit: a constraint expired ($(date -u +%Y-%m-%d))" \
+            --body-file audit-report.txt
+      - name: PR the expiry write-back (status flip + question concepts)
+        if: steps.audit.outputs.exit == '1'
+        uses: peter-evans/create-pull-request@v6
+        with:
+          branch: why-audit
+          add-paths: .why
+          title: "why audit: expired constraint write-back"
+          commit-message: "why audit: constraint expired — status flip + downstream questions"
````

````diff
diff --git a/.github/workflows/why-capture.yml b/.github/workflows/why-capture.yml
new file mode 100644
index 0000000..48aac1d
--- /dev/null
+++ b/.github/workflows/why-capture.yml
@@ -0,0 +1,34 @@
+name: why-capture
+
+# Post-merge capture (docs/ci.md, docs/capture.md): when a PR closes, draft a
+# concept from its discussion into .why/.drafts/ while the rationale is fresh, and
+# PR the draft back for the editorial promotion step (skills/capture).
+on:
+  pull_request:
+    types: [closed]
+
+jobs:
+  capture:
+    runs-on: ubuntu-latest
+    permissions:
+      contents: write
+      pull-requests: write
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          ref: main
+          fetch-depth: 0 # capture reads the merge commit's diff
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - run: npm run why -- capture --pr ${{ github.event.pull_request.number }}
+        env:
+          GH_TOKEN: ${{ github.token }}
+      - uses: peter-evans/create-pull-request@v6
+        with:
+          branch: why-drafts
+          add-paths: .why
+          title: "why: capture draft for #${{ github.event.pull_request.number }}"
+          commit-message: "why capture: draft from #${{ github.event.pull_request.number }}"
````

````diff
diff --git a/.github/workflows/why-pr-gate.yml b/.github/workflows/why-pr-gate.yml
new file mode 100644
index 0000000..80d0a0d
--- /dev/null
+++ b/.github/workflows/why-pr-gate.yml
@@ -0,0 +1,22 @@
+name: why-pr-gate
+
+# PR gate (docs/ci.md): the archive may not merge in a state it cannot back.
+# `why lint` enforces the schema; `why anchor --check` fails on anchor drift
+# without writing anything — run `why anchor` locally and commit the result.
+on:
+  pull_request:
+
+jobs:
+  gate:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          fetch-depth: 0 # anchor resolution traces line ranges from as_of to HEAD
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - run: npm run why -- lint
+      - run: npm run why -- anchor --check
````

````diff
diff --git a/.why/decisions/autonomous-build-via-sandcastle.md b/.why/decisions/autonomous-build-via-sandcastle.md
new file mode 100644
index 0000000..e00c83e
--- /dev/null
+++ b/.why/decisions/autonomous-build-via-sandcastle.md
@@ -0,0 +1,28 @@
+---
+type: decision
+title: Autonomous build via Sandcastle + gatekeeper
+description: Phases 1–4 are implemented by an issue→PR pipeline with an agent gatekeeper replacing the human merge gate.
+tags: [process, autobuild]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: AUTOBUILD.md
+      as_of: 9f0dc16
+      state: live
+---
+
+# Autonomous build via Sandcastle + gatekeeper
+
+Implementation is delegated to the Sandcastle issue→PR pipeline; an agent gatekeeper reviews, remediates in-gate, and merges. Chat sessions do architecture — DESIGN.md, issue specs, and the gate itself — not implementation.
+
+# Why
+
+Recorded at project bootstrap [1]: remediation happens in the gate rather than through the workflow's responder (which ignores its own login's feedback), and phase labels plus gate promotion enforce PLAN.md's ordering mechanically. The full rationale and risk register were written down in AUTOBUILD.md at decision time [2].
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
+[2] [AUTOBUILD.md](https://github.com/copperbox/why/blob/main/AUTOBUILD.md)
````

````diff
diff --git a/.why/decisions/blame-warns-on-every-expired-constraint.md b/.why/decisions/blame-warns-on-every-expired-constraint.md
new file mode 100644
index 0000000..dcaa4c2
--- /dev/null
+++ b/.why/decisions/blame-warns-on-every-expired-constraint.md
@@ -0,0 +1,28 @@
+---
+type: decision
+title: "`why blame` warns on every expired constraint"
+description: Expired-constraint warnings render on every blame query, not only when an edge connects the constraint to the matched code.
+tags: [blame, rendering]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-12
+  confidence: recorded
+  anchors:
+    - path: src/blame.ts
+      as_of: b758a4a
+      state: live
+---
+
+# `why blame` warns on every expired constraint
+
+Every expired constraint in the bundle renders its warning on every `why blame` query, upstream of the matched concepts or not.
+
+# Why
+
+Recorded when blame shipped [1]: the README example (the issue-104 rendering target) shows the Acme warning under `src/lock.rs:47`, a file no edge connects to that constraint, and the acceptance criteria pin that behavior. The expired-constraint report is the tool's payoff (DESIGN.md §5) and must stay visible until resolved; scoping it to upstream edges would hide it on most queries. DESIGN.md §7 was updated in the same session, along with the exact hedge prefixes ("likely — ", "speculation, thin evidence — "; unstated confidence hedges hardest).
+
+# Citations
+
+[1] [PR #18: why CLI Phase 1 — foundation, init, lint, blame](https://github.com/copperbox/why/pull/18)
+[2] [issue spec 104 in the bootstrap backlog](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/issues/104-why-blame-static.md)
````

````diff
diff --git a/.why/decisions/consumption-before-archaeology.md b/.why/decisions/consumption-before-archaeology.md
new file mode 100644
index 0000000..d5da99b
--- /dev/null
+++ b/.why/decisions/consumption-before-archaeology.md
@@ -0,0 +1,27 @@
+---
+type: decision
+title: Consumption before archaeology
+description: Build the read side (Phase 1 CLI over hand-written bundles) before the dig pipeline (Phase 3).
+tags: [roadmap]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: PLAN.md
+      as_of: 9f0dc16
+      state: live
+---
+
+# Consumption before archaeology
+
+The phase order puts `why lint` + `why blame` over hand-written bundles (Phase 1) ahead of `why dig` (Phase 3).
+
+# Why
+
+Recorded at project bootstrap [1]: a CLI over hand-written bundles proves the read-side value cheaply and gives dig a target to hit; digging into a format nobody has felt the value of risks building the hard part for an unproven payoff.
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
````

````diff
diff --git a/.why/decisions/doctor-expired-constraints-section.md b/.why/decisions/doctor-expired-constraints-section.md
new file mode 100644
index 0000000..f7b15fc
--- /dev/null
+++ b/.why/decisions/doctor-expired-constraints-section.md
@@ -0,0 +1,28 @@
+---
+type: decision
+title: "`why doctor` reports expired constraints as their own yellow section"
+description: Doctor carries an expiredConstraints section, and a live anchor whose as_of doesn't resolve reports stale rather than being skipped.
+tags: [doctor, rendering]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-12
+  confidence: recorded
+  anchors:
+    - path: src/doctor.ts
+      as_of: 845df0e
+      state: live
+---
+
+# `why doctor` reports expired constraints as their own yellow section
+
+Doctor's report includes an `expiredConstraints` section (yellow), and a live anchor whose `as_of` doesn't resolve in the enclosing repo is reported stale with reason `unresolved` rather than skipped.
+
+# Why
+
+Recorded when doctor shipped [1]: the issue-205 scope list names lost anchors, stale `as_of`s, overdue `review-by`s, `status: unknown`, open questions, and lint errors — but its acceptance criteria pin harbor's by-design *expired* constraint producing a yellow finding, which no listed section would catch (harbor's verify method is `ask`, not `review-by`). The section matches doctor's usage line ("lost anchors and stale constraints") and PLAN.md's "audit-overdue constraints" wording; the DESIGN.md §5 blast-radius walk stays `why audit`'s job. The stale-over-skip call follows from the same session: a claim the repo can't verify must not read as healthy — which is why doctor on `examples/harbor` shows six stale anchors citing the fictional harbor repo's commits.
+
+# Citations
+
+[1] [PR #19: anchor maintenance — re-resolution, health report, torture harness](https://github.com/copperbox/why/pull/19)
+[2] [issue spec 205 in the bootstrap backlog](https://github.com/copperbox/why/blob/9f0dc16ff06e3790eed67bfd62207e2839afb7b7/issues/205-why-doctor.md)
````

````diff
diff --git a/.why/decisions/edge-types-by-section-convention.md b/.why/decisions/edge-types-by-section-convention.md
new file mode 100644
index 0000000..d08c5ca
--- /dev/null
+++ b/.why/decisions/edge-types-by-section-convention.md
@@ -0,0 +1,31 @@
+---
+type: decision
+title: Edge types by section convention, not new syntax
+description: A link's meaning comes from the section it appears in (# Because of, # Instead of, …), keeping bundles plain OKF.
+tags: [schema, okf]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: src/lint.ts
+      as_of: b758a4a
+      state: live
+---
+
+# Edge types by section convention, not new syntax
+
+OKF links are untyped; `why` gives an edge meaning by the heading of the section its link sits under. `why lint` enforces the section→target-type table; the markdown itself stays ordinary.
+
+# Why
+
+Recorded at project bootstrap [1]: section conventions keep bundles valid OKF and legible in plain Obsidian. The alternative — a typed-link syntax — would fork the format and break the "any editor" property.
+
+# Because of
+
+- [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md)
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
````

````diff
diff --git a/.why/decisions/escalation-circuit-breaker.md b/.why/decisions/escalation-circuit-breaker.md
new file mode 100644
index 0000000..571adfc
--- /dev/null
+++ b/.why/decisions/escalation-circuit-breaker.md
@@ -0,0 +1,32 @@
+---
+type: decision
+title: "Circuit breaker: repeated escalation halts the loop for a chat"
+description: An issue's second gate escalation removes it from the queue, labels it needs-chat, and the gate exits HALTED instead of promoting past the hole.
+tags: [process, autobuild]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-12
+  confidence: recorded
+  anchors:
+    - path: AUTOBUILD.md
+      as_of: 9f0dc16
+      state: live
+---
+
+# Circuit breaker: repeated escalation halts the loop for a chat
+
+When an issue escalates out of the gate twice, it leaves the queue with a `needs-chat` label and a chat-agenda comment, and the gate exits HALTED (5) at the phase boundary rather than promoting past the hole.
+
+# Why
+
+Recorded at decision time [1]: rewriting a failing spec is the one act the pipeline reserves for humans+chat, and the breaker enforces that mechanically instead of advising it in prose. Details live in AUTOBUILD.md [2].
+
+# Because of
+
+- [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md)
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-12](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
+[2] [AUTOBUILD.md](https://github.com/copperbox/why/blob/main/AUTOBUILD.md)
````

````diff
diff --git a/.why/decisions/issues-are-the-spec-surface.md b/.why/decisions/issues-are-the-spec-surface.md
new file mode 100644
index 0000000..81feadd
--- /dev/null
+++ b/.why/decisions/issues-are-the-spec-surface.md
@@ -0,0 +1,31 @@
+---
+type: decision
+title: Issues are the spec surface
+description: Each Phase 1–4 task is a self-contained issue with testable acceptance criteria; implementers and the gate judge against issue text.
+tags: [process, autobuild]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: AUTOBUILD.md
+      as_of: 9f0dc16
+      state: live
+---
+
+# Issues are the spec surface
+
+Every delegated task became a self-contained issue in `issues/` with testable acceptance criteria, and those issue bodies — not chat context — are what the pipeline's implementers and the gatekeeper judge against.
+
+# Why
+
+Recorded at project bootstrap [1]: the pipeline's implementers and the gate both judge against issue text, so vague issues make autonomous review meaningless. The same entry anticipated this bundle: "When `why` can run on its own repo, these migrate into `.why/` — until then this section *is* the bundle."
+
+# Because of
+
+- [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md)
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
````

````diff
diff --git a/.why/decisions/namespaced-why-frontmatter.md b/.why/decisions/namespaced-why-frontmatter.md
new file mode 100644
index 0000000..945e7f4
--- /dev/null
+++ b/.why/decisions/namespaced-why-frontmatter.md
@@ -0,0 +1,31 @@
+---
+type: decision
+title: Extension keys namespaced under one `why:` map
+description: All why-specific frontmatter lives under a single `why:` key instead of flat top-level keys.
+tags: [schema, okf]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: src/bundle.ts
+      as_of: b758a4a
+      state: live
+---
+
+# Extension keys namespaced under one `why:` map
+
+Everything `why`-specific in a concept's frontmatter (`status`, `confidence`, `anchors`, `verify`, …) nests under a single `why:` extension map; there are no flat `why_*` top-level keys.
+
+# Why
+
+Recorded at project bootstrap [1]: one namespaced key is collision-proof against future OKF versions, and because OKF preserves unknown keys, a plain okf-mcp server round-trips a `why` bundle byte-for-byte with zero changes.
+
+# Because of
+
+- [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md)
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
````

````diff
diff --git a/.why/decisions/okf-as-substrate.md b/.why/decisions/okf-as-substrate.md
new file mode 100644
index 0000000..f9e7229
--- /dev/null
+++ b/.why/decisions/okf-as-substrate.md
@@ -0,0 +1,27 @@
+---
+type: decision
+title: OKF/okf-mcp as the substrate
+description: Bundles are plain OKF markdown served by okf-mcp, not a bespoke store.
+tags: [architecture, okf]
+timestamp: 2026-07-13
+why:
+  status: active
+  happened_on: 2026-07-11
+  confidence: recorded
+  anchors:
+    - path: package.json
+      as_of: 9f0dc16
+      state: live
+---
+
+# OKF/okf-mcp as the substrate
+
+Every `why` bundle is a valid OKF v0.1 bundle served by okf-mcp; `why` adds a schema and tooling on top rather than inventing a store.
+
+# Why
+
+Recorded at project bootstrap [1]: decisions are naturally documents (structured frontmatter plus narrative), the format serves a dual human/agent audience, MCP consumption comes for free, and the archive gets git-visible history. Origin: this project was conceived in conversation alongside okf-mcp. The alternative — a bespoke database or format — would have forfeited "browse it in any editor" and required a custom viewer.
+
+# Citations
+
+[1] [bootstrap commit 9f0dc16 — PLAN.md Decision log, 2026-07-11](https://github.com/copperbox/why/commit/9f0dc16ff06e3790eed67bfd62207e2839afb7b7)
````

````diff
diff --git a/.why/index.md b/.why/index.md
new file mode 100644
index 0000000..9afd771
--- /dev/null
+++ b/.why/index.md
@@ -0,0 +1,25 @@
+---
+okf_version: "0.1"
+generated: false
+description: Decision archive for the why tool itself — the self-hosted bundle. Seeded from PLAN.md's retired Decision log; new entries arrive via why capture and the CI recipes in docs/ci.md.
+---
+
+# why — decision archive
+
+## Substrate and schema
+
+* [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md) - plain OKF markdown over a bespoke store
+* [Extension keys namespaced under one `why:` map](/decisions/namespaced-why-frontmatter.md) - collision-proof, round-trips through plain okf-mcp
+* [Edge types by section convention, not new syntax](/decisions/edge-types-by-section-convention.md) - bundles stay valid OKF and legible anywhere
+
+## Roadmap and process
+
+* [Consumption before archaeology](/decisions/consumption-before-archaeology.md) - prove the read side before building dig
+* [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md) - implementation delegated to the issue→PR pipeline
+* [Issues are the spec surface](/decisions/issues-are-the-spec-surface.md) - testable acceptance criteria or autonomous review is meaningless
+* [Circuit breaker: repeated escalation halts the loop for a chat](/decisions/escalation-circuit-breaker.md) - spec rewrites are reserved for humans
+
+## Tool behavior
+
+* [`why blame` warns on every expired constraint](/decisions/blame-warns-on-every-expired-constraint.md) - the §5 payoff must never be invisible
+* [`why doctor` reports expired constraints as their own yellow section](/decisions/doctor-expired-constraints-section.md) - and unresolvable as_of reads stale, never healthy
````

````diff
diff --git a/.why/log.md b/.why/log.md
new file mode 100644
index 0000000..527c7ca
--- /dev/null
+++ b/.why/log.md
@@ -0,0 +1,4 @@
+# Update Log
+
+## 2026-07-13
+* why init: scaffolded the empty bundle (decisions, constraints, attempts, incidents, questions)
````

````diff
diff --git a/DESIGN.md b/DESIGN.md
index 42dff88..437f9f7 100644
--- a/DESIGN.md
+++ b/DESIGN.md
@@ -175,7 +175,7 @@ Same data over MCP: agents mount the bundle via okf-mcp and get story-of-this-co
 ## 8. Implementation shape
 
 - **Language:** TypeScript (Node), matching okf-mcp; depends on okf-mcp as a library where possible rather than shelling out.
-- **CLI:** `why dig | anchor | audit | blame | lint | doctor | init`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle.
+- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | init`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it.
 - **Agent integration:** dig/audit agent prompts ship as Claude Code skills in `skills/`; the CLI's `--episodes`/`--evidence` subcommands are the deterministic tools those skills call.
 - **No daemon.** Everything is a run-to-completion command suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly).
````

````diff
diff --git a/PLAN.md b/PLAN.md
index 6fcde7e..b54395f 100644
--- a/PLAN.md
+++ b/PLAN.md
@@ -10,8 +10,8 @@ Every session in this repo:
 
 1. Read `CLAUDE.md`, then skim this file to find the current phase (first phase with unchecked tasks).
 2. Pick the next unchecked task — or the task the user names. Tasks are ordered; don't skip ahead unless blocked.
-3. Before building, check the task's *Decide* items (if any) — settle them with the user or record the choice in the [Decision log](#decision-log).
-4. Check the box when done, note anything surprising under the task, and add a Decision log entry for any choice that deviates from [DESIGN.md](DESIGN.md).
+3. Before building, check the task's *Decide* items (if any) — settle them with the user or record the choice as a `decision` concept in [.why/](.why/index.md) (the [Decision log](#decision-log) that used to live in this file).
+4. Check the box when done, note anything surprising under the task, and record any choice that deviates from [DESIGN.md](DESIGN.md) as a decision concept in `.why/`.
 5. If DESIGN.md turned out to be wrong, fix DESIGN.md in the same session — it is the source of truth and must not drift from reality.
 
 Keep this file honest: it is the memory between sessions.
@@ -46,7 +46,7 @@ Goal: anchors survive real development. This is the make-or-break phase — if r
 - [ ] `why anchor` — full resolution order from DESIGN.md §4, frontmatter-only updates via okf-mcp, `--check` mode for CI
 - [x] `why doctor` — report lost anchors, stale `as_of`s, audit-overdue constraints
 - [ ] Torture test: replay ~50 real commits of an actual repo (okf-mcp's own history is right here) over a seeded bundle; measure anchor survival rate. **Target: >90% of anchors either resolve correctly or honestly report lost — zero silently-wrong anchors.**
-- [ ] Decide open problem #1 (wholesale-rewrite policy) from the torture-test data; record in Decision log
+- [ ] Decide open problem #1 (wholesale-rewrite policy) from the torture-test data; record as a decision concept in `.why/`
 
 ## Phase 3 — Archaeology: `why dig`
 
@@ -80,15 +80,9 @@ Goal: the why visible where people read and edit code, and `why` running on a re
 
 ## Decision log
 
-Choices made along the way, newest first.
-
-- **2026-07-12 — `why doctor` reports expired constraints as a section of their own (yellow)**: the issue-205 scope list names lost anchors, stale `as_of`s, overdue `review-by`s, `status: unknown`, open questions, and lint errors — but its acceptance criteria pin harbor's by-design *expired* constraint producing a yellow finding, which no listed section would catch (harbor's verify method is `ask`, not `review-by`). Doctor therefore carries an `expiredConstraints` section, matching its usage line ("lost anchors and stale constraints") and this plan's "audit-overdue constraints" wording; the §5 blast-radius walk stays `why audit`'s job. Also decided: a live anchor whose `as_of` doesn't resolve in the enclosing repo is reported stale (reason `unresolved`) rather than skipped — a claim the repo can't verify must not read as healthy — which is why doctor on `examples/harbor` shows six stale anchors citing the fictional harbor repo's commits. *Confidence: recorded.*
-- **2026-07-12 — `why blame` warns on every expired constraint, not only upstream ones**: the README example (the issue-104 rendering target) shows the Acme warning under `src/lock.rs:47`, a file no edge connects to that constraint, and the acceptance criteria pin that behavior. The expired-constraint report is the tool's payoff (DESIGN.md §5) and must stay visible until resolved; scoping it to upstream edges would hide it on most queries. DESIGN.md §7.3 updated to say so, along with the exact hedge prefixes ("likely — ", "speculation, thin evidence — "; unstated confidence hedges hardest). *Confidence: recorded.*
-- **2026-07-12 — Circuit breaker: repeated escalation halts the loop for a chat**: an issue's second gate escalation removes it from the queue, labels it `needs-chat` with a chat-agenda comment, and the gate exits HALTED (5) at the phase boundary instead of promoting past the hole. Rewriting a failing spec is the one act the pipeline reserves for humans+chat, and now that's enforced mechanically instead of advised in prose. Details: `AUTOBUILD.md`. *Confidence: recorded.*
-- **2026-07-11 — Autonomous build via Sandcastle + gatekeeper**: implementation delegated to the issue→PR pipeline with an agent replacing the human merge gate; in-gate remediation instead of the workflow's responder (which ignores its own login's feedback); phase labels + gate promotion enforce PLAN ordering. Full rationale and risk register: `AUTOBUILD.md`. *Confidence: recorded.*
-- **2026-07-11 — Issues are the spec surface**: each Phase 1–4 task became a self-contained issue in `issues/` with testable acceptance criteria, because the pipeline's implementers and the gate both judge against issue text — vague issues make autonomous review meaningless. *Confidence: recorded.* When `why` can run on its own repo, these migrate into `.why/` — until then this section *is* the bundle.
-
-- **2026-07-11 — Consumption before archaeology** (Phase 1 before Phase 3): a CLI over hand-written bundles proves the read-side value cheaply and gives dig a target to hit; digging into a format nobody has felt the value of risks building the hard part for an unproven payoff. *Confidence: recorded.*
-- **2026-07-11 — Extension keys namespaced under a single `why:` frontmatter map** rather than flat keys: collision-proof against future OKF versions; OKF preserves unknown keys so plain okf-mcp round-trips it. *Confidence: recorded.*
-- **2026-07-11 — Edge types by section convention, not new syntax**: keeps bundles valid OKF and legible in Obsidian; the alternative (typed-link syntax) would fork the format and break the "any editor" property. *Confidence: recorded.*
-- **2026-07-11 — OKF/okf-mcp as substrate** rather than a bespoke store: decisions-as-documents, dual human/agent audience, MCP consumption for free, git-visible history. Origin: this project was conceived in conversation alongside okf-mcp. *Confidence: recorded.*
+Retired 2026-07-13 — `why` now runs on its own repository. Every entry that
+lived here was converted into a `decision` concept (confidence `recorded`,
+citations to this repo's commits/PRs) in the self-hosted bundle:
+**[.why/decisions/](.why/decisions/)**, indexed at [.why/index.md](.why/index.md).
+Record new decisions there (via `why capture` post-merge, or by hand); the CI
+jobs in [docs/ci.md](docs/ci.md) keep the bundle linted, anchored, and audited.
````

````diff
diff --git a/README.md b/README.md
index dfe24e9..79e2147 100644
--- a/README.md
+++ b/README.md
@@ -85,9 +85,25 @@ Named here so we never pretend otherwise (expanded in [DESIGN.md §Open problems
 - **Hallucinated rationale** is the hard trust problem. The confidence ladder and evidence-citation requirements exist because a decision archive people can't trust is worse than none.
 - **Cold start** is the hard adoption problem. Nobody hand-writes ADRs retroactively; `why dig` must produce a genuinely useful first bundle from history alone, unattended, or the tool never gets a chance.
 
+## Self-hosted
+
+`why` runs on its own repository: [`.why/`](.why/index.md) is this repo's live
+decision archive — PLAN.md's old Decision log converted into `decision`
+concepts (confidence `recorded`, citations to the actual commits and PRs) —
+and the living demo of the schema on a real codebase. It stays true
+mechanically: every PR runs `why lint` + `why anchor --check`, a weekly job
+runs `why audit`, and merged PRs get drafted into `.why/.drafts/` by
+`why capture` — the exact workflows documented in [docs/ci.md](docs/ci.md),
+active under [`.github/workflows/`](.github/workflows). Browse it like any
+bundle:
+
+```bash
+npx -y @copperbox/okf-mcp --bundle why=.why inspect
+```
+
 ## Status
 
-Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all seven subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>/.cache/` keyed by bundle contents + repo HEAD — the cache directory ignores itself via its own `.gitignore`, so `why init` needs no gitignore handling and existing bundles get the same behavior. `why lint` works: it delegates OKF conformance to okf-mcp and enforces the `why`-schema layer above it (DESIGN.md §2 vocab tables, required sections, edge-target types, status/section consistency) as stable `W###` rules — human-readable by default or `--json`, exit 1 on any error-severity finding. `why anchor` works: it re-resolves every anchor claim against HEAD (symbol-first, then blame-trace, then honestly `lost` — never a guess) and rewrites only the `why.anchors` frontmatter entries, leaving every other byte of the concept untouched; `--check` is the CI mode (resolve, write nothing, exit 1 on drift) and `--concept <id>` scopes a run. It currently carries its own minimal internal resolvers; standalone, more capable resolvers now exist alongside it and are next in line to replace them behind the same seam — a blame-trace resolver ([src/trace-range.ts](src/trace-range.ts)) that traces an anchored line range from its as-of commit to HEAD, or proves it `lost`, and a symbol resolver ([src/find-symbol.ts](src/find-symbol.ts)) that finds a named symbol at HEAD (tree-sitter WASM grammars for TypeScript/JavaScript, Rust, Python and Go; a lower-confidence line-regex heuristic elsewhere), following a symbol into another file only when git history connects it to the anchored one, and answering `ambiguous` rather than guessing between duplicate declarations. The anchor resolver's survival rate is measured by a torture harness ([test/torture/](test/torture/README.md)) that replays a repo's history commit by commit through the real `why anchor` command and fails on any silently-wrong anchor — `npm run test:torture` runs the built-in scenario, and it can be pointed at a real repo with seeded anchors. `why doctor` works: a read-only bundle health report — lost anchors and lint errors are red (exit 1); stale `as_of`s, overdue `review-by` constraints, `status: unknown` and expired constraints, and open questions (age-sorted) are yellow (exit 0) — human-readable by default or `--json`; it now also opens with a dig-freshness line (commits since the last dig on the current branch). `why dig --episodes` works — the deterministic half of archaeology (DESIGN.md §6 step 1): it walks git history (high-water mark → HEAD when `<bundle>/.dig-state.json` carries one; full history otherwise), clusters commits into episodes (merge/PR boundaries first, then same-author/<48h/file-overlap clustering for direct commits), and flags tells — reverts, fix-chains, sudden churn on old-quiet files, comment tells — per episode and in a global summary; `--json` or `--out <file>` emit a stable, documented JSON report ([docs/dig-episodes.md](docs/dig-episodes.md)). `why dig --evidence <episodes.json>` works: it assembles one deterministic evidence pack per episode — full commit messages, PR/issue threads via `gh` (degrading to explicit `[unavailable: …]` markers when there's no remote or no `gh`), local exported context via `--evidence-dir`, and per-file-clipped diffs under a `--max-chars` budget with `[clipped: …]` markers naming what was cut — packs land in the self-ignoring `<bundle>/.cache/evidence/` by default; format documented in [docs/dig-evidence.md](docs/dig-evidence.md). The judgment half of the dig pipeline ships as Claude Code skills, not code: [skills/dig/SKILL.md](skills/dig/SKILL.md) (per-episode reconstruction — schema contract, the verbatim confidence ladder, cite-everything, prefer-`question`-over-`speculative`, update-don't-duplicate) and [skills/dig-synthesize/SKILL.md](skills/dig-synthesize/SKILL.md) (cross-episode merge/supersede/promote pass ending in clean `lint` + `doctor`), with the end-to-end runbook — the era-chunked cold-start order and a dry walkthrough of the harbor story included — in [docs/digging.md](docs/digging.md). Incremental dig state is in place ([src/dig-state.ts](src/dig-state.ts)): `.why/.dig-state.json` holds a per-branch high-water mark, advanced atomically only after a successful episode emission and safe to delete (re-dig everything; synthesis dedupes), with `--from <rev>`/`--full` honored as range overrides by `why dig --episodes`. The remaining piece (`audit`) is not implemented yet — it says so and exits 2.
+Early implementation. The schema and pipeline are specified, and the CLI foundation exists: `why <command>` dispatches all eight subcommands, discovers the nearest `.why/` bundle (or takes `--bundle <path>`), and loads it through okf-mcp with schema-aware validation of the `why:` frontmatter. `why init` works: it scaffolds an empty bundle at the repo root (with `--capture-snippet` to add a knowledge-capture block to CLAUDE.md). `why blame` works in its static form — it renders the story format shown at the top of this README, modulo copy (anchors trusted as written; run `why anchor` to re-resolve them), with `--json` for the resolved structure; its anchor lookups run through the shared span→concept index ([src/anchors.ts](src/anchors.ts), DESIGN.md §7 step 1), cached under `<bundle>/.cache/` keyed by bundle contents + repo HEAD — the cache directory ignores itself via its own `.gitignore`, so `why init` needs no gitignore handling and existing bundles get the same behavior. `why lint` works: it delegates OKF conformance to okf-mcp and enforces the `why`-schema layer above it (DESIGN.md §2 vocab tables, required sections, edge-target types, status/section consistency) as stable `W###` rules — human-readable by default or `--json`, exit 1 on any error-severity finding. `why anchor` works: it re-resolves every anchor claim against HEAD (symbol-first, then blame-trace, then honestly `lost` — never a guess) and rewrites only the `why.anchors` frontmatter entries, leaving every other byte of the c
[clipped: diff of README.md in a735c62 — showing 8000 of 14159 chars]
````

````diff
diff --git a/docs/capture.md b/docs/capture.md
new file mode 100644
index 0000000..886252a
--- /dev/null
+++ b/docs/capture.md
@@ -0,0 +1,109 @@
+# Merge-time capture — recording the why while it's fresh
+
+Digging history (docs/digging.md) is the cold start. The steady state is
+capture at decision time: the moment a PR merges, its description and review
+thread still hold the why, so a concept drafted *now* earns confidence
+`recorded` — the top of the ladder — instead of being excavated later at
+`inferred`. This is DESIGN.md open problem #5, and `why capture` is its
+pipeline: cheapest data, best data.
+
+Like the dig pipeline, judgment is split out of the CLI. `why capture` is
+deterministic assembly; the editorial step that turns a draft into a finished
+concept is [skills/capture/SKILL.md](../skills/capture/SKILL.md).
+
+## The drafts directory: `.why/.drafts/`
+
+Everything `why capture` emits is a **draft**, written to `.why/.drafts/` —
+deliberately a dot-directory. okf-mcp's bundle walk serves every non-dot
+`.md` under the bundle root and skips dot-directories only, so a plain
+`.why/drafts/` would leak unedited machine output straight into `why blame`
+and the mounted bundle. The dot-dir keeps drafts invisible to bundle loads,
+`why blame`, `why lint`, `why doctor`, and the anchor index (whose content
+hash also skips dot-directories) until a human or agent promotes them.
+
+Drafts are meant to be committed: they are the promotion queue, not derived
+state, so `.why/.drafts/` carries no self-ignoring `.gitignore` the way
+`.why/.cache/` does.
+
+## Drafting
+
+```bash
+why capture --pr 212          # primary: from a merged or closed PR, via gh
+why capture --commit a3f9c2e  # fallback: from a local commit, no gh needed
+```
+
+`--pr` asks `gh` for the PR's state, discussion, and merge commit, then:
+
+- **Type is guessed by outcome.** Merged → `decision` (status `active`);
+  closed without merging → `attempt` (status `abandoned`); a still-open PR is
+  refused — capture records outcomes.
+- **`happened_on`** comes from the merge/close time.
+- **Anchors come from the merge diff's hunks**: one anchor per hunk's
+  new-side span (zero-context, exact to the changed lines), `as_of` the merge
+  commit, `state: live`. A file with many hunks collapses to one whole-file
+  anchor, said out loud; a deleted file anchors nothing; an unmerged PR gets
+  no anchors at all — its diff never landed, so anchoring mainline code to it
+  would be silently wrong.
+- **Citations** point at the PR (and the merge commit, when an `origin`
+  remote URL is derivable).
+- **Rationale candidates are quoted verbatim**, never paraphrased: the PR
+  description always, plus every comment/review paragraph matching the
+  rationale-tell vocabulary (because/instead/chose/tradeoff/…), each with
+  attribution. The pre-filled `confidence: recorded` is exactly as strong as
+  those quotes — the skill's first job is checking they actually state the
+  reason.
+- **An evidence pack sidecar** (`<draft>.evidence.md`, built by the same
+  module as `why dig --evidence`) lands beside the draft with the full
+  thread, commit messages, and clipped diffs, so the finishing agent never
+  fetches on its own.
+
+`--commit` is the gh-free fallback for repos without PRs: same anchors and
+draft shape, with the commit message body as the sole rationale candidate.
+
+Every degradation — no merge commit locally, no remote to link to, zero
+rationale candidates (in which case `confidence` is left unset rather than
+overstated) — is reported on stdout *and* embedded in the draft as a
+`<!-- capture: … -->` note. Re-capturing an existing draft is refused, never
+an overwrite.
+
+## Promoting
+
+Promotion out of drafts is an editorial act, not an automatic one:
+
+```bash
+why capture --promote pr-212-replace-striped-locks.md
+```
+
+The draft is written into the type directory named by its frontmatter
+(`decisions/`, `attempts/`, …) via okf-mcp — which stamps `timestamp` and
+normalizes citations — and the bundle is linted. Any error-severity finding
+on the new file rolls the write back and keeps the draft, printing the
+findings; warnings and findings elsewhere in the bundle never block. On
+success the draft and its evidence sidecar are removed. Rename the draft to
+its archive slug *before* promoting: the filename becomes the concept id.
+
+The judgment between those two commands — verifying quotes, rewriting the
+narrative, trimming anchors, wiring edges, retyping mis-guessed outcomes — is
+the capture skill: [skills/capture/SKILL.md](../skills/capture/SKILL.md).
+
+## Wiring it as a post-merge CI job
+
+Run capture when a PR closes, and commit the draft back via a PR so the draft
+itself gets a human glance (a direct push to a `why-drafts` branch works
+too). The copy-pasteable workflow lives with the other CI recipes in
+[docs/ci.md](ci.md#post-merge-capture-why-capture) — it is the same
+`why-capture.yml` this repository runs on itself under `.github/workflows/`.
+
+Notes that survive whatever workflow shape you pick:
+
+- `fetch-depth: 0` (or at least a deep-enough fetch) matters: without the
+  merge commit in the clone, capture still drafts but honestly reports "no
+  anchors derived".
+- The job is idempotent per PR — a re-run against an already-drafted PR exits
+  with "already exists — promote or remove it before re-capturing".
+- Drafts accumulate until someone runs the capture skill (or edits by hand)
+  and promotes. A weekly reminder that lists `ls .why/.drafts/` output pairs
+  well with the weekly `why audit` job.
+
+Out of scope here: org-wide webhook plumbing; this recipe is one repo wiring
+its own steady state.
````

````diff
diff --git a/docs/ci.md b/docs/ci.md
new file mode 100644
index 0000000..7e4d836
--- /dev/null
+++ b/docs/ci.md
@@ -0,0 +1,199 @@
+# CI recipes — the operational story
+
+Three jobs keep an archive honest without anyone remembering to run anything:
+a PR gate (the bundle may not merge in a state it cannot back), a weekly
+audit (constraints are re-verified and expiry becomes a visible event), and
+post-merge capture (new decisions are drafted while the rationale is fresh). All
+three are run-to-completion commands — no daemon (DESIGN.md §8).
+
+The workflows below are live in this repository under
+[`.github/workflows/`](../.github/workflows), running `why` on its own
+`.why/` bundle — the self-hosted demo. They execute the CLI from source via
+the `why` npm script (`npm run why -- <command>`), since this repo *is* the
+package. In a repo that consumes `why` as a dependency, replace
+`npm ci` + `npm run why -- …` with `npx -y @copperbox/why …` and drop the
+Node setup to taste; everything else transfers unchanged.
+
+## The PR gate: `why lint` + `why anchor --check`
+
+`why lint` fails on schema errors (missing required sections, bad edge
+targets, confidence claims without citations). `why anchor --check` re-resolves
+every anchor claim against the PR's HEAD and exits 1 on drift *without
+writing anything* — the fix is to run `why anchor` locally and commit the
+frontmatter update it makes. An anchor already committed as `state: lost`
+does not fail the gate; surfacing those is `why doctor`'s job.
+
+`.github/workflows/why-pr-gate.yml`:
+
+```yaml
+name: why-pr-gate
+
+# PR gate (docs/ci.md): the archive may not merge in a state it cannot back.
+# `why lint` enforces the schema; `why anchor --check` fails on anchor drift
+# without writing anything — run `why anchor` locally and commit the result.
+on:
+  pull_request:
+
+jobs:
+  gate:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          fetch-depth: 0 # anchor resolution traces line ranges from as_of to HEAD
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - run: npm run why -- lint
+      - run: npm run why -- anchor --check
+```
+
+`fetch-depth: 0` matters: blame-tracing an anchor from its `as_of` commit to
+HEAD needs that history in the clone. A shallow clone makes honest anchors
+unresolvable.
+
+## The weekly audit: `why audit`, expiry becomes an issue
+
+`why audit` sweeps every active constraint: `verify.method: check` commands
+run directly; overdue `review_by` dates are flagged; `method: ask` constraints
+are listed for an agent session (export them with `--questions-out`, apply the
+filled-in questionnaire with `--answers` — the CLI never calls an LLM, so the
+scheduled job only reports them). Exit 1 means something *newly expired*: the
+constraint's status was flipped in place, evidence was appended to its
+`# Still true?` section, and a `question` concept was filed for every active
+decision downstream. That is the archive learning something, so the report
+becomes a GitHub issue and the write-back becomes a PR; any other failure
+fails the job loudly.
+
+`.github/workflows/why-audit.yml`:
+
+```yaml
+name: why-audit
+
+# Weekly constraint re-verification (docs/ci.md). `why audit` exits 1 when a
+# constraint newly expired — the signal that the archive learned something —
+# so the report becomes a GitHub issue and the flipped bundle a PR; any other
+# non-zero exit fails the job loudly.
+on:
+  schedule:
+    - cron: "17 6 * * 1" # Mondays 06:17 UTC
+  workflow_dispatch:
+
+jobs:
+  audit:
+    runs-on: ubuntu-latest
+    permissions:
+      contents: write
+      issues: write
+      pull-requests: write
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          fetch-depth: 0
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - name: run the audit
+        id: audit
+        run: |
+          set +e
+          npm run --silent why -- audit > audit-report.txt 2>&1
+          echo "exit=$?" >> "$GITHUB_OUTPUT"
+          cat audit-report.txt
+      - name: fail on audit errors
+        if: steps.audit.outputs.exit != '0' && steps.audit.outputs.exit != '1'
+        run: |
+          echo "why audit failed (exit ${{ steps.audit.outputs.exit }})"
+          exit 1
+      - name: open an issue from the scar-tissue report
+        if: steps.audit.outputs.exit == '1'
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: |
+          gh issue create \
+            --title "why audit: a constraint expired ($(date -u +%Y-%m-%d))" \
+            --body-file audit-report.txt
+      - name: PR the expiry write-back (status flip + question concepts)
+        if: steps.audit.outputs.exit == '1'
+        uses: peter-evans/create-pull-request@v6
+        with:
+          branch: why-audit
+          add-paths: .why
+          title: "why audit: expired constraint write-back"
+          commit-message: "why audit: constraint expired — status flip + downstream questions"
+```
+
+Without the write-back PR the flip would evaporate with the runner and the
+same constraint would re-expire (and re-open an issue) every week — the flip
+and the report travel together or the loop never converges.
+
+## Post-merge capture: `why capture --pr`
+
+When a PR closes, `why capture` drafts a concept from its description and
+review thread into `.why/.drafts/` — merged PRs become `decision` drafts,
+closed-unmerged ones become `attempt` drafts, anchors come from the merge
+commit's diff, and rationale candidates are quoted verbatim with attribution
+(docs/capture.md has the full drafting contract). Drafts are never served;
+they leave the queue only through the editorial, lint-gated
+`why capture --promote` step, so the job PRs the draft back for that human or
+agent pass rather than pushing to main.
+
+`.github/workflows/why-capture.yml`:
+
+```yaml
+name: why-capture
+
+# Post-merge capture (docs/ci.md, docs/capture.md): when a PR closes, draft a
+# concept from its discussion into .why/.drafts/ while the rationale is fresh, and
+# PR the draft back for the editorial promotion step (skills/capture).
+on:
+  pull_request:
+    types: [closed]
+
+jobs:
+  capture:
+    runs-on: ubuntu-latest
+    permissions:
+      contents: write
+      pull-requests: write
+    steps:
+      - uses: actions/checkout@v4
+        with:
+          ref: main
+          fetch-depth: 0 # capture reads the merge commit's diff
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+      - run: npm ci
+      - run: npm run why -- capture --pr ${{ github.event.pull_request.number }}
+        env:
+          GH_TOKEN: ${{ github.token }}
+      - uses: peter-evans/create-pull-request@v6
+        with:
+          branch: why-drafts
+          add-paths: .why
+          title: "why: capture draft for #${{ github.event.pull_request.number }}"
+          commit-message: "why capture: draft from #${{ github.event.pull_request.number }}"
+```
+
+Notes:
+
+- The job is idempotent per PR — re-running against an already-drafted PR
+  exits with "already exists — promote or remove it before re-capturing".
+- Drafts accumulate on the `why-drafts` branch until someone runs the capture
+  skill (or edits by hand) and promotes; pairing a weekly look at
+  `.why/.drafts/` with the audit job's cadence works well.
+- `ref: main` + `fetch-depth: 0`: without the merge commit in the clone,
+  capture still drafts but honestly reports "no anchors derived".
+
+## What stays out of CI
+
+Digging (docs/digging.md) is an agent-driven, judgment-heavy pass — run it
+deliberately, not on a schedule. The `method: ask` questionnaire loop is the
+same kind of work: the audit job *reports* ask-constraints; answering them is
+an agent session with `why audit --questions-out` / `--answers`.
````

````diff
diff --git a/package-lock.json b/package-lock.json
index ea5e9cc..edfb2b4 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "@copperbox/why",
-  "version": "0.5.0",
+  "version": "0.6.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "@copperbox/why",
-      "version": "0.5.0",
+      "version": "0.6.0",
       "license": "MIT",
       "dependencies": {
         "@copperbox/okf-mcp": "^0.19.1",
@@ -20,7 +20,8 @@
         "@copperbox/sandcastle-workflow": "^0.4.2",
         "@types/node": "^22.10.0",
         "tsx": "^4.19.0",
-        "typescript": "^5.7.0"
+        "typescript": "^5.7.0",
+        "yaml": "^2.9.0"
       }
     },
     "node_modules/@ai-hero/sandcastle": {
````

````diff
diff --git a/package.json b/package.json
index 088baba..e1bbecd 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@copperbox/why",
-  "version": "0.5.0",
+  "version": "0.6.0",
   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
   "type": "module",
   "license": "MIT",
@@ -11,6 +11,7 @@
     "dist"
   ],
   "scripts": {
+    "why": "tsx src/cli.ts",
     "typecheck": "tsc --noEmit",
     "test": "tsx --test test/*.test.ts",
     "test:torture": "tsx --test test/torture/torture.test.ts",
@@ -25,7 +26,8 @@
     "@copperbox/sandcastle-workflow": "^0.4.2",
     "@types/node": "^22.10.0",
     "tsx": "^4.19.0",
-    "typescript": "^5.7.0"
+    "typescript": "^5.7.0",
+    "yaml": "^2.9.0"
   },
   "dependencies": {
     "@copperbox/okf-mcp": "^0.19.1",
````

````diff
diff --git a/skills/capture/SKILL.md b/skills/capture/SKILL.md
new file mode 100644
index 0000000..9642682
--- /dev/null
+++ b/skills/capture/SKILL.md
@@ -0,0 +1,107 @@
+---
+name: capture
+description: Turn `why capture` drafts in .why/.drafts/ into finished concepts. Each draft carries machine-extracted rationale quotes, anchors, and citations from one merged/closed PR plus an evidence pack sidecar; the judgment step is verifying the quotes actually state the why, rewriting them into narrative, and promoting through the lint gate. Run once per draft, soon after the merge.
+---
+
+# capture — finish one merge-time draft
+
+You are the judgment half of merge-time capture (DESIGN.md open problem #5).
+`why capture --pr <n>` already did the deterministic half: it assembled the
+PR's evidence into a pack and emitted a draft into `.why/.drafts/` with
+frontmatter pre-filled (type guessed from merge-vs-close, `happened_on`,
+anchors derived from the merge diff's hunks, citations to the PR) and the
+rationale candidates quoted verbatim. Drafts are deliberately **not served**
+— nothing in `.why/.drafts/` reaches `why blame` or the mounted bundle until
+you promote it. Your input is one draft plus its `.evidence.md` sidecar; your
+output is either a promoted concept, an update to an existing concept, a
+`question`, or a recorded reason to drop the draft.
+
+The bundle is mounted writable:
+
+```bash
+npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable
+```
+
+## The contract — non-negotiable
+
+1. **The draft and its evidence pack are your entire evidence universe.** Do
+   not fetch anything yourself — no `gh`, no web, no extra git spelunking. An
+   `[unavailable: …]` marker in the pack means that evidence does not exist
+   for this run. What you cannot see, you cannot cite; what you cannot cite,
+   you cannot claim.
+2. **The pre-filled `recorded` is a hypothesis, not a fact.** The CLI set
+   `confidence: recorded` because a human wrote *something* down at the time.
+   `recorded` survives only if the quotes you keep actually **state the
+   reason**. Quotes that describe the change without saying why support at
+   most `inferred` — and usually mean a `question`.
+3. **Never assert rationale above its evidence.** Assign confidence from the
+   ladder below, bottom-up from what the kept quotes support — never from how
+   plausible the story feels.
+4. **When in doubt, file a `question`.** The full rule is under the ladder;
+   it overrides completeness.
+5. **Update, don't duplicate.** Search the bundle before promoting anything.
+   If a concept about this decision already exists, fold the draft into it
+   with `update_concept` and delete the draft; never promote a second file
+   about the same idea.
+
+## The confidence ladder (DESIGN.md §2 — verbatim)
+
+| Level | Meaning | Bar |
+|---|---|---|
+| `recorded` | A human wrote this rationale down at the time | Direct quote/paraphrase of a PR description, ADR, commit message *stating the reason* |
+| `corroborated` | Inferred, but two independent evidence sources agree | e.g. commit sequence shows the revert *and* the issue thread discusses the failure |
+| `inferred` | Single-source inference from code/commit structure | "The lock was replaced in the same PR that references the incident" |
+| `speculative` | Plausible narrative, thin evidence | Should usually be a `question` instead; allowed only when flagged for human confirmation |
+
+Rule for the dig agent: **when in doubt, file a `question`, not a `speculative` decision.** An honest gap invites a human answer; a confident guess poisons trust in the whole archive.
+
+Capture-specific application: quotes from one PR thread — description,
+comments, reviews — are **one source**. A capture draft alone never reaches
+`corroborated`; it is `recorded` when a kept quote states the reason, and it
+drops down the ladder from there.
+
+## Procedure
+
+1. **Read the draft and its evidence pack** (`<draft>.evidence.md`, same
+   directory). Note every `[unavailable: …]`/`[clipped: …]` marker and every
+   `<!-- capture: … -->` note the CLI left — those are honest degradations,
+   not decoration.
+2. **Search the bundle first.** Use `search_concepts` with the PR number,
+   touched paths, and key phrases; open hits with `get_concept`, check
+   `get_neighbors`. This decides promote-vs-update before anything else.
+3. **Judge the quotes.** Keep only candidates that state or directly evidence
+   the why; delete the rest. Verify each kept claim against the pack — the
+   draft's extraction is keyword-matched, not judged.
+4. **Confirm the type and status.** Merged → `decision` and closed-unmerged →
+   `attempt` are guesses. A merged PR that documents a failed direction being
+   removed may really be recording an `attempt` or an `incident`; retype and
+   move accordingly (the promote step derives the target directory from the
+   frontmatter `type`).
+5. **Rewrite the body.** Replace the summary comment with what is true now
+   because of this change; turn the kept quotes into a `# Why` narrative for
+   the engineer who just ran `why blame` here, citing `[1]`, `[2]`. Wire
+   `# Because of` / `# Instead of` edges only to concepts that exist in the
+   bundle right now.
+6. **Trim the anchors.** The CLI anchored every hunk of the diff. Keep the
+   spans a reader would actually ask the question from; add `symbol` where
+   the span is a named declaration; prefer whole-file only for architectural
+   decisions. `as_of` stays the merge commit — never a sha you didn't see.
+7. **Rename for the archive.** Draft names carry PR provenance
+   (`pr-212-….md`); rename the file to a short kebab-case slug for the idea
+   (`queue-based-locking.md`) before promoting — the filename becomes the
+   concept id.
+8. **Promote.** `why capture --promote <draft>` moves the draft into its type
+   directory only if it lints clean; a refusal prints the findings and keeps
+   the draft — fix and re-run. If the draft instead folded into an existing
+   concept or became a `question` you wrote directly, delete the draft and
+   its `.evidence.md` sidecar so the queue stays honest.
+
+## Finish line
+
+- No draft you processed is left in limbo: promoted, folded into an existing
+  concept, converted to a `question`, or deleted with the reason recorded in
+  the commit message.
+- Every promoted concept passed the promote gate (`why lint` clean on it),
+  every claim traces to a citation, and nothing sits above its rung on the
+  ladder.
+- You fetched nothing outside the draft and its pack.
````

````diff
diff --git a/src/audit.ts b/src/audit.ts
new file mode 100644
index 0000000..a9d414a
--- /dev/null
+++ b/src/audit.ts
@@ -0,0 +1,640 @@
+// `why audit` (DESIGN.md §5): constraints must be falsifiable, and expiry
+// must propagate downstream. The sweep covers every `active` constraint:
+// `verify.method: check` commands run in the enclosing repo directory with a
+// timeout and captured output; `method: ask` items are exported as an
+// agent-consumable questionnaire (the CLI never calls an LLM) and applied
+// back via `--answers`; overdue `review_by` dates are flagged. A failed
+// check — or an answer marking an ask no longer true — flips the constraint
+// to `status: expired` and walks `# Because of` edges backwards: every
+// `active` decision reached is reported as candidate scar tissue and gets a
+// generated `question` concept, unless an open question already links the
+// pair. That report is the tool's reason to exist.
+//
+// Nothing here asserts above its evidence: a check that cannot run (timeout,
+// spawn failure) is an error item, never an expiry, and an unanswered ask
+// stays open. Writes go through okf-mcp's updateConcept/writeConcept so
+// everything outside the touched spans survives byte-for-byte.
+
+import { exec } from "node:child_process";
+import { existsSync } from "node:fs";
+import { readFile, writeFile } from "node:fs/promises";
+import { basename, dirname, join } from "node:path";
+import { promisify } from "node:util";
+import { extractSection, updateConcept, writeConcept } from "@copperbox/okf-mcp";
+import { isOneOf, isPlainMap, type WhyBundle, type WhyConcept } from "./bundle.js";
+import { plural } from "./dig.js";
+
+const execAsync = promisify(exec);
+
+/** An audit run that must stop cleanly (exit 1), not crash. */
+export class AuditError extends Error {}
+
+/** How long one `verify.check` command may run before it counts as an error. */
+export const DEFAULT_CHECK_TIMEOUT_MS = 30_000;
+
+/** Chars of captured check output kept — clipped with a marker, never silently. */
+export const CHECK_OUTPUT_LIMIT = 4_000;
+
+/**
+ * `error` means the check could not be evaluated (timeout, spawn failure) —
+ * that is a problem to report, but it is not evidence the constraint is
+ * false, so it never flips anything.
+ */
+export type CheckOutcome = "passed" | "failed" | "error";
+
+export interface CheckResult {
+  concept: string;
+  command: string;
+  outcome: CheckOutcome;
+  /** null when the command produced no exit code (timeout, spawn failure). */
+  exitCode: number | null;
+  /** Combined stdout+stderr, clipped to CHECK_OUTPUT_LIMIT with a marker. */
+  output: string;
+  /** Why the outcome is `error`. */
+  detail?: string;
+}
+
+export const ASK_ANSWERS = ["still-true", "no-longer-true", "unknown"] as const;
+export type AskAnswer = (typeof ASK_ANSWERS)[number];
+
+export interface AskResult {
+  concept: string;
+  ask: string;
+  /** From the `--answers` file; `unknown` when unanswered. */
+  answer: AskAnswer;
+}
+
+export interface ReviewByDueItem {
+  concept: string;
+  review_by: string;
+}
+
+export interface UnverifiableItem {
+  concept: string;
+  reason: string;
+}
+
+export interface BlastEntry {
+  /** Concept id of the still-active downstream decision. */
+  decision: string;
+  /** The question concept covering the pair — freshly written or pre-existing. */
+  question: string;
+  /** false when an equivalent open question already existed (deduped). */
+  written: boolean;
+}
+
+export interface ExpiredConstraint {
+  concept: string;
+  method: "check" | "ask";
+  expired_on: string;
+  /** One line of what falsified it (the full evidence lands in `# Still true?`). */
+  detail: string;
+  blastRadius: BlastEntry[];
+}
+
+/**
+ * A constraint that was already `expired` before this run and still has
+ * `active` decisions downstream — candidate scar tissue. Report-only: the
+ * flip (and its question filing) happened when it expired; re-flagging it
+ * every run would be noise, but the candidacy must stay visible.
+ */
+export interface AlreadyExpiredItem {
+  concept: string;
+  expired_on: string | null;
+  decisions: string[];
+}
+
+/** The `--json` shape. Keys are a stable, tested surface. */
+export interface AuditReport {
+  root: string;
+  activeConstraints: number;
+  checks: CheckResult[];
+  asks: AskResult[];
+  reviewByPastDue: ReviewByDueItem[];
+  unverifiable: UnverifiableItem[];
+  /** Constraints flipped by this run — the exit-1 condition. */
+  expired: ExpiredConstraint[];
+  alreadyExpired: AlreadyExpiredItem[];
+  /** Bundle-relative paths of the question concepts written. */
+  questionsWritten: string[];
+  /** Absolute path of the questionnaire written, when --questions-out was passed. */
+  questionnaire: string | null;
+}
+
+export interface AnswerEntry {
+  answer: AskAnswer;
+  evidence: string;
+}
+
+export interface AuditOptions {
+  /** Parsed `--answers` content, keyed by concept id. */
+  answers?: Map<string, AnswerEntry>;
+  /** Absolute path to write the `method: ask` questionnaire to. */
+  questionsOut?: string;
+  /** "Today" for expired_on and review_by; injectable so tests are deterministic. */
+  now?: Date;
+  timeoutMs?: number;
+}
+
+// --- Questionnaire ---------------------------------------------------------
+
+export const EVIDENCE_PLACEHOLDER = "(replace this line with the evidence for your answer)";
+
+/** The agent-facing export of `method: ask` items; round-trips via `--answers`. */
+export function renderQuestionnaire(items: AskResult[]): string {
+  const lines = [
+    "# why audit questionnaire",
+    "",
+    "Active constraints verifying with `method: ask`, exported for an agent (or",
+    "human) to re-verify — `why audit` never calls an LLM itself. For each item,",
+    "investigate, set `answer:` to `still-true`, `no-longer-true`, or `unknown`,",
+    "and replace the placeholder with your evidence. Then apply the answers:",
+    "",
+    "    why audit --answers <this-file>",
+    "",
+  ];
+  if (items.length === 0) {
+    lines.push("No unanswered `method: ask` constraints — nothing to do.");
+  }
+  for (const item of items) {
+    lines.push(`## ${item.concept}`, "", item.ask, "", "answer: unknown", "", EVIDENCE_PLACEHOLDER, "");
+  }
+  return lines.join("\n").trimEnd() + "\n";
+}
+
+/**
+ * Parse a filled-in questionnaire: `## <concept-id>` starts an item, the first
+ * `answer:` line inside it is the verdict, and everything after that line
+ * (until the next item) is the evidence. Strict where it matters: an
+ * unrecognized answer or a `no-longer-true` without evidence is an error —
+ * the flip writes that evidence into `# Still true?`, so it cannot be empty.
+ */
+export function parseAnswers(text: string): Map<string, AnswerEntry> {
+  const out = new Map<string, AnswerEntry>();
+  let current: string | undefined;
+  let answer: string | undefined;
+  let evidence: string[] = [];
+  const flush = (): void => {
+    if (current === undefined) return;
+    const value = answer ?? "unknown";
+    if (!isOneOf(ASK_ANSWERS, value)) {
+      throw new AuditError(
+        `--answers: "${value}" is not an answer for ${current} — use ${ASK_ANSWERS.join(", ")}`,
+      );
+    }
+    const kept = evidence.join("\n").replaceAll(EVIDENCE_PLACEHOLDER, "").trim();
+    if (value === "no-longer-true" && kept === "") {
+      throw new AuditError(
+        `--answers: ${current} is marked no-longer-true without evidence — the flip records that evidence in "# Still true?", so it cannot be empty`,
+      );
+    }
+    out.set(current, { answer: value, evidence: kept });
+  };
+  for (const line of text.split("\n")) {
+    const heading = /^##\s+(\S+)\s*$/.exec(line);
+    if (heading !== null) {
+      flush();
+      current = heading[1]!;
+      if (out.has(current)) {
+        throw new AuditError(`--answers: ${current} appears twice — keep one answer per constraint`);
+      }
+      answer = undefined;
+      evidence = [
[clipped: diff of src/audit.ts in a735c62 — showing 8000 of 25238 chars]
````

````diff
diff --git a/src/capture.ts b/src/capture.ts
new file mode 100644
index 0000000..d00fb4e
--- /dev/null
+++ b/src/capture.ts
@@ -0,0 +1,610 @@
+// Merge-time capture (DESIGN.md open problem #5): draft a concept from a PR
+// while the discussion still holds the why, at confidence `recorded`. The CLI
+// half is deterministic assembly only — gh/git evidence via the dig evidence
+// module, anchors from the merge diff's hunks, rationale candidates quoted
+// verbatim — and everything it emits is a *draft* under `.why/.drafts/`.
+// Drafts are deliberately a dot-directory: okf-mcp serves every non-dot
+// `.md` under the bundle root (verified against its walkMarkdownFiles), so a
+// plain `drafts/` would leak unedited machine output into `why blame` and the
+// served bundle. Promotion out of drafts is an editorial act, lint-gated by
+// `why capture --promote`; the judgment step lives in skills/capture/SKILL.md.
+
+import { existsSync } from "node:fs";
+import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
+import { basename, dirname, join, resolve } from "node:path";
+import { serializeDocument, splitFrontmatter, writeConcept } from "@copperbox/okf-mcp";
+import type { ConceptFrontmatter } from "@copperbox/okf-mcp";
+import { parseLineRange, type LineRange } from "./anchors.js";
+import { CONCEPT_TYPES, isOneOf, isPlainMap, loadBundle, type WhyBundle } from "./bundle.js";
+import {
+  asComments,
+  buildEvidencePack,
+  runCommand,
+  type CommandRunner,
+  type Episode,
+  type GhComment,
+} from "./evidence.js";
+import { lintBundle, type Finding } from "./lint.js";
+
+/** A capture step that must stop the command cleanly (exit 1), not crash. */
+export class CaptureError extends Error {}
+
+/**
+ * Where drafts live, relative to the bundle root. Must stay a dot-directory:
+ * okf-mcp's bundle walk skips dot-dirs only, and drafts must never serve.
+ */
+export const DRAFTS_DIRNAME = ".drafts";
+/** Suffix of the evidence pack written beside each draft. */
+export const EVIDENCE_SUFFIX = ".evidence.md";
+/** Above this many hunks a file gets one whole-file anchor, said out loud. */
+export const MAX_HUNK_ANCHORS_PER_FILE = 4;
+/** Rationale candidates quoted into the draft; the rest point at the pack. */
+export const MAX_RATIONALE_CANDIDATES = 12;
+/**
+ * A discussion paragraph is a rationale candidate when it matches this —
+ * dig's comment-tell vocabulary widened with decision language.
+ */
+export const RATIONALE_TELL_RE =
+  /\b(because|instead|rather than|so that|decided?|decision|chose|choice|why|trade-?off|workaround|hack|constraint|blocked|reverted?)\b/i;
+
+export interface CaptureResult {
+  /** Absolute path of the draft concept file. */
+  draftPath: string;
+  /** Absolute path of the evidence pack written beside it. */
+  evidencePath: string;
+  type: "decision" | "attempt";
+  candidateCount: number;
+  anchorCount: number;
+  /** Degradations and collapses, said out loud (also embedded in the draft). */
+  notes: string[];
+}
+
+export interface CaptureOptions {
+  /** Injectable so tests answer gh from fixtures and never hit the network. */
+  runner?: CommandRunner;
+}
+
+// --- Anchors from the diff's hunks --------------------------------------------
+
+interface CapturedAnchor {
+  path: string;
+  lines?: string;
+  as_of: string;
+  state: "live";
+}
+
+interface PatchFile {
+  path: string;
+  deleted: boolean;
+  ranges: LineRange[];
+}
+
+/**
+ * Derive anchor claims from a zero-context (`-U0`) patch: one anchor per
+ * hunk's new-side span, exact to the changed lines. A pure deletion anchors
+ * the single line the cut sits after; a file with no hunks (binary,
+ * rename-only) anchors whole-file; a deleted file anchors nothing; a file
+ * with more than MAX_HUNK_ANCHORS_PER_FILE hunks collapses to one whole-file
+ * anchor with a note — never a silent cap.
+ */
+export function anchorsFromPatch(
+  patch: string,
+  asOf: string,
+): { anchors: CapturedAnchor[]; files: string[]; notes: string[] } {
+  const files: PatchFile[] = [];
+  let current: PatchFile | undefined;
+  for (const line of patch.split("\n")) {
+    const header = /^diff --git a\/.* b\/(.*)$/.exec(line);
+    if (header !== null) {
+      current = { path: header[1]!, deleted: false, ranges: [] };
+      files.push(current);
+      continue;
+    }
+    if (current === undefined) continue;
+    if (/^deleted file mode /.test(line)) current.deleted = true;
+    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
+    if (hunk !== null) {
+      const start = Number(hunk[1]);
+      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
+      if (count > 0) {
+        current.ranges.push({ start, end: start + count - 1 });
+      } else {
+        // Pure deletion: new side has no lines; claim the line the cut sits after.
+        const at = Math.max(start, 1);
+        current.ranges.push({ start: at, end: at });
+      }
+    }
+  }
+  files.sort((a, b) => a.path.localeCompare(b.path));
+
+  const anchors: CapturedAnchor[] = [];
+  const notes: string[] = [];
+  const touched: string[] = [];
+  for (const file of files) {
+    touched.push(file.path);
+    if (file.deleted) {
+      notes.push(`${file.path} was deleted by this change — nothing to anchor there`);
+      continue;
+    }
+    if (file.ranges.length === 0 || file.ranges.length > MAX_HUNK_ANCHORS_PER_FILE) {
+      if (file.ranges.length > MAX_HUNK_ANCHORS_PER_FILE) {
+        notes.push(`${file.path}: ${file.ranges.length} hunks collapsed into one whole-file anchor`);
+      }
+      anchors.push({ path: file.path, as_of: asOf, state: "live" });
+      continue;
+    }
+    for (const range of file.ranges) {
+      const lines = range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
+      // The anchor machinery must be able to read back every span we write.
+      if (parseLineRange(lines) === undefined) {
+        throw new CaptureError(`internal: derived an unparseable anchor span ${file.path}:${lines}`);
+      }
+      anchors.push({ path: file.path, lines, as_of: asOf, state: "live" });
+    }
+  }
+  return { anchors, files: touched, notes };
+}
+
+// --- Rationale candidates ------------------------------------------------------
+
+interface RationaleCandidate {
+  /** Verbatim text — the draft quotes it, never paraphrases. */
+  text: string;
+  /** Attribution rendered under the quote, e.g. `PR #7 comment by @bob`. */
+  source: string;
+}
+
+function rationaleParagraphs(text: string): string[] {
+  return text
+    .replace(/\r\n/g, "\n")
+    .split(/\n{2,}/)
+    .map((p) => p.trim())
+    .filter((p) => p !== "" && RATIONALE_TELL_RE.test(p));
+}
+
+function commentCandidates(
+  value: unknown,
+  kind: "comment" | "review",
+  n: number,
+): RationaleCandidate[] {
+  const out: RationaleCandidate[] = [];
+  for (const c of asComments(value)) {
+    const paragraphs = rationaleParagraphs(c.body ?? "");
+    if (paragraphs.length === 0) continue;
+    out.push({ text: paragraphs.join("\n\n"), source: `PR #${n} ${kind} by ${attribution(c)}` });
+  }
+  return out;
+}
+
+function attribution(c: GhComment): string {
+  const login = c.author?.login ?? "unknown";
+  const date = (c.createdAt ?? c.submittedAt ?? "").slice(0, 10);
+  return date === "" ? `@${login}` : `@${login} (${date})`;
+}
+
+// --- Shared assembly -----------------------------------------------------------
+
+function firstLine(text: string): string {
+  return text.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
+}
+
+/** Short kebab-case slug from a title; empty when nothing survives. */
+export function slugify(text: string): string {
+  const slug = text
+    .toLowerCase()
+    .replace(/[^a-z0-9]+/g, "-")
+    .replace(/^-+|-+$/g, "");
+  return slug.slice(0, 48).replace(/-+$/, "");
+}
+
+/** Origin URL normalized to https, or undefined when none is derivable. */
+function remoteHttpsUrl(runner: CommandRunner, repo: string): string | 
[clipped: diff of src/capture.ts in a735c62 — showing 8000 of 23904 chars]
````

````diff
diff --git a/src/cli.ts b/src/cli.ts
index c46942b..2e48d87 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -7,6 +7,7 @@ import { basename, dirname, join, resolve } from "node:path";
 import { parseArgs, type ParseArgsConfig } from "node:util";
 import { AnchorError, renderAnchorReport, resolveAnchors, writeAnchorUpdates } from "./anchor.js";
 import { CACHE_DIRNAME, ensureSelfIgnoringDir, loadAnchorIndex } from "./anchors.js";
+import { AuditError, auditBundle, parseAnswers, renderAuditReport, type AnswerEntry } from "./audit.js";
 import {
   BlameTargetError,
   buildBlameReport,
@@ -14,6 +15,7 @@ import {
   renderBlameReport,
 } from "./blame.js";
 import { isOneOf, loadBundle, type WhyBundle } from "./bundle.js";
+import { CaptureError, captureCommit, capturePr, promoteDraft, type CaptureResult } from "./capture.js";
 import { BundleNotFoundError, resolveBundleRoot } from "./discover.js";
 import { DigError, extractEpisodes, plural, renderEpisodesReport } from "./dig.js";
 import { DigStateError, withDigState, type DigRange, type DigRangeOverrides } from "./dig-state.js";
@@ -22,7 +24,7 @@ import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
 import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
 import { lintBundle, renderFindings } from "./lint.js";
 
-export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit"] as const;
+export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture"] as const;
 export type Command = (typeof COMMANDS)[number];
 
 /** Where a command's output goes; injectable so tests can capture it. */
@@ -45,7 +47,7 @@ export function usage(): string {
     "",
     "Usage: why <command> [options]",
     "",
-    "Commands (unimplemented commands say so and exit 2):",
+    "Commands:",
     "  init     scaffold a .why/ bundle in the current repo",
     "  lint     check the bundle against the why schema (DESIGN.md §3)",
     "  blame    show the decision story behind a file or line range",
@@ -53,12 +55,13 @@ export function usage(): string {
     "  doctor   report lost anchors and stale constraints",
     "  dig      reconstruct decisions from git/PR history",
     "  audit    re-verify constraints; flag expired ones",
+    "  capture  draft a concept from a merged PR while the why is fresh",
     "",
     "Options:",
     "  --bundle <path>     bundle root to use instead of the nearest .why/",
     "                      (lint also takes the path as a positional: why lint <path>)",
     "  --capture-snippet   (init) add the knowledge-capture block to CLAUDE.md",
-    "  --json              (blame, lint, doctor, dig) emit the results as JSON",
+    "  --json              (blame, lint, doctor, dig, audit) emit the results as JSON",
     "  --check             (anchor) CI mode — resolve, write nothing, exit 1 on drift",
     "  --concept <id>      (anchor) re-anchor a single concept",
     "  --episodes          (dig) extract commit episodes + tells from git history",
@@ -68,6 +71,11 @@ export function usage(): string {
     "  --evidence-dir <dir>  (dig) merge in local exported context (postmortems, chats)",
     "  --max-chars <n>     (dig) total size budget per evidence pack",
     "  --out <file|dir>    (dig) write the JSON report to a file (--episodes) or pack output dir (--evidence, default <bundle>/.cache/evidence)",
+    "  --questions-out <file>  (audit) export method:ask constraints as an agent questionnaire",
+    "  --answers <file>    (audit) apply a filled-in questionnaire; no-longer-true expires the constraint",
+    "  --pr <n>            (capture) draft from a merged/closed PR via gh into .why/.drafts/",
+    "  --commit <sha>      (capture) gh-free fallback — draft from a local commit",
+    "  --promote <draft>   (capture) lint-gate a draft and move it into its type directory",
   ].join("\n");
 }
 
@@ -83,16 +91,6 @@ interface CommandContext {
 
 type CommandHandler = (ctx: CommandContext) => Promise<number> | number;
 
-function notImplemented(cmd: Command): CommandHandler {
-  return ({ bundle, io }) => {
-    const loaded = bundle
-      ? ` — bundle at ${bundle.root} loaded: ${bundle.concepts.size} concepts, ${bundle.diagnostics.length} schema diagnostics`
-      : "";
-    io.err(`why ${cmd}: not implemented yet (see PLAN.md for the phase that delivers it)${loaded}`);
-    return 2;
-  };
-}
-
 interface CommandSpec {
   /** Flags parsed strictly: an unknown flag is a usage error. */
   options: CommandOptions;
@@ -321,6 +319,106 @@ async function runDig({ values, positionals, bundle, cwd, io }: CommandContext):
   }
 }
 
+/**
+ * `why audit` — re-verify active constraints; expiry propagates downstream
+ * (DESIGN.md §5). Exit 1 when anything newly expired: the CI signal for
+ * "the archive learned something".
+ */
+async function runAudit({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err("why audit: takes no positional arguments — usage: why audit [--json] [--questions-out <file>] [--answers <file>]");
+    return 2;
+  }
+  try {
+    let answers: Map<string, AnswerEntry> | undefined;
+    if (values.answers !== undefined) {
+      const answersPath = resolve(cwd, values.answers as string);
+      let text: string;
+      try {
+        text = await readFile(answersPath, "utf8");
+      } catch {
+        io.err(`why audit: cannot read answers file ${answersPath}`);
+        return 1;
+      }
+      answers = parseAnswers(text);
+    }
+    const options: Parameters<typeof auditBundle>[1] = {};
+    if (answers !== undefined) options.answers = answers;
+    if (values["questions-out"] !== undefined) {
+      options.questionsOut = resolve(cwd, values["questions-out"] as string);
+    }
+    const report = await auditBundle(bundle!, options);
+    if (values.json === true) {
+      io.out(JSON.stringify(report, null, 2));
+    } else {
+      for (const line of renderAuditReport(report)) io.out(line);
+    }
+    return report.expired.length > 0 ? 1 : 0;
+  } catch (e) {
+    if (e instanceof AuditError) {
+      io.err(`why audit: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
+const CAPTURE_USAGE = "usage: why capture --pr <n> | --commit <sha> | --promote <draft>";
+
+/**
+ * `why capture` — merge-time capture (DESIGN.md open problem #5): draft a
+ * concept from a PR (or a commit, gh-free) into `.why/.drafts/`, and promote
+ * drafts out editorially, gated on lint. Drafts are never served.
+ */
+async function runCapture({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err(`why capture: takes no positional arguments — ${CAPTURE_USAGE}`);
+    return 2;
+  }
+  const modes = (["pr", "commit", "promote"] as const).filter((mode) => values[mode] !== undefined);
+  if (modes.length !== 1) {
+    io.err(`why capture: pass exactly one mode — ${CAPTURE_USAGE}`);
+    return 2;
+  }
+  try {
+    if (values.pr !== undefined) {
+      const n = Number(values.pr);
+      if (!Number.isInteger(n) || n <= 0) {
+        io.err(`why capture: --pr must be a PR number, got "${values.pr}"`);
+        return 2;
+      }
+      return renderCapture(await capturePr(bundle!, n), io);
+    }
+    if (values.commit !== undefined) {
+      return renderCapture(await captureCommit(bundle!, values.commit as string), io);
+    }
+    const result = await promoteDraft(bundle!, values.promote as string, cwd);
+    if (!result.promoted) {
+      io.err(`why capture: promotion refused — ${result.path} fails lint, draft kept:`);
+      for (const f of result.findings) io.err(`  ${f.severity.padEnd(7)} ${f.rule}  ${f.message}`);
+      return 1;
+    }
+    io.out(`promoted → ${result.path}`);
+    for (const f of result.findings) io.out(`  ${f.severity.padEnd(7)} ${f.rule}  ${f.message}`);
+    return 0;
+  } catch (e) {
+    if (e instanceof CaptureErro
[clipped: diff of src/cli.ts in a735c62 — showing 8000 of 9622 chars]
````

````diff
diff --git a/src/evidence.ts b/src/evidence.ts
index 87fd9c4..40b7893 100644
--- a/src/evidence.ts
+++ b/src/evidence.ts
@@ -294,7 +294,7 @@ function renderHeader(episode: Episode): string {
 
 // --- gh threads --------------------------------------------------------------
 
-interface GhComment {
+export interface GhComment {
   author?: { login?: string };
   body?: string;
   createdAt?: string;
@@ -352,7 +352,8 @@ function renderThread(
   return `${lines.join("\n")}\n`;
 }
 
-function asComments(value: unknown): GhComment[] {
+/** The comment/review shape `gh` returns, tolerantly filtered. */
+export function asComments(value: unknown): GhComment[] {
   return Array.isArray(value) ? value.filter(isRecord) : [];
 }
````

````diff
diff --git a/test/audit.test.ts b/test/audit.test.ts
new file mode 100644
index 0000000..02205cc
--- /dev/null
+++ b/test/audit.test.ts
@@ -0,0 +1,460 @@
+// `why audit` (DESIGN.md §5): constraint re-verification and the scar-tissue
+// report. Temp bundles cover the flip machinery (passing/failing checks,
+// blast radius, question dedupe, ask export/answers, review-by, timeouts);
+// examples/harbor pins that an already-expired constraint is never
+// double-flagged but its downstream candidacy stays visible.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { loadBundle } from "../src/bundle.ts";
+import { auditBundle, parseAnswers, renderQuestionnaire } from "../src/audit.ts";
+import { main } from "../src/cli.ts";
+import { capture, git, write } from "./helpers.ts";
+
+const HARBOR = "examples/harbor";
+
+/** Every top-level report key, in order — the stable `--json` surface. */
+const REPORT_KEYS = [
+  "root",
+  "activeConstraints",
+  "checks",
+  "asks",
+  "reviewByPastDue",
+  "unverifiable",
+  "expired",
+  "alreadyExpired",
+  "questionsWritten",
+  "questionnaire",
+] as const;
+
+function doc(type: string, title: string, whyLines: string[], bodyLines: string[]): string {
+  return [
+    "---",
+    `type: ${type}`,
+    `title: ${title}`,
+    "timestamp: 2026-07-11",
+    "why:",
+    ...whyLines.map((l) => `  ${l}`),
+    "---",
+    "",
+    `# ${title}`,
+    ...bodyLines.flatMap((l) => ["", l]),
+    "",
+  ].join("\n");
+}
+
+const STILL_TRUE = "# Still true?\n\nLast confirmed manually.";
+
+/**
+ * A temp "repo" dir (plain directory — audit needs no git) holding a `.why/`
+ * bundle, so check commands run with a controlled cwd.
+ */
+async function makeClinic(files: Record<string, string>): Promise<{ dir: string; bundle: string }> {
+  const dir = await mkdtemp(join(tmpdir(), "why-audit-"));
+  for (const [rel, source] of Object.entries(files)) {
+    await write(dir, join(".why", rel), source);
+  }
+  return { dir, bundle: join(dir, ".why") };
+}
+
+async function auditJson(bundle: string, cwd: string, ...extra: string[]) {
+  const { io, out, err } = capture();
+  const code = await main(["audit", "--bundle", bundle, "--json", ...extra], cwd, io);
+  return { code, report: JSON.parse(out.join("\n")), err };
+}
+
+test("passing check: no change, byte-identical file, exit 0, stable JSON keys", async () => {
+  const { dir, bundle } = await makeClinic({
+    "constraints/dep-pin.md": doc("constraint", "Dep pin", [
+      "status: active",
+      "verify:",
+      "  method: check",
+      '  check: "echo still pinned"',
+    ], [STILL_TRUE]),
+  });
+  try {
+    const before = await readFile(join(bundle, "constraints/dep-pin.md"), "utf8");
+    const { code, report } = await auditJson(bundle, dir);
+    assert.equal(code, 0);
+    assert.deepEqual(Object.keys(report), [...REPORT_KEYS]);
+    assert.equal(report.activeConstraints, 1);
+    assert.deepEqual(report.checks, [
+      {
+        concept: "constraints/dep-pin",
+        command: "echo still pinned",
+        outcome: "passed",
+        exitCode: 0,
+        output: "still pinned",
+      },
+    ]);
+    assert.deepEqual(report.expired, []);
+    assert.deepEqual(report.questionsWritten, []);
+    const after = await readFile(join(bundle, "constraints/dep-pin.md"), "utf8");
+    assert.equal(after, before, "an audited-but-unchanged concept must be untouched");
+  } finally {
+    await rm(dir, { recursive: true, force: true });
+  }
+});
+
+test("failing check: flip + evidence + blast radius (transitive) + questions, then a clean re-run", async () => {
+  const { dir, bundle } = await makeClinic({
+    "constraints/acme-cap.md": doc("constraint", "Acme cap", [
+      "status: active",
+      "happened_on: 2024-01-08",
+      "verify:",
+      "  method: check",
+      '  check: "echo the contract is gone >&2; exit 3"',
+    ], [STILL_TRUE, "# Notes\n\nHands off this section."]),
+    "decisions/deadline.md": doc("decision", "Deadline", [
+      "status: active",
+    ], ["# Why\n\nBecause of the cap.", "# Because of\n\n- [Acme cap](/constraints/acme-cap.md)"]),
+    // Reached transitively: retries ← deadline ← constraint.
+    "decisions/retries.md": doc("decision", "Retries", [
+      "status: active",
+    ], ["# Why\n\nBecause of the deadline.", "# Because of\n\n- [Deadline](/decisions/deadline.md)"]),
+    // Superseded — reached by the walk but not active, so no line, no question.
+    "decisions/old-timeout.md": doc("decision", "Old timeout", [
+      "status: superseded",
+    ], ["# Why\n\nGone.", "# Because of\n\n- [Acme cap](/constraints/acme-cap.md)", "# Superseded by\n\n- [Deadline](/decisions/deadline.md)"]),
+  });
+  try {
+    const decisionBefore = await readFile(join(bundle, "decisions/deadline.md"), "utf8");
+    const { code, report } = await auditJson(bundle, dir);
+    assert.equal(code, 1, "an expiry is the CI signal — exit 1");
+
+    assert.equal(report.checks[0].outcome, "failed");
+    assert.equal(report.checks[0].exitCode, 3);
+    assert.equal(report.checks[0].output, "the contract is gone");
+    assert.equal(report.expired.length, 1);
+    const expired = report.expired[0];
+    assert.equal(expired.concept, "constraints/acme-cap");
+    assert.equal(expired.method, "check");
+    assert.match(expired.expired_on, /^\d{4}-\d{2}-\d{2}$/);
+    assert.deepEqual(
+      expired.blastRadius.map((b: { decision: string; written: boolean }) => [b.decision, b.written]),
+      [["decisions/deadline", true], ["decisions/retries", true]],
+      "active decisions only, transitive, sorted",
+    );
+
+    // The constraint file: frontmatter flipped, evidence appended to
+    // `# Still true?`, every other section untouched.
+    const flipped = await readFile(join(bundle, "constraints/acme-cap.md"), "utf8");
+    assert.match(flipped, /status: expired/);
+    assert.match(flipped, new RegExp(`expired_on: ${expired.expired_on}`));
+    assert.match(flipped, /happened_on: 2024-01-08/, "unrelated frontmatter survives");
+    assert.ok(flipped.includes("Last confirmed manually."), "prior Still true? content survives");
+    assert.ok(flipped.includes("the verify check failed (exit 3)"), flipped);
+    assert.ok(flipped.includes("$ echo the contract is gone >&2; exit 3"), "evidence names the command");
+    assert.ok(flipped.includes("the contract is gone"), "evidence carries the output");
+    assert.ok(flipped.includes("# Notes\n\nHands off this section."), "other sections byte-identical");
+
+    // Untouched downstream decision file: byte preservation.
+    assert.equal(await readFile(join(bundle, "decisions/deadline.md"), "utf8"), decisionBefore);
+
+    // Generated questions link both ends of the pair.
+    assert.deepEqual(report.questionsWritten, [
+      "questions/is-deadline-still-needed.md",
+      "questions/is-retries-still-needed.md",
+    ]);
+    const question = await readFile(join(bundle, "questions/is-deadline-still-needed.md"), "utf8");
+    assert.ok(question.includes("(/constraints/acme-cap.md)"), question);
+    assert.ok(question.includes("(/decisions/deadline.md)"), question);
+    assert.match(question, /status: open/);
+
+    // Everything audit wrote lints clean (expired_on present, sections intact).
+    const lint = capture();
+    assert.equal(await main(["lint", "--bundle", bundle], dir, lint.io), 0, lint.out.join("\n"));
+
+    // Re-run: already expired — no re-flip, no duplicate questions, exit 0.
+    const rerun = await auditJson(bundle, dir);
+    assert.equal(rerun.code, 0, "an already-expired constraint is never double-flagged");
+    assert.deepEqual(rerun.report.expired, []);
+    assert.deepEqual(rerun.report.questionsWritten, []);
+    assert.deepEqual(rerun.report.alreadyExpired, [
+      {
+        concept: "constrai
[clipped: diff of test/audit.test.ts in a735c62 — showing 8000 of 19682 chars]
````

````diff
diff --git a/test/capture.test.ts b/test/capture.test.ts
new file mode 100644
index 0000000..723b29a
--- /dev/null
+++ b/test/capture.test.ts
@@ -0,0 +1,409 @@
+// `why capture` (DESIGN.md open problem #5): merge-time capture into
+// `.why/.drafts/`. All gh traffic goes through the injectable runner seam
+// (canned JSON fixtures) or a PATH-shimmed fixture `gh` for the CLI e2e —
+// no test hits the network. Also pins the served-bundle guarantee: drafts
+// never appear in bundle loads or `why blame` results.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
+import { existsSync } from "node:fs";
+import { mkdtemp } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import { basename, join } from "node:path";
+import { splitFrontmatter } from "@copperbox/okf-mcp";
+import { parseLineRange } from "../src/anchors.ts";
+import { loadBundle } from "../src/bundle.ts";
+import {
+  anchorsFromPatch,
+  CaptureError,
+  captureCommit,
+  capturePr,
+  DRAFTS_DIRNAME,
+  EVIDENCE_SUFFIX,
+  MAX_HUNK_ANCHORS_PER_FILE,
+  promoteDraft,
+  RATIONALE_TELL_RE,
+  slugify,
+} from "../src/capture.ts";
+import { main } from "../src/cli.ts";
+import { runCommand, type CommandRunner } from "../src/evidence.ts";
+import { scaffoldBundle } from "../src/init.ts";
+import { capture, git, makeRepo, write } from "./helpers.ts";
+
+// --- Fixtures ----------------------------------------------------------------
+
+const BASE_LOCK = Array.from({ length: 8 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
+// Replaces lines 3-4 with three new lines: the -U0 hunk is `+3,3` → span 3-5.
+const NEW_LOCK = ["line1", "line2", "new3", "new4", "new5", "line5", "line6", "line7", "line8"].join("\n") + "\n";
+
+/** A repo whose second commit is "the merged PR": edits lock.rs, adds queue.rs. */
+async function seedRepo(): Promise<{ repo: string; whyRoot: string; shas: string[] }> {
+  const repo = await makeRepo("why-capture-");
+  await write(repo, "src/lock.rs", BASE_LOCK);
+  git(repo, "add", "-A");
+  git(repo, "commit", "-qm", "add striped lock");
+  await write(repo, "src/lock.rs", NEW_LOCK);
+  await write(repo, "src/queue.rs", "struct Queue;\nimpl Queue {}\n");
+  git(repo, "add", "-A");
+  git(
+    repo,
+    "commit",
+    "-qm",
+    "replace striped locks with queue (#7)\n\nBecause the striped RwLock deadlocked under load.",
+  );
+  const whyRoot = await scaffoldBundle(repo);
+  const shas = git(repo, "rev-list", "--reverse", "HEAD").split("\n");
+  return { repo, whyRoot, shas };
+}
+
+function prFixture(mergeSha: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
+  return {
+    state: "MERGED",
+    title: "Replace striped locks with queue",
+    body: "Serializes shard access through a queue.\n\nAny scheme where correctness depends on lock ordering fails eventually.",
+    author: { login: "jane" },
+    url: "https://github.com/acme/harbor/pull/7",
+    mergedAt: "2026-07-02T09:00:00Z",
+    closedAt: "2026-07-02T09:00:00Z",
+    mergeCommit: { oid: mergeSha },
+    headRefOid: mergeSha,
+    comments: [
+      { author: { login: "alice" }, body: "Screenshot looks good.", createdAt: "2026-07-01T10:00:00Z" },
+      {
+        author: { login: "bob" },
+        body: "We chose the queue because ordering discipline never survives contributors.",
+        createdAt: "2026-07-01T11:00:00Z",
+      },
+    ],
+    reviews: [
+      { author: { login: "eve" }, body: "Approving — the tradeoff is worth it.", state: "APPROVED", submittedAt: "2026-07-02T08:00:00Z" },
+    ],
+    files: [{ path: "src/lock.rs" }, { path: "src/queue.rs" }],
+    ...overrides,
+  };
+}
+
+/** Answers gh from the fixture and `git remote` with a GitHub origin; git is real. */
+function fixtureRunner(pr: Record<string, unknown> | undefined): { runner: CommandRunner; calls: string[][] } {
+  const calls: string[][] = [];
+  const runner: CommandRunner = (cmd, args, cwd) => {
+    calls.push([cmd, ...args]);
+    if (cmd === "git" && args[0] === "remote") {
+      return { status: 0, stdout: "git@github.com:acme/harbor.git\n", stderr: "" };
+    }
+    if (cmd === "gh") {
+      if (pr === undefined) return { status: 127, stdout: "", stderr: "gh: command not found" };
+      return { status: 0, stdout: JSON.stringify(pr), stderr: "" };
+    }
+    return runCommand(cmd, args, cwd);
+  };
+  return { runner, calls };
+}
+
+async function readDraft(path: string): Promise<{ data: Record<string, unknown>; body: string }> {
+  const split = splitFrontmatter(await readFile(path, "utf8"));
+  assert.ok(split.data !== null, `draft at ${path} has unparseable frontmatter`);
+  return { data: split.data, body: split.body };
+}
+
+function whyOf(data: Record<string, unknown>): Record<string, unknown> {
+  assert.ok(typeof data.why === "object" && data.why !== null, "draft has no why map");
+  return data.why as Record<string, unknown>;
+}
+
+// --- Units ---------------------------------------------------------------------
+
+test("anchorsFromPatch: per-hunk spans, deletions anchor a line, deleted files skip, hunk floods collapse", () => {
+  const patch = [
+    "diff --git a/a.ts b/a.ts",
+    "index 111..222 100644",
+    "--- a/a.ts",
+    "+++ b/a.ts",
+    "@@ -3,2 +3,3 @@",
+    "-old",
+    "+new",
+    "@@ -10,2 +11,0 @@",
+    "-gone",
+    "-gone",
+    "diff --git a/gone.ts b/gone.ts",
+    "deleted file mode 100644",
+    "--- a/gone.ts",
+    "+++ /dev/null",
+    "@@ -1,4 +0,0 @@",
+    "diff --git a/many.ts b/many.ts",
+    ...Array.from({ length: MAX_HUNK_ANCHORS_PER_FILE + 1 }, (_, i) => `@@ -${i * 10 + 1},1 +${i * 10 + 1},1 @@`),
+    "diff --git a/bin.png b/bin.png",
+    "Binary files a/bin.png and b/bin.png differ",
+  ].join("\n");
+  const { anchors, files, notes } = anchorsFromPatch(patch, "abc123");
+  assert.deepEqual(files, ["a.ts", "bin.png", "gone.ts", "many.ts"]);
+  assert.deepEqual(anchors, [
+    { path: "a.ts", lines: "3-5", as_of: "abc123", state: "live" },
+    { path: "a.ts", lines: "11", as_of: "abc123", state: "live" },
+    { path: "bin.png", as_of: "abc123", state: "live" }, // no hunks: whole-file
+    { path: "many.ts", as_of: "abc123", state: "live" }, // collapsed, with a note
+  ]);
+  assert.ok(notes.some((n) => n.includes("gone.ts") && n.includes("deleted")), notes.join("; "));
+  assert.ok(notes.some((n) => n.includes("many.ts") && n.includes("whole-file")), notes.join("; "));
+  for (const anchor of anchors) {
+    if (anchor.lines !== undefined) assert.ok(parseLineRange(anchor.lines), `unparseable span ${anchor.lines}`);
+  }
+});
+
+test("rationale tells and slugs behave", () => {
+  assert.ok(RATIONALE_TELL_RE.test("We chose this because it works"));
+  assert.ok(!RATIONALE_TELL_RE.test("Screenshot looks good."));
+  assert.equal(slugify("Replace striped locks with queue (#7)"), "replace-striped-locks-with-queue-7");
+  assert.equal(slugify("!!!"), "");
+});
+
+// --- Draft generation: merged PR -----------------------------------------------
+
+test("merged PR → decision draft: verbatim quotes, PR + merge-commit citations, hunk anchors", async () => {
+  const { whyRoot, shas } = await seedRepo();
+  const mergeSha = shas[1]!;
+  const bundle = await loadBundle(whyRoot);
+  const { runner } = fixtureRunner(prFixture(mergeSha));
+  const result = await capturePr(bundle, 7, { runner });
+
+  assert.equal(result.type, "decision");
+  assert.equal(basename(result.draftPath), "pr-7-replace-striped-locks-with-queue.md");
+  assert.ok(result.draftPath.includes(`/${DRAFTS_DIRNAME}/`), result.draftPath);
+
+  const { data, body } = await readDraft(result.draftPath);
+  assert.equal(data.type, "decision");
+  assert.equal(data.title, "Replace striped locks with queue");
+  const why = whyOf(data);
+  assert.equal(why.status, "active");
+  assert.equal(why.happened_on, "2026-07-02");
+  assert.equal(why.confidence, "recorded");

[clipped: diff of test/capture.test.ts in a735c62 — showing 8000 of 19621 chars]
````

````diff
diff --git a/test/ci.test.ts b/test/ci.test.ts
new file mode 100644
index 0000000..01d3778
--- /dev/null
+++ b/test/ci.test.ts
@@ -0,0 +1,124 @@
+// Issue 403 acceptance: the CI recipes and the self-hosting switch. The
+// workflows under .github/workflows/ must be structurally valid GitHub
+// Actions files (the actionlint-equivalent check), reference only npm
+// scripts that exist, and appear verbatim in docs/ci.md so the doc and the
+// live workflows cannot drift. The repo's own .why/ bundle — the Decision
+// log converted into concepts — must lint clean and read healthy to doctor.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readdirSync, readFileSync } from "node:fs";
+import { join } from "node:path";
+import { fileURLToPath } from "node:url";
+import { parse } from "yaml";
+import { loadBundle } from "../src/bundle.ts";
+import { buildDoctorReport } from "../src/doctor.ts";
+import { lintBundle } from "../src/lint.ts";
+
+const root = fileURLToPath(new URL("..", import.meta.url));
+const read = (path: string) => readFileSync(join(root, path), "utf8");
+
+const WORKFLOWS_DIR = ".github/workflows";
+const EXPECTED_WORKFLOWS = ["why-pr-gate.yml", "why-audit.yml", "why-capture.yml"];
+
+function workflowFiles(): string[] {
+  return readdirSync(join(root, WORKFLOWS_DIR)).filter((f) => /\.ya?ml$/.test(f)).sort();
+}
+
+test("the three issue-403 workflows exist under .github/workflows/", () => {
+  const files = workflowFiles();
+  for (const expected of EXPECTED_WORKFLOWS) {
+    assert.ok(files.includes(expected), `${WORKFLOWS_DIR}/${expected} is missing (have: ${files.join(", ")})`);
+  }
+});
+
+test("every workflow is structurally valid GitHub Actions YAML", () => {
+  for (const file of workflowFiles()) {
+    const doc: unknown = parse(read(join(WORKFLOWS_DIR, file)));
+    assert.ok(doc !== null && typeof doc === "object", `${file}: not a YAML map`);
+    const workflow = doc as Record<string, unknown>;
+    assert.equal(typeof workflow.name, "string", `${file}: needs a name`);
+    // The yaml package reads YAML 1.2, so `on:` stays the string key "on".
+    const on = workflow.on as Record<string, unknown> | string | string[];
+    assert.ok(on !== undefined && on !== null, `${file}: needs an "on:" trigger`);
+    if (typeof on === "object" && !Array.isArray(on) && "schedule" in on) {
+      for (const entry of on.schedule as Array<{ cron?: string }>) {
+        assert.equal(typeof entry.cron, "string", `${file}: schedule entries need a cron string`);
+        assert.equal(entry.cron!.trim().split(/\s+/).length, 5, `${file}: cron "${entry.cron}" must have 5 fields`);
+      }
+    }
+    const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
+    assert.ok(jobs && typeof jobs === "object" && Object.keys(jobs).length > 0, `${file}: needs jobs`);
+    for (const [jobId, job] of Object.entries(jobs)) {
+      assert.equal(typeof job["runs-on"], "string", `${file}: job ${jobId} needs runs-on`);
+      const steps = job.steps as Array<Record<string, unknown>>;
+      assert.ok(Array.isArray(steps) && steps.length > 0, `${file}: job ${jobId} needs steps`);
+      for (const [i, step] of steps.entries()) {
+        assert.ok(
+          typeof step.uses === "string" || typeof step.run === "string",
+          `${file}: job ${jobId} step ${i} needs uses: or run:`,
+        );
+      }
+    }
+  }
+});
+
+/** Every `npm run <script>` (and `npm ci`) a workflow executes must exist. */
+test("workflows reference only npm scripts that exist", () => {
+  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
+  let checked = 0;
+  for (const file of workflowFiles()) {
+    for (const match of read(join(WORKFLOWS_DIR, file)).matchAll(/npm run\s+([^\n]*)/g)) {
+      // First non-flag token after `npm run` is the script name.
+      const script = match[1]!.split(/\s+/).find((token) => token !== "" && !token.startsWith("-"));
+      assert.ok(script !== undefined, `${file}: "npm run" with no script name`);
+      assert.ok(script in scripts, `${file}: npm script "${script}" is not in package.json`);
+      checked++;
+    }
+  }
+  assert.ok(checked > 0, "expected the workflows to run npm scripts");
+});
+
+test("docs/ci.md carries each live workflow verbatim, so the doc cannot drift", () => {
+  const doc = read("docs/ci.md");
+  for (const file of workflowFiles()) {
+    const content = read(join(WORKFLOWS_DIR, file)).trim();
+    assert.ok(doc.includes(content), `docs/ci.md: the fenced block for ${WORKFLOWS_DIR}/${file} is missing or drifted`);
+    assert.ok(doc.includes(file), `docs/ci.md: never names ${file}`);
+  }
+});
+
+// --- The self-hosted bundle -------------------------------------------------
+
+test("why lint passes on the repo's own .why/ bundle", async () => {
+  const bundle = await loadBundle(join(root, ".why"));
+  assert.ok(bundle.concepts.size >= 9, `expected the nine Decision log concepts, got ${bundle.concepts.size}`);
+  const findings = await lintBundle(bundle);
+  assert.deepEqual(findings, [], "lint findings on .why/");
+});
+
+test("why doctor reads the repo's own .why/ bundle as healthy", async () => {
+  const bundle = await loadBundle(join(root, ".why"));
+  const report = await buildDoctorReport(bundle);
+  assert.equal(report.sections.lostAnchors.count, 0, "lost anchors in .why/");
+  assert.equal(report.sections.lintErrors.count, 0, "lint errors in .why/");
+  assert.equal(report.healthy, true, "doctor says .why/ is unhealthy");
+});
+
+/** Spot-assert two former PLAN.md Decision log entries by slug (issue 403). */
+test("PLAN.md decision entries became recorded decision concepts", async () => {
+  const bundle = await loadBundle(join(root, ".why"));
+  for (const slug of ["decisions/okf-as-substrate", "decisions/escalation-circuit-breaker"]) {
+    const concept = bundle.concepts.get(slug);
+    assert.ok(concept !== undefined, `.why/ has no concept "${slug}"`);
+    assert.equal(concept.frontmatter.type, "decision", `${slug}: wrong type`);
+    assert.equal(concept.why.confidence, "recorded", `${slug}: Decision log entries are recorded rationale`);
+    assert.ok(concept.links.length + concept.body.length > 0, `${slug}: empty concept`);
+  }
+});
+
+test("PLAN.md's Decision log is retired in favor of the bundle", () => {
+  const plan = read("PLAN.md");
+  assert.ok(!/\*Confidence: recorded\.\*/.test(plan), "PLAN.md still carries inline decision entries");
+  assert.ok(plan.includes(".why/decisions"), "PLAN.md should point at .why/decisions/ for the decision log");
+});
````

````diff
diff --git a/test/cli.test.ts b/test/cli.test.ts
index b78d2e9..9dcc1c9 100644
--- a/test/cli.test.ts
+++ b/test/cli.test.ts
@@ -51,10 +51,10 @@ test("discovery finds a .why/ above a nested cwd", async () => {
   await mkdir(join(root, ".why/decisions"), { recursive: true });
   await mkdir(join(root, "src/deep"), { recursive: true });
   try {
-    const { io, err } = capture();
+    const { io, out } = capture();
     const code = await main(["audit"], join(root, "src/deep"), io);
-    assert.equal(code, 2);
-    assert.ok(err.join("\n").includes("why audit: not implemented"), err.join("\n"));
+    assert.equal(code, 0);
+    assert.ok(out.join("\n").includes("0 active constraints"), out.join("\n"));
   } finally {
     await rm(root, { recursive: true, force: true });
   }
````

````diff
diff --git a/test/skills.test.ts b/test/skills.test.ts
index 0ac36ac..f606fe5 100644
--- a/test/skills.test.ts
+++ b/test/skills.test.ts
@@ -1,5 +1,5 @@
-// The dig skills are prompt-docs, but their acceptance criteria are
-// mechanical: the confidence ladder must be verbatim DESIGN.md §2, the
+// The dig and capture skills are prompt-docs, but their acceptance criteria
+// are mechanical: the confidence ladder must be verbatim DESIGN.md §2, the
 // question-over-speculative rule must appear unweakened, and every tool the
 // prose tells an agent to run must actually exist at this point in the plan.
 // These tests pin all three so the docs can't drift from the contract.
@@ -13,15 +13,28 @@ import { fileURLToPath } from "node:url";
 const root = fileURLToPath(new URL("..", import.meta.url));
 const read = (path: string) => readFileSync(join(root, path), "utf8");
 
-const SKILL_PATHS = ["skills/dig/SKILL.md", "skills/dig-synthesize/SKILL.md"];
-const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md"];
+const SKILL_PATHS = [
+  "skills/dig/SKILL.md",
+  "skills/dig-synthesize/SKILL.md",
+  "skills/capture/SKILL.md",
+];
+const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md", "docs/capture.md", "docs/ci.md"];
 
-/** `why <sub>` may only name subcommands implemented by this point in PLAN.md
- * Phase 3 (audit is Phase 4; --episodes/--evidence are earlier Phase 3). */
-const IMPLEMENTED_SUBCOMMANDS = new Set(["init", "lint", "blame", "anchor", "doctor", "dig"]);
+/** `why <sub>` may only name subcommands implemented by this point in the
+ * plan (all of Phases 1–4 now: audit and capture are real). */
+const IMPLEMENTED_SUBCOMMANDS = new Set([
+  "init",
+  "lint",
+  "blame",
+  "anchor",
+  "doctor",
+  "dig",
+  "audit",
+  "capture",
+]);
 
-/** snake_case tokens in the docs that are schema fields or example symbols,
- * not okf-mcp tool names. */
+/** snake_case tokens in the docs that are schema fields, example symbols, or
+ * GitHub Actions vocabulary, not okf-mcp tool names. */
 const NON_TOOL_TOKENS = new Set([
   "happened_on",
   "expired_on",
@@ -30,6 +43,8 @@ const NON_TOOL_TOKENS = new Set([
   "okf_version",
   "retry_jitter",
   "acquire_shared",
+  "pull_request",
+  "workflow_dispatch",
 ]);
 
 /** Everything an agent would treat as runnable: fenced blocks + inline code. */
````
