# Evidence pack: pr-43

- commits: eab8a44
- files touched: .github/workflows/why-pr-gate.yml, .mcp.json, .why/decisions/anchors-are-written-from-main.md, .why/decisions/as-of-is-provenance.md, .why/decisions/as-of-must-be-an-ancestor.md, .why/decisions/edge-types-by-section-convention.md, .why/decisions/escalation-circuit-breaker.md, .why/decisions/issues-are-the-spec-surface.md, .why/decisions/namespaced-why-frontmatter.md, .why/decisions/orphaned-as-of-is-repaired.md, .why/decisions/serve-local-ui.md, .why/decisions/serve-syntax-highlighting.md, .why/decisions/symlink-safe-direct-run-guard.md, .why/decisions/ui-data-contract.md, .why/decisions/vscode-decoration-lanes.md, .why/decisions/vscode-extension-standalone.md, .why/log.md, CLAUDE.md, DESIGN.md, docs/capture.md, docs/ci.md, docs/digging.md, docs/future-improvements.md, docs/workflows.md, examples/harbor/attempts/striped-rwlock.md, examples/harbor/constraints/acme-45s-timeout.md, examples/harbor/decisions/47s-request-deadline.md, examples/harbor/decisions/queue-based-locking.md, examples/harbor/incidents/2024-03-lock-stall.md, HOWTO.md, okf.config.json, package-lock.json, package.json, README.md, skills/capture/SKILL.md, skills/dig-synthesize/SKILL.md, skills/dig/SKILL.md, src/audit.ts, src/blame.ts, src/bundle.ts, src/capture.ts, src/cli.ts, src/export.ts, src/impact.ts, src/init.ts, src/lint.ts, src/okf.ts, src/review.ts, src/workflow.ts, test/audit.test.ts, test/capture.test.ts, test/impact.test.ts, test/init.test.ts, test/review.test.ts, test/skills.test.ts, test/workflow.test.ts
- references: PR #43

## Commits

### commit eab8a44

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-08-18

why: add outcome-oriented workflows and impact reporting (#43)

* why: add outcome-oriented workflows

- Add bootstrap, maintain, review, and impact interfaces
- Document OKF v0.2 compatibility and workflow operations
- Surface decision impact in the PR gate

* why: update UI data contract anchor

- Adjust DESIGN.md line anchor to reflect the current document layout

## Pull requests

### PR #43 — why: add outcome-oriented workflows and impact reporting

by @dantheuber

## Summary

- Add `bootstrap`, `maintain`, `review`, and `impact` workflow interfaces.
- Add decision-impact summaries to the PR gate and GitHub job summary.
- Update OKF v0.2 compatibility, relative links, workflow documentation, and review metadata.
- Add workflow, impact, initialization, and review coverage.

## Testing

- `npm test`
- `npm run why -- lint`
- `npm run why -- impact "origin/main...HEAD"`
- Verify the PR gate emits the decision-impact summary.


## Diffs

### diff of commit eab8a44

````diff
diff --git a/.github/workflows/why-pr-gate.yml b/.github/workflows/why-pr-gate.yml
index ca0b477..9a3c501 100644
--- a/.github/workflows/why-pr-gate.yml
+++ b/.github/workflows/why-pr-gate.yml
@@ -26,3 +26,7 @@ jobs:
       - run: npm ci
       - run: npm run why -- lint
       - run: npm run why -- anchor --check --allow-drift
+      - name: decision impact summary
+        run: |
+          npm run --silent why -- impact "origin/${{ github.base_ref }}...HEAD" | tee why-impact.txt
+          cat why-impact.txt >> "$GITHUB_STEP_SUMMARY"
````

````diff
diff --git a/.mcp.json b/.mcp.json
index 8bba645..cebbd49 100644
--- a/.mcp.json
+++ b/.mcp.json
@@ -3,10 +3,8 @@
         "okf": {
             "command": "npx",
             "args": [
-                "-y", "@copperbox/okf-mcp",
-                "--bundle", "why=.why",
-                "--writable"
+                "-y", "@copperbox/okf-mcp@^1.3.0"
             ]
         }
     }
-}
\ No newline at end of file
+}
````

````diff
diff --git a/.why/decisions/anchors-are-written-from-main.md b/.why/decisions/anchors-are-written-from-main.md
index 7819cba..3bbcc03 100644
--- a/.why/decisions/anchors-are-written-from-main.md
+++ b/.why/decisions/anchors-are-written-from-main.md
@@ -29,7 +29,7 @@ why:
 
 The gate caused the bug it was meant to prevent. `why-pr-gate.yml` failed on any anchor drift, and its own comment said "run `why anchor` locally and commit the result" — but a contributor's HEAD is exactly what a squash merge discards. Following the instruction stamped an `as_of` that named nothing a day later. Both orphans in this bundle were created that way: `518bf47` by [1] (a `why anchor` run on `why-drafts`), and `44d4118` by [2]. Every `as_of` CI has ever written is a clean ancestor, because `why capture` already reads the merge commit from `main` — the one component doing this correctly was proof the approach works before it was generalized.
 
-So the gate was demanding the one thing that cannot be done correctly from a branch. Ancestry gating and the verified merge-base stamp ([as_of must be an ancestor](/decisions/as-of-must-be-an-ancestor.md)) contain the damage, but they cannot prevent it: when a branch *is* what changed a span — or when a file is *born* on the branch, as `.sandcastle/README.md` was — no surviving commit holds that span, so the only truthful stamp is a HEAD the squash then throws away. Running from `main` dissolves that case rather than mitigating it: the merge commit both exists and contains the code.
+So the gate was demanding the one thing that cannot be done correctly from a branch. Ancestry gating and the verified merge-base stamp ([as_of must be an ancestor](as-of-must-be-an-ancestor.md)) contain the damage, but they cannot prevent it: when a branch *is* what changed a span — or when a file is *born* on the branch, as `.sandcastle/README.md` was — no surviving commit holds that span, so the only truthful stamp is a HEAD the squash then throws away. Running from `main` dissolves that case rather than mitigating it: the merge commit both exists and contains the code.
 
 Squashing the `why-anchors` PR does not re-orphan anything, which is the crux and the natural objection. A squash rewrites *commits*; the `as_of` **values** inside the files name `main` commits and survive the squash as ordinary content.
````

````diff
diff --git a/.why/decisions/as-of-is-provenance.md b/.why/decisions/as-of-is-provenance.md
index db54f77..61d2eeb 100644
--- a/.why/decisions/as-of-is-provenance.md
+++ b/.why/decisions/as-of-is-provenance.md
@@ -28,7 +28,7 @@ commit. An `as_of` that is a non-ancestor (or does not resolve) carries no
 such meaning, and "never re-stamp a stable anchor" does not extend to it:
 `why anchor` repairs such an orphan when the claim re-verifies at HEAD without
 reading `as_of` — see
-[orphaned as_of is repaired](/decisions/orphaned-as-of-is-repaired.md). That
+[orphaned as_of is repaired](orphaned-as-of-is-repaired.md). That
 repair is what makes the `not-ancestor` finding this decision kept genuinely
 actionable.
````

````diff
diff --git a/.why/decisions/as-of-must-be-an-ancestor.md b/.why/decisions/as-of-must-be-an-ancestor.md
index ec300db..41f8546 100644
--- a/.why/decisions/as-of-must-be-an-ancestor.md
+++ b/.why/decisions/as-of-must-be-an-ancestor.md
@@ -50,7 +50,7 @@ Two findings forced this design, both measured rather than reasoned:
 
 **Why `unverified` rather than `lost`.** Path and symbol resolution are stronger evidence about where code lives than `as_of` ever was. Downgrading a live, path-confirmed anchor to `lost` because its provenance is unreadable asserts *below* the evidence — the mirror of the sin the ladder forbids — and false `lost` is how a health report gets ignored, which is the product.
 
-Migration: eleven anchors carried a non-ancestor `as_of`. Eight were re-stamped to `0f75578` only after verifying the claim there (path present, or the line span byte-identical to HEAD). Three anchoring `.sandcastle/README.md` were left at `44d4118`: that file was born on `release-prep`, so no surviving commit contained it at the time and there was no honest `as_of` to move them to. Leaving them was sound; leaving them *permanently* was not — after the squash they would flag `not-ancestor` yellow with nothing able to clear it (a whole-file anchor resolves by path at HEAD and never consults `as_of`, so re-anchoring walks past it). [orphaned as_of is repaired](/decisions/orphaned-as-of-is-repaired.md) closes that gap: the post-merge run on `main` re-stamps them to the squash commit, which does contain the file. [as_of is provenance](/decisions/as-of-is-provenance.md) still holds for what it protects — a stable anchor's clean-ancestor `as_of` is never re-stamped.
+Migration: eleven anchors carried a non-ancestor `as_of`. Eight were re-stamped to `0f75578` only after verifying the claim there (path present, or the line span byte-identical to HEAD). Three anchoring `.sandcastle/README.md` were left at `44d4118`: that file was born on `release-prep`, so no surviving commit contained it at the time and there was no honest `as_of` to move them to. Leaving them was sound; leaving them *permanently* was not — after the squash they would flag `not-ancestor` yellow with nothing able to clear it (a whole-file anchor resolves by path at HEAD and never consults `as_of`, so re-anchoring walks past it). [orphaned as_of is repaired](orphaned-as-of-is-repaired.md) closes that gap: the post-merge run on `main` re-stamps them to the squash commit, which does contain the file. [as_of is provenance](as-of-is-provenance.md) still holds for what it protects — a stable anchor's clean-ancestor `as_of` is never re-stamped.
 
 # Citations
````

````diff
diff --git a/.why/decisions/edge-types-by-section-convention.md b/.why/decisions/edge-types-by-section-convention.md
index d08c5ca..75fdde9 100644
--- a/.why/decisions/edge-types-by-section-convention.md
+++ b/.why/decisions/edge-types-by-section-convention.md
@@ -24,7 +24,7 @@ Recorded at project bootstrap [1]: section conventions keep bundles valid OKF an
 
 # Because of
 
-- [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md)
+- [OKF/okf-mcp as the substrate](okf-as-substrate.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/escalation-circuit-breaker.md b/.why/decisions/escalation-circuit-breaker.md
index 98688a5..6c824cc 100644
--- a/.why/decisions/escalation-circuit-breaker.md
+++ b/.why/decisions/escalation-circuit-breaker.md
@@ -25,7 +25,7 @@ Recorded at decision time [1]: rewriting a failing spec is the one act the pipel
 
 # Because of
 
-- [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md)
+- [Autonomous build via Sandcastle + gatekeeper](autonomous-build-via-sandcastle.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/issues-are-the-spec-surface.md b/.why/decisions/issues-are-the-spec-surface.md
index cc11624..bb10a12 100644
--- a/.why/decisions/issues-are-the-spec-surface.md
+++ b/.why/decisions/issues-are-the-spec-surface.md
@@ -25,7 +25,7 @@ Recorded at project bootstrap [1]: the pipeline's implementers and the gate both
 
 # Because of
 
-- [Autonomous build via Sandcastle + gatekeeper](/decisions/autonomous-build-via-sandcastle.md)
+- [Autonomous build via Sandcastle + gatekeeper](autonomous-build-via-sandcastle.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/namespaced-why-frontmatter.md b/.why/decisions/namespaced-why-frontmatter.md
index 945e7f4..53e9b6d 100644
--- a/.why/decisions/namespaced-why-frontmatter.md
+++ b/.why/decisions/namespaced-why-frontmatter.md
@@ -24,7 +24,7 @@ Recorded at project bootstrap [1]: one namespaced key is collision-proof against
 
 # Because of
 
-- [OKF/okf-mcp as the substrate](/decisions/okf-as-substrate.md)
+- [OKF/okf-mcp as the substrate](okf-as-substrate.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/orphaned-as-of-is-repaired.md b/.why/decisions/orphaned-as-of-is-repaired.md
index cc6cd67..eecf80e 100644
--- a/.why/decisions/orphaned-as-of-is-repaired.md
+++ b/.why/decisions/orphaned-as-of-is-repaired.md
@@ -30,9 +30,9 @@ A bare `path + lines` claim with an unreadable `as_of` is untouched: nothing ver
 
 # Why
 
-[as_of must be an ancestor](/decisions/as-of-must-be-an-ancestor.md) fixed the *reading* half of the squash-orphan problem and deliberately left three anchors on `.sandcastle/README.md` at `44d4118` — a branch commit no surviving commit could replace at the time. Measured after simulating that squash: `why doctor` flagged all three `not-ancestor` yellow, and **nothing could clear them**. A whole-file anchor resolves by path at HEAD and never consults `as_of`, so it classifies `current` and write-mode `why anchor` walks straight past it; the post-merge `why-anchor` job re-stamps only drift, so it walked past too.
+[as_of must be an ancestor](as-of-must-be-an-ancestor.md) fixed the *reading* half of the squash-orphan problem and deliberately left three anchors on `.sandcastle/README.md` at `44d4118` — a branch commit no surviving commit could replace at the time. Measured after simulating that squash: `why doctor` flagged all three `not-ancestor` yellow, and **nothing could clear them**. A whole-file anchor resolves by path at HEAD and never consults `as_of`, so it classifies `current` and write-mode `why anchor` walks straight past it; the post-merge `why-anchor` job re-stamps only drift, so it walked past too.
 
-That is the exact pathology [as_of is provenance](/decisions/as-of-is-provenance.md) was written to kill — un-clearable yellows draining the signal from the whole report — recreated three anchors at a time. That decision kept `not-ancestor` on the explicit grounds that it is "genuinely actionable"; nothing had yet made it actionable. Repair does, and it *completes* the provenance rule rather than overriding it: a clean-ancestor `as_of` means the span survived unchanged since that commit and is still never rewritten, while an orphaned `as_of` means nothing any clone of the integration branch can read — there is no provenance left to preserve. The provenance decision's scope was amended to say so.
+That is the exact pathology [as_of is provenance](as-of-is-provenance.md) was written to kill — un-clearable yellows draining the signal from the whole report — recreated three anchors at a time. That decision kept `not-ancestor` on the explicit grounds that it is "genuinely actionable"; nothing had yet made it actionable. Repair does, and it *completes* the provenance rule rather than overriding it: a clean-ancestor `as_of` means the span survived unchanged since that commit and is still never rewritten, while an orphaned `as_of` means nothing any clone of the integration branch can read — there is no provenance left to preserve. The provenance decision's scope was amended to say so.
 
 Two honesty gates, both covered by tests:
````

````diff
diff --git a/.why/decisions/serve-local-ui.md b/.why/decisions/serve-local-ui.md
index f100e53..1d59788 100644
--- a/.why/decisions/serve-local-ui.md
+++ b/.why/decisions/serve-local-ui.md
@@ -39,8 +39,8 @@ Recorded in the PR's "What & why" and DESIGN.md §8, amended in the same diff [1
 
 # Because of
 
-- [The UI ⇄ backend boundary is a versioned JSON data contract](/decisions/ui-data-contract.md)
-- [`why blame` warns on every expired constraint](/decisions/blame-warns-on-every-expired-constraint.md)
+- [The UI ⇄ backend boundary is a versioned JSON data contract](ui-data-contract.md)
+- [`why blame` warns on every expired constraint](blame-warns-on-every-expired-constraint.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/serve-syntax-highlighting.md b/.why/decisions/serve-syntax-highlighting.md
index 080c2cb..4098128 100644
--- a/.why/decisions/serve-syntax-highlighting.md
+++ b/.why/decisions/serve-syntax-highlighting.md
@@ -38,7 +38,7 @@ Recorded in the module's own header at the time [2]. Two reasons fix its shape.
 
 # Because of
 
-- [The UI ⇄ backend boundary is a versioned JSON data contract](/decisions/ui-data-contract.md)
+- [The UI ⇄ backend boundary is a versioned JSON data contract](ui-data-contract.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/symlink-safe-direct-run-guard.md b/.why/decisions/symlink-safe-direct-run-guard.md
index 23fa72e..543f251 100644
--- a/.why/decisions/symlink-safe-direct-run-guard.md
+++ b/.why/decisions/symlink-safe-direct-run-guard.md
@@ -34,7 +34,7 @@ Recorded in the guard's own comment and the regression test at the time [2]. `im
 
 # Because of
 
-- [The VS Code extension is a standalone package that shells out to the CLI](/decisions/vscode-extension-standalone.md)
+- [The VS Code extension is a standalone package that shells out to the CLI](vscode-extension-standalone.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/ui-data-contract.md b/.why/decisions/ui-data-contract.md
index c988c26..3bf2437 100644
--- a/.why/decisions/ui-data-contract.md
+++ b/.why/decisions/ui-data-contract.md
@@ -16,7 +16,7 @@ why:
   confidence: recorded
   anchors:
     - path: DESIGN.md
-      lines: 193
+      lines: 194
       as_of: fa87a3b
       state: live
     - path: docs/ui-contract.md
@@ -49,7 +49,7 @@ Recorded in the PR's "What & why" [1]. A stable, versioned contract lets the UIs
 
 # Because of
 
-- [Consumption before archaeology](/decisions/consumption-before-archaeology.md)
+- [Consumption before archaeology](consumption-before-archaeology.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/vscode-decoration-lanes.md b/.why/decisions/vscode-decoration-lanes.md
index 2545b31..c5a3859 100644
--- a/.why/decisions/vscode-decoration-lanes.md
+++ b/.why/decisions/vscode-decoration-lanes.md
@@ -51,7 +51,7 @@ The shape follows from that. The lanes are separate decoration types because a s
 
 # Because of
 
-- [The VS Code extension is a standalone package that shells out to the CLI](/decisions/vscode-extension-standalone.md)
+- [The VS Code extension is a standalone package that shells out to the CLI](vscode-extension-standalone.md)
 
 # Citations
````

````diff
diff --git a/.why/decisions/vscode-extension-standalone.md b/.why/decisions/vscode-extension-standalone.md
index 5dcfa6e..869366d 100644
--- a/.why/decisions/vscode-extension-standalone.md
+++ b/.why/decisions/vscode-extension-standalone.md
@@ -44,7 +44,7 @@ Recorded in the PR's "What & why" and DESIGN.md §8 [1][2]. Like `serve`, the ex
 
 # Because of
 
-- [The UI ⇄ backend boundary is a versioned JSON data contract](/decisions/ui-data-contract.md)
+- [The UI ⇄ backend boundary is a versioned JSON data contract](ui-data-contract.md)
 
 # Citations
````

````diff
diff --git a/.why/log.md b/.why/log.md
index d12494f..885f25d 100644
--- a/.why/log.md
+++ b/.why/log.md
@@ -1,5 +1,8 @@
 # Update Log
 
+## 2026-08-17
+* Repair sweep (okf-mcp repair): absolute-links-to-relative (14 files)
+
 ## 2026-07-15
 * re-point anchor: repairStamp renamed to repairOrphan (call-site const made the symbol ambiguous to the grep resolver)
 * retitle: drop brackets from title so the generated index bullet stays lintable (W001)
````

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 5382bb9..5f2b6f8 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -4,7 +4,7 @@ Decision archaeology for codebases: recover the *why* behind code from git/PR/is
 
 ## Session start
 
-1. `why` is built and shipping — all ten subcommands, both viewers, and the three
+1. `why` is built and shipping — the outcome and lower-level commands, both viewers, and the three
    CI recipes are live. Work now arrives as GitHub issues and as open `question`
    concepts in [.why/](.why/index.md).
 2. **The project's decision memory *is* the `.why/` bundle.** Consult it before
````

````diff
diff --git a/DESIGN.md b/DESIGN.md
index 5579933..a6b1f85 100644
--- a/DESIGN.md
+++ b/DESIGN.md
@@ -2,7 +2,7 @@
 
 This is the source of truth for the knowledge schema and the three tools built on it. When implementation and this document disagree, one of them is a bug; fix whichever is wrong and record the decision as a `decision` concept in [.why/](.why/index.md).
 
-`why` is a schema and toolset **on top of** OKF v0.1 — every bundle is a valid OKF bundle first, and everything `why`-specific lives in (a) the `why:` frontmatter extension map, (b) link-section conventions, and (c) external tooling. A plain okf-mcp server can serve a `why` bundle with zero changes; `why`'s own tools add the semantics.
+`why` is a schema and toolset **on top of** OKF v0.2 (with v0.1 read/write compatibility) — every bundle is a valid OKF bundle first, and everything `why`-specific lives in (a) the `why:` frontmatter extension map, (b) link-section conventions, and (c) external tooling. A plain okf-mcp server can serve a `why` bundle with zero changes; `why`'s own tools add the semantics.
 
 ## 1. The bundle
 
@@ -19,11 +19,11 @@ Lives at `.why/` in the target repo (default; configurable to a sibling repo for
 └── questions/<slug>.md
 ```
 
-Folder = concept type, one idea per file, slugs are short and kebab-case (`queue-based-locking.md`, not `decision-to-switch-to-queue-based-locking-2024.md`). Links are bundle-absolute (`/constraints/acme-45s-timeout.md`).
+Folder = concept type, one idea per file, slugs are short and kebab-case (`queue-based-locking.md`, not `decision-to-switch-to-queue-based-locking-2024.md`). Links are document-relative (`../constraints/acme-45s-timeout.md`) so published subdirectory bundles remain portable.
 
 ## 2. Frontmatter
 
-Standard OKF keys (`type`, `title`, `description`, `tags`, `timestamp`) plus one extension map, `why:`. Namespacing everything under one key keeps us collision-proof against future OKF versions; OKF preserves unknown keys, so plain okf-mcp round-trips it byte-for-byte.
+Standard OKF keys (`type`, `title`, `description`, `tags`, `generated`, `sources`, `verified`, `stale_after`) plus one extension map, `why:`. Namespacing everything under one key keeps us collision-proof against future OKF versions; OKF preserves unknown keys, so plain okf-mcp round-trips it byte-for-byte. Legacy v0.1 `timestamp` and `# Citations` remain readable.
 
 ```yaml
 ---
@@ -31,10 +31,15 @@ type: decision
 title: Queue-based locking
 description: Serialize shard access through a queue instead of striped RwLocks.
 tags: [locking, concurrency]
-timestamp: 2026-07-11        # when this concept was last written — OKF-standard
+generated:                   # when/by whom this concept was last written
+  by: human:maintainer
+  at: 2026-07-11T00:00:00Z
 why:
   status: active             # see per-type status vocab below
   happened_on: 2024-03-14    # when the decision/incident/attempt happened
+  owner: "@platform"          # optional editorial owner
+  captured_on: 2026-07-11    # optional: when it entered the review queue
+  review_by: 2026-07-25      # optional editorial deadline
   confidence: corroborated   # recorded | corroborated | inferred | speculative
   anchors:
     - path: src/lock.rs
@@ -56,6 +61,9 @@ why:
 | `anchors` | ✓ | optional | optional | optional | ✓ |
 | `verify` | — | ✓ (see §5) | — | — | — |
 | `expired_on` | — | ✓ when expired | — | — | — |
+| `owner` | optional | optional | optional | optional | optional |
+| `captured_on` | optional | optional | optional | optional | optional |
+| `review_by` | optional | optional | optional | optional | optional |
 
 ### The confidence ladder
 
@@ -86,12 +94,12 @@ the reasoning. Written for the engineer who just ran `why blame` on this code.
 
 # Because of
 
-- [2024-03 lock stall](/incidents/2024-03-lock-stall.md)
-- [Acme 45s gateway timeout](/constraints/acme-45s-timeout.md)
+- [2024-03 lock stall](../incidents/2024-03-lock-stall.md)
+- [Acme 45s gateway timeout](../constraints/acme-45s-timeout.md)
 
 # Instead of
 
-- [Striped RwLock](/attempts/striped-rwlock.md) — deadlocked under load
+- [Striped RwLock](../attempts/striped-rwlock.md) — deadlocked under load
 
 # Citations
 
@@ -187,10 +195,26 @@ Priority order for a cold-start dig (usefulness per token): tells first, then th
 
 Same data over MCP: agents mount the bundle via okf-mcp and get story-of-this-code by `search_concepts` with a `resource`/anchor filter. If that proves clumsy in practice, Phase 5 considers a thin `why-mcp` wrapper exposing `blame` as a first-class tool; default is to not build it.
 
+### Outcome-oriented interfaces
+
+- `why bootstrap` composes episode extraction and evidence assembly into one
+  atomic cold-start workspace and an ordered agent handoff. It does not call an
+  LLM: rationale reconstruction remains the explicit judgment seam.
+- `why maintain` composes lint, anchor writes, audit, doctor, and inbox summary
+  on the integration branch.
+- `why review` is the consolidated editorial queue for drafts, open questions,
+  ownership/deadlines, and maintenance findings; it also exposes lint-gated
+  promotion.
+- `why impact [<git-range>]` maps a diff to exact-hunk and same-file concepts,
+  then reports only expired constraints causally upstream of those concepts.
+
+Their contracts and operational behavior are specified in
+[docs/workflows.md](docs/workflows.md).
+
 ## 8. Implementation shape
 
 - **Language:** TypeScript (Node), matching okf-mcp; depends on okf-mcp as a library where possible rather than shelling out.
-- **CLI:** `why dig | anchor | audit | blame | capture | lint | doctor | export | init | serve`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` (open problem #5's pipeline) drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
+- **CLI:** outcome interfaces are `why bootstrap | maintain | review | impact`; lower-level interfaces are `why dig | anchor | audit | blame | capture | lint | doctor | export`, plus `init | serve`. `why init` scaffolds `.why/`, writes the root `index.md` frontmatter, and drops a CLAUDE.md snippet teaching resident agents to consult and maintain the bundle. `why capture` drafts a concept from a merged PR into `.why/.drafts/` — a dot-directory, so drafts never serve — and lint-gates promotion out of it. `why export` (with `why blame --json`) emits the versioned UI data contract — story, coverage, graph — that every presentation layer renders from without re-deriving semantics ([docs/ui-contract.md](docs/ui-contract.md)).
 - **UI surfaces:** two, both dumb renderers of the contract payloads with zero engine logic of their own. `why serve` is a read-only, localhost-only viewer (blame gutter, story panel, graph) whose endpoints wrap the same library calls the CLI uses; the `vscode-why/` extension shells out to the `why` CLI and renders coverage decorations, hovers, and story webviews from the same JSON. If either surface needs data the contract lacks, the contract is extended first.
 - **Agent integration:** dig/audit agent prompts ship as Claude Code skills in `skills/`; the CLI's `--episodes`/`--evidence` subcommands are the deterministic tools those skills call.
 - **No daemon.** No resident process is ever required: the pipeline is run-to-completion commands suitable for CI (`why anchor --check` and `why lint` as PR gates; `why audit` weekly). `why serve` is the one deliberate exception — an optional, foreground, localhost-only viewer the user starts and stops by hand; nothing in the pipeline depends on it.
@@ -203,4 +227,4 @@ Tra
[clipped: diff of DESIGN.md in eab8a44 — showing 8000 of 9461 chars]
````

````diff
diff --git a/HOWTO.md b/HOWTO.md
index cc23f11..aab663d 100644
--- a/HOWTO.md
+++ b/HOWTO.md
@@ -75,33 +75,32 @@ archive self-maintaining once agents are in the loop.
 Commit the empty bundle. You now have a valid OKF bundle; everything else adds
 content and keeps it honest.
 
-### 2.2 Cold-start dig — recover the *why* that already exists
+### 2.2 Cold-start bootstrap — recover the *why* that already exists
 
-Nobody hand-writes retroactive ADRs, so `why dig` reconstructs a first bundle
-from history. It's an agent-driven, judgment-heavy pass — **run it
-deliberately, not in CI**. The full runbook is [docs/digging.md](docs/digging.md);
-the shape:
+Nobody hand-writes retroactive ADRs, so `why bootstrap` prepares the complete
+deterministic cold-start workspace and an ordered agent handoff. It is an
+agent-driven, judgment-heavy pass — **run it deliberately, not in CI**:
 
 ```bash
-# 1. deterministic: cluster history into episodes, flag high-value "tells"
-npx -y @copperbox/why dig --episodes --out episodes.json
-
-# 2. deterministic + gh: build one evidence pack per episode
-npx -y @copperbox/why dig --evidence episodes.json --evidence-dir ./exports
+npx -y @copperbox/why bootstrap --evidence-dir ./exports
 ```
 
-Then, per episode, run an agent on the **`skills/dig`** skill with the pack as
+Follow the generated `HANDOFF.md`: per episode, run an agent on the **`skills/dig`** skill with the pack as
 input (reconstruct concepts, cite everything, confidence never above the
 evidence, prefer a `question` over a guess), and once per batch run
 **`skills/dig-synthesize`** (merge duplicates, connect supersede chains,
-promote recurring themes to constraints). Finish with:
+promote recurring themes to constraints). Finish with the composed maintenance
+loop and inspect its queue:
 
 ```bash
-npx -y @copperbox/why anchor      # resolve every new concept's anchors to HEAD
-npx -y @copperbox/why lint        # schema clean
-npx -y @copperbox/why doctor      # health report
+npx -y @copperbox/why maintain
+npx -y @copperbox/why review
 ```
 
+The lower-level `why dig --episodes` and `why dig --evidence` commands remain
+available when you need to control the stages independently; see
+[docs/digging.md](docs/digging.md).
+
 **Priority order for the first dig — usefulness per token:** the *tells* first
 (reverts, fix-after-fix chains, sudden churn on long-quiet files, `HACK` /
 `workaround` / `for now` comments), then your most-blamed hot files, then
@@ -306,7 +305,7 @@ Same data, four surfaces — pick per moment:
   mount it with okf-mcp:
 
   ```bash
-  npx -y @copperbox/okf-mcp --bundle <your-repo>=.why inspect
+  npx -y @copperbox/okf-mcp@^1.3.0 inspect
   ```
 
 ---
@@ -316,6 +315,10 @@ Same data, four surfaces — pick per moment:
 | Command | What it does | Runs as |
 |---|---|---|
 | `why init [--capture-snippet]` | scaffold `.why/`, teach `CLAUDE.md` | once |
+| `why bootstrap [--full]` | prepare episodes, evidence packs, and agent handoff | deliberate |
+| `why maintain` | lint, re-anchor, audit, health-check, summarize inbox | integration branch / scheduled |
+| `why review [--promote <draft>]` | consolidated editorial queue and promotion | weekly / editorial |
+| `why impact [<git-range>]` | decisions and expired upstream constraints affected by a diff | before review |
 | `why dig --episodes` / `--evidence` | deterministic archaeology inputs | deliberate |
 | `why anchor [--check] [--concept <id>]` | re-resolve anchors to HEAD (`--check` = CI, writes nothing) | pre-commit / PR gate |
 | `why lint [--json]` | schema conformance, exit 1 on error | PR gate |
````

````diff
diff --git a/README.md b/README.md
index 4205105..36bf872 100644
--- a/README.md
+++ b/README.md
@@ -50,7 +50,7 @@ Three layers, deliberately separable:
 └──────────────────────────────────────────────────────────────┘
 ```
 
-The bundle is the center of gravity, and it is **not a new format**: it's [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) markdown served by [okf-mcp](../okf-mcp). `why` adds a schema on top (concept types, a `why:` frontmatter extension, link-section conventions) plus the tooling OKF deliberately doesn't provide: code anchoring, constraint auditing, and the archaeology pipeline. See [DESIGN.md](DESIGN.md) for the full schema.
+The bundle is the center of gravity, and it is **not a new format**: it's [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) markdown served by [okf-mcp](../okf-mcp). `why` also reads existing v0.1 archives. It adds a schema on top (concept types, a `why:` frontmatter extension, link-section conventions) plus the tooling OKF deliberately doesn't provide: code anchoring, constraint auditing, and the archaeology pipeline. See [DESIGN.md](DESIGN.md) for the full schema.
 
 ## The knowledge model, in one table
 
@@ -62,7 +62,7 @@ The bundle is the center of gravity, and it is **not a new format**: it's [OKF v
 | `incident` | A production event that forced change | "What did we learn the hard way?" |
 | `question` | A why the archaeology could not recover | "What don't we know?" |
 
-Links between concepts are ordinary markdown links; the section a link sits in (`# Because of`, `# Instead of`, `# Superseded by`) gives the edge its meaning. Evidence is spec-standard `# Citations` — commit SHAs, PR and issue URLs — so every claim is checkable.
+Links between concepts are ordinary relative markdown links; the section a link sits in (`# Because of`, `# Instead of`, `# Superseded by`) gives the edge its meaning. Evidence uses OKF v0.2 `sources` with footnote attribution (and reads legacy v0.1 `# Citations`), so every claim is checkable.
 
 Two properties are non-negotiable and shape everything:
 
@@ -129,26 +129,32 @@ the exact workflows documented in [docs/ci.md](docs/ci.md), active under
 [`.github/workflows/`](.github/workflows). Browse it like any bundle:
 
 ```bash
-npx -y @copperbox/okf-mcp --bundle why=.why inspect
+npx -y @copperbox/okf-mcp@^1.3.0 inspect
 ```
 
 ## Getting started
 
-All ten subcommands ship, the four CI recipes run on this repo's own `.why/`
-bundle, and both viewers (`why serve` and the VS Code extension) render live.
+The full CLI, four CI recipes, and both viewers (`why serve` and the VS Code
+extension) ship. Routine use goes through four outcome-oriented workflows;
+the lower-level commands remain available for CI and debugging.
 **[HOWTO.md](HOWTO.md) is the adoption guide** — scaffold a bundle, cold-start
 a dig, wire up the PR gate / re-anchor / weekly audit / post-merge capture jobs, and the
 team habits that make it pay off.
 
 ```bash
 npx -y @copperbox/why init --capture-snippet   # scaffold .why/ + teach CLAUDE.md
+npx -y @copperbox/why bootstrap                # prepare cold-start evidence + agent handoff
+npx -y @copperbox/why impact origin/main...HEAD # decisions affected by a change
+npx -y @copperbox/why maintain                 # anchor + audit + health + inbox
+npx -y @copperbox/why review                   # drafts, questions, and maintenance debt
 npx -y @copperbox/why blame <path>[:line]      # read the story of a span
 npx -y @copperbox/why doctor                   # archive health at a glance
 ```
 
-The ten subcommands — `dig · anchor · audit · blame · capture · lint · doctor ·
-export · init · serve` — are specified in [DESIGN.md §8](DESIGN.md#8-implementation-shape),
-and each operational recipe has a page under [`docs/`](docs).
+The workflow interfaces are documented in [docs/workflows.md](docs/workflows.md).
+The lower-level `dig · anchor · audit · blame · capture · lint · doctor · export`
+commands and the `init · serve` surfaces are specified in
+[DESIGN.md §8](DESIGN.md#8-implementation-shape).
 
 ## Project map
````

````diff
diff --git a/docs/capture.md b/docs/capture.md
index 886252a..f602273 100644
--- a/docs/capture.md
+++ b/docs/capture.md
@@ -38,6 +38,9 @@ why capture --commit a3f9c2e  # fallback: from a local commit, no gh needed
   closed without merging → `attempt` (status `abandoned`); a still-open PR is
   refused — capture records outcomes.
 - **`happened_on`** comes from the merge/close time.
+- **Review pressure** is explicit: `owner` is the PR author, `captured_on` is
+  the capture date, and `review_by` defaults to fourteen days later. `why
+  review` uses these fields for its consolidated inbox.
 - **Anchors come from the merge diff's hunks**: one anchor per hunk's
   new-side span (zero-context, exact to the changed lines), `as_of` the merge
   commit, `state: live`. A file with many hunks collapses to one whole-file
@@ -75,7 +78,7 @@ why capture --promote pr-212-replace-striped-locks.md
 ```
 
 The draft is written into the type directory named by its frontmatter
-(`decisions/`, `attempts/`, …) via okf-mcp — which stamps `timestamp` and
+(`decisions/`, `attempts/`, …) via okf-mcp — which stamps version-appropriate generation provenance and
 normalizes citations — and the bundle is linted. Any error-severity finding
 on the new file rolls the write back and keeps the draft, printing the
 findings; warnings and findings elsewhere in the bundle never block. On
````

````diff
diff --git a/docs/ci.md b/docs/ci.md
index 7b08e6c..378909e 100644
--- a/docs/ci.md
+++ b/docs/ci.md
@@ -23,7 +23,7 @@ package. In a repo that consumes `why` as a dependency, replace
 `npm ci` + `npm run why -- …` with `npx -y @copperbox/why …` and drop the
 Node setup to taste; everything else transfers unchanged.
 
-## The PR gate: `why lint` + `why anchor --check --allow-drift`
+## The PR gate: lint, anchor safety, and decision impact
 
 `why lint` fails on schema errors (missing required sections, bad edge
 targets, confidence claims without citations).
@@ -45,6 +45,11 @@ Use plain `why anchor --check` (no `--allow-drift`) when you want the strict
 question — "is this bundle fully up to date with this commit?" — which is the
 right check on `main`, not on a PR.
 
+Finally, `why impact origin/<base>...HEAD` writes the affected concepts and
+their expired upstream constraints into the GitHub job summary. It is
+informational rather than a new merge gate: the purpose is to put relevant
+rationale directly in the review path.
+
 `.github/workflows/why-pr-gate.yml`:
 
 ```yaml
@@ -76,6 +81,10 @@ jobs:
       - run: npm ci
       - run: npm run why -- lint
       - run: npm run why -- anchor --check --allow-drift
+      - name: decision impact summary
+        run: |
+          npm run --silent why -- impact "origin/${{ github.base_ref }}...HEAD" | tee why-impact.txt
+          cat why-impact.txt >> "$GITHUB_STEP_SUMMARY"
 ```
 
 ## Post-merge re-anchoring: `why anchor` from `main`
````

````diff
diff --git a/docs/digging.md b/docs/digging.md
index 0a0cb6c..97794e3 100644
--- a/docs/digging.md
+++ b/docs/digging.md
@@ -4,6 +4,12 @@ The end-to-end sequence for recovering a `.why/` bundle from history
 (DESIGN.md §6). Judgment lives in agent prompts; everything deterministic
 lives in the CLI:
 
+For normal use, `why bootstrap [--evidence-dir <exports>]` performs steps 1–2
+for the incremental range and writes an ordered `HANDOFF.md`; after completing
+that handoff, `why maintain` performs step 5 plus lint, audit, health, and inbox
+checks. The commands below are the lower-level interfaces for controlling each
+stage independently.
+
 | Step | What | Runs as |
 |---|---|---|
 | 1 | Episode extraction | `why dig --episodes` (deterministic) |
@@ -19,7 +25,7 @@ lives in the CLI:
   without it, packs degrade to explicit `[unavailable: …]` markers and the
   dig agents simply have less to cite (they never fetch on their own).
 - For steps 3–4, an agent session with the bundle mounted writable:
-  `npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable`, and the
+  `npx -y @copperbox/okf-mcp@^1.3.0` (the repo config mounts `.why` writable), and the
   relevant skill loaded (in Claude Code, install `skills/dig` and
   `skills/dig-synthesize` as project skills and invoke them per pack/batch).
````

````diff
diff --git a/docs/future-improvements.md b/docs/future-improvements.md
new file mode 100644
index 0000000..5efd42a
--- /dev/null
+++ b/docs/future-improvements.md
@@ -0,0 +1,78 @@
+# Improvements to revisit
+
+The workflow, review-pressure, and diff-impact improvements are implemented in
+[`docs/workflows.md`](workflows.md). The following changes are intentionally
+deferred; each changes trust semantics or the security model and deserves its
+own design review rather than being folded into workflow plumbing.
+
+## Product-quality evaluation
+
+Mechanical tests prove that the archive behaves consistently, not that the
+recovered rationale is useful. Build a benchmark of repositories with known
+historical decisions and measure reconstruction precision, important decisions
+missed, human edit/acceptance rate, false anchor continuity/loss, answer time,
+and draft age/promotion rate. Use those results to decide whether archaeology
+is a reliable adoption wedge or primarily migration assistance for capture.
+
+## Claim-level evidence
+
+A concept can contain a recorded intention, an inferred causal claim, and a
+measured outcome with different support. Explore claim-level evidence and two
+separate dimensions—source provenance and corroboration—without making the
+plain-Markdown interface unreadable. Preserve the rule that no renderer may
+show a claim more confidently than its evidence permits.
+
+## Warning scope at large bundle sizes
+
+`why blame` currently broadcasts every expired constraint. Measure warning
+fatigue on bundles with hundreds of concepts. Likely direction: connected
+expiry remains prominent, unrelated expiry becomes a compact health count, and
+only explicitly critical constraints broadcast globally. `why impact` already
+uses the connected-only behavior as an experiment.
+
+## Evidence security and retention
+
+PR discussions and imported chat/postmortem exports can contain secrets or
+sensitive material; `verify.method: check` also executes repository-authored
+commands. Design redaction hooks, evidence retention/access rules, and an
+explicit trust policy or sandbox for audit checks before recommending `why` for
+untrusted repositories or broad organizational ingestion.
+
+## Human-confirmed successor anchors
+
+Whole-subsystem rewrites can preserve a decision while destroying its original
+symbol. Add an explicit, reviewable successor operation that links the old and
+new anchors without weakening the existing refusal to guess. Evaluate stable
+symbol identities and content fingerprints as evidence, but require human
+confirmation for semantic succession.
+
+## OKF v0.2 trust in the editorial queue
+
+Why now preserves and reads OKF v0.2 `generated`, `sources`, `verified`,
+`stale_after`, and lifecycle fields, but it does not collapse them into the
+existing `why.confidence` or `why.review_by` fields. Those concepts answer
+different questions: evidence strength, human/machine verification, content
+freshness, and editorial scheduling. Extend `why review` to show these as
+separate signals, then consider explicit verify/stale filters after user
+testing proves the display is understandable.
+
+## Archive migration and richer config composition
+
+Keep existing v0.1 archives readable and migrate them only through an
+explicit, reviewed operation. Once upstream migration edge cases are fixed,
+add a `why doctor` recommendation that previews `okf-mcp migrate` rather than
+silently rewriting history. Config discovery also makes it possible to mount
+team policy, product, and personal bundles alongside `.why`; explore
+cross-bundle decision impact without assuming every mounted source is writable
+or equally trusted.
+
+## Upstream OKF MCP review follow-ups
+
+The 1.3.0 review found issues to resolve upstream before Why relies on the
+affected guarantees: project-config writability checks need realpath-aware
+symlink containment; partial migrations must not stamp a bundle v0.2;
+verification-only updates must preserve generation provenance by default;
+malformed verifier records must not raise trust; and nested config typos should
+warn. The review also identified duplicated startup/reload config resolution,
+an overly broad repair export, inconsistent actor typing, and one source
+commit without its required paired test change.
````

````diff
diff --git a/docs/workflows.md b/docs/workflows.md
new file mode 100644
index 0000000..33678d4
--- /dev/null
+++ b/docs/workflows.md
@@ -0,0 +1,75 @@
+# Outcome-oriented workflows
+
+The low-level commands remain available for CI and debugging, but routine use
+starts with four outcome-oriented interfaces. They keep the deterministic work
+inside `why` and expose the human/agent judgment seam explicitly.
+
+## `why bootstrap`
+
+```bash
+why bootstrap [--full] [--evidence-dir <exports>] [--max-chars <n>]
+```
+
+Prepares the cold-start archaeology workspace in one run: resolves the
+incremental Git range, extracts episodes, assembles every evidence pack, writes
+an ordered `HANDOFF.md`, and advances the dig high-water mark only after all
+outputs succeed. The workspace lives under `.why/.cache/bootstrap/<head>/` and
+is derived, ignored state.
+
+The handoff is deliberate. Reconstructing rationale is judgment, so the CLI
+does not call an unspecified model or silently invent prose. Run `skills/dig`
+once per checked item and `skills/dig-synthesize` once for the batch, then run
+`why maintain`.
+
+`why dig --episodes` and `why dig --evidence` remain the lower-level interfaces
+when a caller needs to control those stages independently.
+
+## `why maintain`
+
+```bash
+why maintain [--json]
+```
+
+Runs the safe routine loop in order: lint gate, anchor resolution and writes,
+constraint audit, fresh lint/doctor checks, and editorial-inbox summary. It
+refuses to write on a feature branch when `origin/HEAD` identifies a different
+integration branch; use the read-only PR-gate commands there.
+
+The separate CI workflows remain useful because they have different triggers
+and permissions. `maintain` is the operator interface for a local or scheduled
+integration-branch run.
+
+## `why review`
+
+```bash
+why review
+why review --promote <draft.md>
+```
+
+Shows one queue containing capture drafts, open questions, and archive-health
+maintenance. Capture-generated drafts carry `why.owner`, `why.captured_on`, and
+`why.review_by`; the default review window is fourteen days. Audit-generated
+questions carry capture and review dates but remain unassigned until someone
+takes them.
+
+The command reports age, overdue state, and ownership. Promotion remains
+lint-gated and editorial: listing a draft never serves it, and promotion never
+repairs unsupported rationale automatically.
+
+## `why impact`
+
+```bash
+why impact                         # HEAD versus the working tree
+why impact origin/main...HEAD      # a PR-sized diff
+why impact <base>..<head> --json
+```
+
+Reports every concept anchored to a changed path, distinguishing exact hunk
+overlap from conservative same-file relevance. It then walks `# Because of`
+edges and shows expired constraints upstream of those affected concepts. It
+does not broadcast unrelated expired constraints; global health remains the
+job of `why doctor` and `why review`.
+
+This interface is intended for code review and agent session-start checks: it
+pushes relevant rationale into the path of a change before the engineer has to
+remember a specific `why blame` query.
````

````diff
diff --git a/examples/harbor/attempts/striped-rwlock.md b/examples/harbor/attempts/striped-rwlock.md
index 1e7cc07..6fb6027 100644
--- a/examples/harbor/attempts/striped-rwlock.md
+++ b/examples/harbor/attempts/striped-rwlock.md
@@ -16,13 +16,13 @@ The original dispatch-locking design: one RwLock per shard stripe, readers for d
 
 # Why
 
-It was the textbook answer and benchmarked well [1]. The failure mode wasn't performance — it was lock-ordering discipline across independently evolving call sites. Two orderings crept in via separate PRs ([2], [3]), each locally reasonable, jointly deadlock-prone. The [2024-03 stall](/incidents/2024-03-lock-stall.md) was the bill.
+It was the textbook answer and benchmarked well [1]. The failure mode wasn't performance — it was lock-ordering discipline across independently evolving call sites. Two orderings crept in via separate PRs ([2], [3]), each locally reasonable, jointly deadlock-prone. The [2024-03 stall](../incidents/2024-03-lock-stall.md) was the bill.
 
 The durable lesson recorded in the replacement PR: *"any scheme where correctness depends on every future contributor acquiring locks in the same order is a scheme that fails eventually"* [4]. That sentence is why the fix was a redesign, not an ordering audit.
 
 # Led to
 
-- [2024-03 lock stall](/incidents/2024-03-lock-stall.md)
+- [2024-03 lock stall](../incidents/2024-03-lock-stall.md)
 
 # Citations
````

````diff
diff --git a/examples/harbor/constraints/acme-45s-timeout.md b/examples/harbor/constraints/acme-45s-timeout.md
index ee65363..44badd4 100644
--- a/examples/harbor/constraints/acme-45s-timeout.md
+++ b/examples/harbor/constraints/acme-45s-timeout.md
@@ -20,15 +20,15 @@ AcmeCorp — at the time harbor's largest customer — fronted all traffic with
 
 # Why
 
-Not a technical constraint but a commercial one: Acme's gateway was outside our control, and their retries on kill amplified load exactly when we were slowest. Every synchronous path Acme touched had to complete comfortably inside 45s, which shaped the [47s request deadline](/decisions/47s-request-deadline.md) (47s server-side so *our* timeout fires only after theirs — deliberate, see that decision).
+Not a technical constraint but a commercial one: Acme's gateway was outside our control, and their retries on kill amplified load exactly when we were slowest. Every synchronous path Acme touched had to complete comfortably inside 45s, which shaped the [47s request deadline](../decisions/47s-request-deadline.md) (47s server-side so *our* timeout fires only after theirs — deliberate, see that decision).
 
 # Still true?
 
-**No — expired 2025-06-30.** The Acme contract ended at June 2025 renewal (they migrated to self-hosted) [2]. No other customer is known to enforce a comparable gateway cap. Downstream decisions shaped by this constraint are candidate scar tissue; see [47s request deadline](/decisions/47s-request-deadline.md).
+**No — expired 2025-06-30.** The Acme contract ended at June 2025 renewal (they migrated to self-hosted) [2]. No other customer is known to enforce a comparable gateway cap. Downstream decisions shaped by this constraint are candidate scar tissue; see [47s request deadline](../decisions/47s-request-deadline.md).
 
 # Led to
 
-- [47s request deadline](/decisions/47s-request-deadline.md)
+- [47s request deadline](../decisions/47s-request-deadline.md)
 
 # Citations
````

````diff
diff --git a/examples/harbor/decisions/47s-request-deadline.md b/examples/harbor/decisions/47s-request-deadline.md
index b25880e..4151717 100644
--- a/examples/harbor/decisions/47s-request-deadline.md
+++ b/examples/harbor/decisions/47s-request-deadline.md
@@ -25,15 +25,15 @@ why:
 
 # Why
 
-Set two seconds *past* the [Acme gateway's 45s kill](/constraints/acme-45s-timeout.md), deliberately: if our deadline fired first, Acme's gateway saw a clean error and retried immediately, doubling load during slowdowns. Letting *their* timeout fire first meant their retry logic backed off instead. The 2s margin covers clock skew and gateway jitter.
+Set two seconds *past* the [Acme gateway's 45s kill](../constraints/acme-45s-timeout.md), deliberately: if our deadline fired first, Acme's gateway saw a clean error and retried immediately, doubling load during slowdowns. Letting *their* timeout fire first meant their retry logic backed off instead. The 2s margin covers clock skew and gateway jitter.
 
 Confidence is `corroborated` rather than `recorded`: the commit message says only "bump deadline 30→47s for Acme" [1], but the linked issue thread contains the fire-first reasoning [2], and the two agree.
 
-**⚠ Upstream constraint expired.** The [Acme constraint](/constraints/acme-45s-timeout.md) ended 2025-06-30. Nothing else is known to depend on the specific value 47. This decision is candidate scar tissue: the deadline could likely revert to a value chosen on our own merits. Filed for review — an audit should confirm no other customer inherited a similar cap before changing it.
+**⚠ Upstream constraint expired.** The [Acme constraint](../constraints/acme-45s-timeout.md) ended 2025-06-30. Nothing else is known to depend on the specific value 47. This decision is candidate scar tissue: the deadline could likely revert to a value chosen on our own merits. Filed for review — an audit should confirm no other customer inherited a similar cap before changing it.
 
 # Because of
 
-- [Acme 45s gateway timeout](/constraints/acme-45s-timeout.md)
+- [Acme 45s gateway timeout](../constraints/acme-45s-timeout.md)
 
 # Citations
````

````diff
diff --git a/examples/harbor/decisions/queue-based-locking.md b/examples/harbor/decisions/queue-based-locking.md
index f0b16c7..ce5a293 100644
--- a/examples/harbor/decisions/queue-based-locking.md
+++ b/examples/harbor/decisions/queue-based-locking.md
@@ -26,18 +26,18 @@ All shard mutations (dispatch claims, moves, rebalances) are serialized through
 
 # Why
 
-Written in PR #212's description at the time [1]: after the [March stall](/incidents/2024-03-lock-stall.md), the team concluded the striped design's failure was structural — correctness depended on lock-ordering discipline across every future call site. The queue trades peak parallelism for a design where deadlock is impossible by construction. Benchmarks in the PR showed p99 dispatch latency rising ~8%, judged acceptable against a sev-1 class eliminated outright.
+Written in PR #212's description at the time [1]: after the [March stall](../incidents/2024-03-lock-stall.md), the team concluded the striped design's failure was structural — correctness depended on lock-ordering discipline across every future call site. The queue trades peak parallelism for a design where deadlock is impossible by construction. Benchmarks in the PR showed p99 dispatch latency rising ~8%, judged acceptable against a sev-1 class eliminated outright.
 
 The 8% regression is why `acquire_shared` exists as a separate read path — pulling reads out of the queue clawed most of it back [2].
 
 # Because of
 
-- [2024-03 lock stall](/incidents/2024-03-lock-stall.md)
-- [Striped RwLock](/attempts/striped-rwlock.md)
+- [2024-03 lock stall](../incidents/2024-03-lock-stall.md)
+- [Striped RwLock](../attempts/striped-rwlock.md)
 
 # Instead of
 
-- [Striped RwLock](/attempts/striped-rwlock.md) — deadlocked under load; ordering discipline doesn't survive contributors
+- [Striped RwLock](../attempts/striped-rwlock.md) — deadlocked under load; ordering discipline doesn't survive contributors
 - Full actor-per-shard rewrite — rejected in review as a quarter-long migration for the same guarantee [1]
 
 # Citations
````

````diff
diff --git a/examples/harbor/incidents/2024-03-lock-stall.md b/examples/harbor/incidents/2024-03-lock-stall.md
index 85e86bf..a88c2a4 100644
--- a/examples/harbor/incidents/2024-03-lock-stall.md
+++ b/examples/harbor/incidents/2024-03-lock-stall.md
@@ -26,7 +26,7 @@ The on-call annotation "we got lucky in Feb — same signature, self-resolved" u
 
 # Led to
 
-- [Queue-based locking](/decisions/queue-based-locking.md)
+- [Queue-based locking](../decisions/queue-based-locking.md)
 
 # Citations
````

````diff
diff --git a/okf.config.json b/okf.config.json
new file mode 100644
index 0000000..9c7d6c7
--- /dev/null
+++ b/okf.config.json
@@ -0,0 +1,8 @@
+{
+  "bundles": {
+    "why": {
+      "path": ".why",
+      "writable": true
+    }
+  }
+}
````

````diff
diff --git a/package-lock.json b/package-lock.json
index d6b2a32..71b073f 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -9,10 +9,11 @@
       "version": "1.0.1",
       "license": "MIT",
       "dependencies": {
-        "@copperbox/okf-mcp": "^0.19.1",
+        "@copperbox/okf-mcp": "^1.3.0",
         "esbuild": "0.28.1",
         "tree-sitter-wasms": "0.1.13",
-        "web-tree-sitter": "0.24.7"
+        "web-tree-sitter": "0.24.7",
+        "yaml": "^2.9.0"
       },
       "bin": {
         "why": "dist/cli.js"
@@ -24,8 +25,7 @@
         "ajv": "^8.20.0",
         "jsdom": "^29.1.1",
         "tsx": "^4.19.0",
-        "typescript": "^5.7.0",
-        "yaml": "^2.9.0"
+        "typescript": "^5.7.0"
       }
     },
     "node_modules/@ai-hero/sandcastle": {
@@ -148,9 +148,9 @@
       }
     },
     "node_modules/@copperbox/okf-mcp": {
-      "version": "0.19.1",
-      "resolved": "https://registry.npmjs.org/@copperbox/okf-mcp/-/okf-mcp-0.19.1.tgz",
-      "integrity": "sha512-Sj3h1dnis6bOEd+8exUjEd8KwPK1RarQGwAiuPSvfOYI1uTcNJ2VU0z6Mk37sYehHHNlstbkwmKiJutOykfkMA==",
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/@copperbox/okf-mcp/-/okf-mcp-1.3.0.tgz",
+      "integrity": "sha512-0wvokbK3wHRRio4Y5e5FDqB+s5FCYN8Y+0gDHg5tdbK8geJnnMAQ7uvBxDjyNLgOD0usRRVU4eSmhkOMmsFyzA==",
       "license": "ISC",
       "dependencies": {
         "@modelcontextprotocol/sdk": "^1.18.0",
````

````diff
diff --git a/package.json b/package.json
index b7161aa..20de07b 100644
--- a/package.json
+++ b/package.json
@@ -36,13 +36,13 @@
     "ajv": "^8.20.0",
     "jsdom": "^29.1.1",
     "tsx": "^4.19.0",
-    "typescript": "^5.7.0",
-    "yaml": "^2.9.0"
+    "typescript": "^5.7.0"
   },
   "dependencies": {
-    "@copperbox/okf-mcp": "^0.19.1",
+    "@copperbox/okf-mcp": "^1.3.0",
     "esbuild": "0.28.1",
     "tree-sitter-wasms": "0.1.13",
-    "web-tree-sitter": "0.24.7"
+    "web-tree-sitter": "0.24.7",
+    "yaml": "^2.9.0"
   }
 }
````

````diff
diff --git a/skills/capture/SKILL.md b/skills/capture/SKILL.md
index 9642682..e80646b 100644
--- a/skills/capture/SKILL.md
+++ b/skills/capture/SKILL.md
@@ -9,7 +9,8 @@ You are the judgment half of merge-time capture (DESIGN.md open problem #5).
 `why capture --pr <n>` already did the deterministic half: it assembled the
 PR's evidence into a pack and emitted a draft into `.why/.drafts/` with
 frontmatter pre-filled (type guessed from merge-vs-close, `happened_on`,
-anchors derived from the merge diff's hunks, citations to the PR) and the
+editorial `owner`/`captured_on`/`review_by`, anchors derived from the merge
+diff's hunks, citations to the PR) and the
 rationale candidates quoted verbatim. Drafts are deliberately **not served**
 — nothing in `.why/.drafts/` reaches `why blame` or the mounted bundle until
 you promote it. Your input is one draft plus its `.evidence.md` sidecar; your
@@ -19,7 +20,7 @@ output is either a promoted concept, an update to an existing concept, a
 The bundle is mounted writable:
 
 ```bash
-npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable
+npx -y @copperbox/okf-mcp@^1.3.0
 ```
 
 ## The contract — non-negotiable
@@ -90,7 +91,8 @@ drops down the ladder from there.
    (`pr-212-….md`); rename the file to a short kebab-case slug for the idea
    (`queue-based-locking.md`) before promoting — the filename becomes the
    concept id.
-8. **Promote.** `why capture --promote <draft>` moves the draft into its type
+8. **Promote.** `why review --promote <draft>` (or the lower-level `why capture
+   --promote <draft>`) moves the draft into its type
    directory only if it lints clean; a refusal prints the findings and keeps
    the draft — fix and re-run. If the draft instead folded into an existing
    concept or became a `question` you wrote directly, delete the draft and
````

````diff
diff --git a/skills/dig-synthesize/SKILL.md b/skills/dig-synthesize/SKILL.md
index ad8184d..3cf89ba 100644
--- a/skills/dig-synthesize/SKILL.md
+++ b/skills/dig-synthesize/SKILL.md
@@ -13,7 +13,7 @@ inside one episode. Your input is the bundle as those runs left it — read it
 through okf-mcp; the same mount the dig runs used:
 
 ```bash
-npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable
+npx -y @copperbox/okf-mcp@^1.3.0
 ```
 
 ## The contract — non-negotiable
````

````diff
diff --git a/skills/dig/SKILL.md b/skills/dig/SKILL.md
index a47a905..4e0b60b 100644
--- a/skills/dig/SKILL.md
+++ b/skills/dig/SKILL.md
@@ -15,7 +15,7 @@ okf-mcp write tools, every one of them passing `why lint` before you finish.
 The bundle is mounted writable:
 
 ```bash
-npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable
+npx -y @copperbox/okf-mcp@^1.3.0
 ```
 
 ## The contract — non-negotiable
@@ -26,9 +26,10 @@ npx -y @copperbox/okf-mcp --bundle <repo-name>=.why --writable
    a `[clipped: …]` marker means the rest was cut. What you cannot see, you
    cannot cite; what you cannot cite, you cannot claim.
 2. **Cite everything.** Every claim in a narrative traces to a specific item
-   in the pack — a commit, a PR/issue comment, a local evidence file. Any
-   concept at confidence `inferred` or above **must** carry a `# Citations`
-   section pointing at those items.
+   in the pack — a commit, a PR/issue comment, a local evidence file. In v0.2,
+   record those items in `sources` and attach claims with matching footnotes;
+   in a legacy v0.1 bundle, use `# Citations`. Any concept at confidence
+   `inferred` or above must carry that evidence.
 3. **Never assert rationale above its evidence.** Assign confidence from the
    ladder below, bottom-up from what the citations actually support — never
    from how plausible the story feels.
@@ -81,7 +82,8 @@ One concept per file, under the directory matching its type:
 `decisions/`, `constraints/`, `attempts/`, `incidents/`, `questions/`.
 Slugs are short kebab-case (`queue-based-locking.md`, not
 `decision-to-switch-to-queue-based-locking-2024.md`). Links between concepts
-are bundle-absolute (`/constraints/acme-45s-timeout.md`).
+are document-relative (`../constraints/acme-45s-timeout.md`) so they remain
+valid when the bundle is published below a repository path.
 
 Frontmatter template — standard OKF keys plus everything `why`-specific
 namespaced under the single `why:` map (write nothing why-specific outside
@@ -106,7 +108,7 @@ why:
 ---
 ```
 
-Do not set `timestamp` — the write tools stamp it. Per-type fields:
+Do not set `generated` or legacy `timestamp` — the write tools stamp provenance in the bundle's declared vocabulary. In OKF v0.2 bundles, put evidence in frontmatter `sources` and cite claims with matching `[^source-id]` footnotes; use legacy `# Citations` only when extending a v0.1 bundle. Per-type fields:
 
 | Field | decision | constraint | attempt | incident | question |
 |---|---|---|---|---|---|
````

````diff
diff --git a/src/audit.ts b/src/audit.ts
index a9d414a..81c5b78 100644
--- a/src/audit.ts
+++ b/src/audit.ts
@@ -20,7 +20,8 @@ import { existsSync } from "node:fs";
 import { readFile, writeFile } from "node:fs/promises";
 import { basename, dirname, join } from "node:path";
 import { promisify } from "node:util";
-import { extractSection, updateConcept, writeConcept } from "@copperbox/okf-mcp";
+import { bundleVocabulary, updateConcept, writeConcept } from "@copperbox/okf-mcp";
+import { extractSection } from "./okf.js";
 import { isOneOf, isPlainMap, type WhyBundle, type WhyConcept } from "./bundle.js";
 import { plural } from "./dig.js";
 
@@ -349,8 +350,8 @@ async function writeQuestion(
   const body = [
     `# ${title}`,
     "",
-    `[${constraintTitle}](/${constraint.path}) expired on ${expiredOn}, but ` +
-      `[${decisionTitle}](/${decision.path}) — shaped by it via \`# Because of\` — is still \`active\`. ` +
+    `[${constraintTitle}](../${constraint.path}) expired on ${expiredOn}, but ` +
+      `[${decisionTitle}](../${decision.path}) — shaped by it via \`# Because of\` — is still \`active\`. ` +
       "The decision's code shape may now be scar tissue: re-evaluate it, then either supersede it " +
       "or record why it stands on its own merits.",
     "",
@@ -364,10 +365,15 @@ async function writeQuestion(
       type: "question",
       title,
       description: `Generated by why audit: ${constraint.id} expired on ${expiredOn} while ${decision.id} is still active.`,
-      why: { status: "open", happened_on: expiredOn },
+      why: {
+        status: "open",
+        happened_on: expiredOn,
+        captured_on: expiredOn,
+        review_by: plusDays(expiredOn, 14),
+      },
     },
     body,
-    { failIfExists: true },
+    { failIfExists: true, vocabulary: bundleVocabulary(bundle.okf) },
   );
   return relPath;
 }
@@ -378,6 +384,12 @@ function isoDate(now: Date): string {
   return now.toISOString().slice(0, 10);
 }
 
+function plusDays(date: string, days: number): string {
+  const value = new Date(`${date}T00:00:00.000Z`);
+  value.setUTCDate(value.getUTCDate() + days);
+  return isoDate(value);
+}
+
 function indentBlock(text: string): string {
   const body = text === "" ? "(no output)" : text;
   return body
````

````diff
diff --git a/src/blame.ts b/src/blame.ts
index 0c6f8e7..55cfc89 100644
--- a/src/blame.ts
+++ b/src/blame.ts
@@ -4,7 +4,8 @@
 // claim that no longer holds, so it never matches: anchors are live or lost,
 // never silently wrong.
 
-import { deriveTitle, extractCitations } from "@copperbox/okf-mcp";
+import { conceptSources } from "@copperbox/okf-mcp";
+import { deriveTitle } from "./okf.js";
 import {
   buildAnchorIndex,
   indexedConcept,
@@ -145,8 +146,12 @@ function edgesIn(bundle: WhyBundle, concept: WhyConcept, section: string): Blame
 }
 
 function citationsOf(bundle: WhyBundle, concept: WhyConcept): BlameCitation[] {
-  const { citations } = extractCitations(concept.body, concept.path, (id) => bundle.concepts.has(id));
-  return citations.map((c) => ({ label: c.text, url: c.target }));
+  const okfConcept = bundle.okf.concepts.get(concept.id);
+  if (okfConcept === undefined) return [];
+  return conceptSources(okfConcept).sources.map((source) => ({
+    label: typeof source.title === "string" ? source.title : source.id ?? source.resource,
+    url: source.resource,
+  }));
 }
 
 /** `PR #212: replace striped locks…` reads as `PR #212` on one evidence line. */
````

````diff
diff --git a/src/bundle.ts b/src/bundle.ts
index 022e5de..86df9a4 100644
--- a/src/bundle.ts
+++ b/src/bundle.ts
@@ -4,17 +4,13 @@
 // Loading is permissive in the OKF spirit: malformed `why:` data becomes a
 // diagnostic, never an exception — `why lint` renders the diagnostics.
 
-import {
-  loadBundle as loadOkfBundle,
-  sectionAt,
-  splitSections,
-} from "@copperbox/okf-mcp";
+import { loadBundle as loadOkfBundle } from "@copperbox/okf-mcp";
 import type {
-  BodySection,
   ConceptFrontmatter,
   ConceptLink,
   LoadedBundle,
 } from "@copperbox/okf-mcp";
+import { sectionAt, splitSections, type BodySection } from "./okf.js";
 
 export const CONCEPT_TYPES = ["decision", "constraint", "attempt", "incident", "question"] as const;
 export type ConceptType = (typeof CONCEPT_TYPES)[number];
@@ -65,6 +61,12 @@ export interface VerifySpec {
 export interface WhyMeta {
   status?: string;
   happened_on?: string;
+  /** When an item entered the editorial queue. */
+  captured_on?: string;
+  /** Person or team responsible for resolving the item. */
+  owner?: string;
+  /** Date by which editorial review should happen. */
+  review_by?: string;
   expired_on?: string;
   confidence?: Confidence;
   anchors: Anchor[];
@@ -106,7 +108,17 @@ export interface WhyBundle {
   okf: LoadedBundle;
 }
 
-const WHY_KEYS = new Set(["status", "happened_on", "expired_on", "confidence", "anchors", "verify"]);
+const WHY_KEYS = new Set([
+  "status",
+  "happened_on",
+  "captured_on",
+  "owner",
+  "review_by",
+  "expired_on",
+  "confidence",
+  "anchors",
+  "verify",
+]);
 
 export function isPlainMap(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
@@ -234,13 +246,18 @@ function readWhyMeta(
       }
     }
   }
-  for (const key of ["happened_on", "expired_on"] as const) {
+  for (const key of ["happened_on", "captured_on", "review_by", "expired_on"] as const) {
     if (raw[key] !== undefined) {
       const date = asStringy(raw[key]);
       if (date === undefined) push(`why.${key}`, "must be a date string");
       else meta[key] = date;
     }
   }
+  if (raw.owner !== undefined) {
+    const owner = asStringy(raw.owner);
+    if (owner === undefined || owner.trim() === "") push("why.owner", "must be a non-empty string");
+    else meta.owner = owner;
+  }
   if (raw.confidence !== undefined) {
     if (isOneOf(CONFIDENCE_LEVELS, raw.confidence)) {
       meta.confidence = raw.confidence;
````

````diff
diff --git a/src/capture.ts b/src/capture.ts
index d00fb4e..09b43fe 100644
--- a/src/capture.ts
+++ b/src/capture.ts
@@ -12,8 +12,9 @@
 import { existsSync } from "node:fs";
 import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
 import { basename, dirname, join, resolve } from "node:path";
-import { serializeDocument, splitFrontmatter, writeConcept } from "@copperbox/okf-mcp";
+import { bundleVocabulary, writeConcept } from "@copperbox/okf-mcp";
 import type { ConceptFrontmatter } from "@copperbox/okf-mcp";
+import { extractSection, removeSection, serializeDocument, splitFrontmatter } from "./okf.js";
 import { parseLineRange, type LineRange } from "./anchors.js";
 import { CONCEPT_TYPES, isOneOf, isPlainMap, loadBundle, type WhyBundle } from "./bundle.js";
 import {
@@ -62,6 +63,8 @@ export interface CaptureResult {
 export interface CaptureOptions {
   /** Injectable so tests answer gh from fixtures and never hit the network. */
   runner?: CommandRunner;
+  /** Capture time for queue metadata; injectable for deterministic tests. */
+  now?: Date;
 }
 
 // --- Anchors from the diff's hunks --------------------------------------------
@@ -289,12 +292,17 @@ async function emitDraft(
 function whyMap(opts: {
   status: string;
   happenedOn?: string;
+  capturedOn: string;
+  owner?: string;
   candidateCount: number;
   anchors: CapturedAnchor[];
   notes: string[];
 }): Record<string, unknown> {
   const why: Record<string, unknown> = { status: opts.status };
   if (opts.happenedOn !== undefined) why.happened_on = opts.happenedOn;
+  why.captured_on = opts.capturedOn;
+  why.review_by = plusDays(opts.capturedOn, 14);
+  if (opts.owner !== undefined && opts.owner !== "") why.owner = opts.owner;
   if (opts.candidateCount > 0) {
     // Verbatim human-written rationale from the time of the change is the
     // `recorded` bar; the promotion step confirms the kept quotes state it.
@@ -308,6 +316,16 @@ function whyMap(opts: {
   return why;
 }
 
+function isoDate(now: Date): string {
+  return now.toISOString().slice(0, 10);
+}
+
+function plusDays(date: string, days: number): string {
+  const value = new Date(`${date}T00:00:00.000Z`);
+  value.setUTCDate(value.getUTCDate() + days);
+  return isoDate(value);
+}
+
 function asString(v: unknown): string | undefined {
   return typeof v === "string" && v !== "" ? v : undefined;
 }
@@ -327,6 +345,7 @@ export async function capturePr(
   options: CaptureOptions = {},
 ): Promise<CaptureResult> {
   const runner = options.runner ?? runCommand;
+  const capturedOn = isoDate(options.now ?? new Date());
   const repo = dirname(bundle.root);
   const r = runner("gh", ["pr", "view", String(n), "--json", PR_FIELDS], repo);
   if (r.status === 127) {
@@ -423,6 +442,8 @@ export async function capturePr(
     anchors,
     notes,
     happenedOn,
+    capturedOn,
+    owner: author === "unknown" ? undefined : `@${author}`,
   });
   const frontmatter: Record<string, unknown> = {
     type,
@@ -473,6 +494,7 @@ export async function captureCommit(
   options: CaptureOptions = {},
 ): Promise<CaptureResult> {
   const runner = options.runner ?? runCommand;
+  const capturedOn = isoDate(options.now ?? new Date());
   const repo = dirname(bundle.root);
   const verify = runner("git", ["rev-parse", "--verify", `${ref}^{commit}`], repo);
   if (verify.status !== 0) {
@@ -480,11 +502,11 @@ export async function captureCommit(
   }
   const sha = verify.stdout.trim();
   const sha7 = sha.slice(0, 7);
-  const shown = runner("git", ["show", "-s", "--format=%as%n%B", sha], repo);
+  const shown = runner("git", ["show", "-s", "--format=%as%n%ae%n%B", sha], repo);
   if (shown.status !== 0) {
     throw new CaptureError(`git show ${sha} failed: ${firstLine(shown.stderr)}`);
   }
-  const [date, subject, ...rest] = shown.stdout.split("\n");
+  const [date, authorEmail, subject, ...rest] = shown.stdout.split("\n");
   const messageBody = rest.join("\n").trim();
   const title = subject?.trim() || `commit ${sha7}`;
   const happenedOn = asString(date?.trim());
@@ -517,6 +539,8 @@ export async function captureCommit(
     anchors: derived.anchors,
     notes,
     happenedOn,
+    capturedOn,
+    owner: asString(authorEmail?.trim()),
   });
   const frontmatter: Record<string, unknown> = {
     type: "decision",
@@ -591,9 +615,18 @@ export async function promoteDraft(bundle: WhyBundle, ref: string, cwd: string):
     );
   }
   const relPath = `${type}s/${basename(draftPath)}`;
+  const vocabulary = bundleVocabulary(bundle.okf);
+  const frontmatter = { ...split.data } as ConceptFrontmatter;
+  let body = split.body;
+  if (vocabulary === "0.2" && frontmatter.sources === undefined) {
+    const sources = legacyCitationSources(body);
+    if (sources.length > 0) frontmatter.sources = sources;
+    body = removeSection(body, "Citations");
+  }
   try {
-    await writeConcept(bundle.root, relPath, split.data as ConceptFrontmatter, split.body, {
+    await writeConcept(bundle.root, relPath, frontmatter, body, {
       failIfExists: true,
+      vocabulary,
     });
   } catch (e) {
     throw new CaptureError(`cannot promote to ${relPath}: ${e instanceof Error ? e.message : String(e)}`);
@@ -608,3 +641,13 @@ export async function promoteDraft(bundle: WhyBundle, ref: string, cwd: string):
   await rm(draftPath.replace(/\.md$/, EVIDENCE_SUFFIX), { force: true });
   return { promoted: true, path: relPath, findings };
 }
+
+/** Lift capture's own well-formed v0.1 citation lines for a v0.2 promotion. */
+function legacyCitationSources(body: string): Array<{ id: string; title: string; resource: string }> {
+  const section = extractSection(body, "Citations")?.content ?? "";
+  const sources: Array<{ id: string; title: string; resource: string }> = [];
+  for (const match of section.matchAll(/^\[(\d+)\]\s+\[([^\]]+)\]\(([^)\s]+)\)/gm)) {
+    sources.push({ id: `source-${match[1]}`, title: match[2]!, resource: match[3]! });
+  }
+  return sources;
+}
````

````diff
diff --git a/src/cli.ts b/src/cli.ts
index de745ca..1bb87cf 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -24,12 +24,24 @@ import { DigStateError, withDigState, type DigRange, type DigRangeOverrides } fr
 import { buildDoctorReport, renderDoctorReport } from "./doctor.js";
 import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
 import { buildGraph, buildUiIndex, EXPORT_TARGETS, ExportError } from "./export.js";
-import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
+import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet, writeOkfConfig } from "./init.js";
+import { buildImpactReport, ImpactError, renderImpactReport } from "./impact.js";
 import { lintBundle, renderFindings } from "./lint.js";
+import { buildReviewReport, renderReviewReport } from "./review.js";
 import { ServeError, startWhyServer } from "./serve.js";
 import { AssetError } from "./serve-assets.js";
+import {
+  bootstrapBundle,
+  maintainBundle,
+  renderBootstrapReport,
+  renderMaintainReport,
+  WorkflowError,
+} from "./workflow.js";
 
-export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export", "serve"] as const;
+export const COMMANDS = [
+  "init", "bootstrap", "maintain", "review", "impact",
+  "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export", "serve",
+] as const;
 export type Command = (typeof COMMANDS)[number];
 
 /** Where a command's output goes; injectable so tests can capture it. */
@@ -54,6 +66,10 @@ export function usage(): string {
     "",
     "Commands:",
     "  init     scaffold a .why/ bundle in the current repo",
+    "  bootstrap prepare cold-start history and evidence in one run",
+    "  maintain run routine anchoring, audit, health, and inbox checks",
+    "  review   show the consolidated editorial queue or promote a draft",
+    "  impact   show decision context affected by a Git diff",
     "  lint     check the bundle against the why schema (DESIGN.md §3)",
     "  blame    show the decision story behind a file or line range",
     "  anchor   re-resolve code anchors against HEAD",
@@ -68,7 +84,9 @@ export function usage(): string {
     "  --bundle <path>     bundle root to use instead of the nearest .why/",
     "                      (lint also takes the path as a positional: why lint <path>)",
     "  --capture-snippet   (init) add the knowledge-capture block to CLAUDE.md",
-    "  --json              (blame, lint, doctor, dig, audit) emit the results as JSON",
+    "  --full              (bootstrap, dig --episodes) process full history",
+    "  --promote <draft>   (review, capture) lint-gate and promote a draft",
+    "  --json              emit machine-readable results where supported",
     "  --check             (anchor) CI mode — resolve, write nothing, exit 1 on drift",
     "  --concept <id>      (anchor) re-anchor a single concept",
     "  --episodes          (dig) extract commit episodes + tells from git history",
@@ -88,6 +106,104 @@ export function usage(): string {
   ].join("\n");
 }
 
+async function runBootstrap({ values, positionals, bundle, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err("why bootstrap: takes no positional arguments — usage: why bootstrap [--full] [--evidence-dir <dir>] [--max-chars <n>] [--json]");
+    return 2;
+  }
+  let maxChars: number | undefined;
+  if (values["max-chars"] !== undefined) {
+    maxChars = Number(values["max-chars"]);
+    if (!Number.isInteger(maxChars) || maxChars <= 0) {
+      io.err(`why bootstrap: --max-chars must be a positive integer, got "${values["max-chars"]}"`);
+      return 2;
+    }
+  }
+  try {
+    const options: Parameters<typeof bootstrapBundle>[1] = { full: values.full === true };
+    if (values["evidence-dir"] !== undefined) options.evidenceDir = values["evidence-dir"] as string;
+    if (maxChars !== undefined) options.maxChars = maxChars;
+    const report = await bootstrapBundle(bundle!, options);
+    if (values.json === true) io.out(JSON.stringify(report, null, 2));
+    else for (const line of renderBootstrapReport(report)) io.out(line);
+    return 0;
+  } catch (e) {
+    if (e instanceof DigError || e instanceof DigStateError || e instanceof EvidenceError) {
+      io.err(`why bootstrap: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
+async function runMaintain({ values, positionals, bundle, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err("why maintain: takes no positional arguments — usage: why maintain [--json]");
+    return 2;
+  }
+  try {
+    const report = await maintainBundle(bundle!);
+    if (values.json === true) io.out(JSON.stringify(report, null, 2));
+    else for (const line of renderMaintainReport(report)) io.out(line);
+    return report.healthy ? 0 : 1;
+  } catch (e) {
+    if (e instanceof AnchorError || e instanceof AuditError || e instanceof WorkflowError) {
+      io.err(`why maintain: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
+async function runReview({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
+  if (positionals.length > 0) {
+    io.err("why review: takes no positional arguments — usage: why review [--promote <draft>] [--json]");
+    return 2;
+  }
+  try {
+    let promotedPath: string | null = null;
+    if (values.promote !== undefined) {
+      const promoted = await promoteDraft(bundle!, values.promote as string, cwd);
+      if (!promoted.promoted) {
+        io.err(`why review: promotion refused — ${promoted.path} fails lint, draft kept`);
+        return 1;
+      }
+      promotedPath = promoted.path;
+      if (values.json !== true) io.out(`promoted → ${promoted.path}`);
+      bundle = await loadBundle(bundle!.root);
+    }
+    const report = await buildReviewReport(bundle!);
+    if (values.json === true) io.out(JSON.stringify({ promoted: promotedPath, review: report }, null, 2));
+    else for (const line of renderReviewReport(report)) io.out(line);
+    return 0;
+  } catch (e) {
+    if (e instanceof CaptureError) {
+      io.err(`why review: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
+async function runImpact({ values, positionals, bundle, io }: CommandContext): Promise<number> {
+  if (positionals.length > 1) {
+    io.err("why impact: expected at most one Git range — usage: why impact [<base>..<head>] [--json]");
+    return 2;
+  }
+  try {
+    const report = buildImpactReport(bundle!, positionals[0]);
+    if (values.json === true) io.out(JSON.stringify(report, null, 2));
+    else for (const line of renderImpactReport(report)) io.out(line);
+    return 0;
+  } catch (e) {
+    if (e instanceof ImpactError) {
+      io.err(`why impact: ${e.message}`);
+      return 1;
+    }
+    throw e;
+  }
+}
+
 interface CommandContext {
   values: Record<string, unknown>;
   positionals: string[];
@@ -115,15 +231,26 @@ async function runInit({ values, cwd, io }: CommandContext): Promise<number> {
   try {
     const repoRoot = findRepoRoot(cwd);
     const root = await scaffoldBundle(repoRoot);
-    const name = basename(repoRoot);
     io.out(`Initialized empty why bundle at ${root}`);
+    try {
+      const config = await writeOkfConfig(repoRoot);
+      io.out(`okf.config.json: bundle mount ${config}`);
+      if (config === "conflict") {
+        io.out("  warning: the project-name bundle id already points elsewhere; add a separate .why mount before starting okf-mcp");
+      }
+    } catch (error) {
+      // The archive is already valid and must not be reported as a failed
+      // initialization merely because an unrelated config needs hand repair.
+      io.out(`okf.config.json: not updated (${(error as Error).message})`);
+    }
     if (values["capture-snippet"] === true) {
       io.out(`CLAUDE.md: capture snippet ${await writeCaptureSnippet(repoRoot)}`);
     }
     io.out("");
     io.out("
[clipped: diff of src/cli.ts in eab8a44 — showing 8000 of 9404 chars]
````

````diff
diff --git a/src/export.ts b/src/export.ts
index ee47eb7..7667020 100644
--- a/src/export.ts
+++ b/src/export.ts
@@ -5,7 +5,7 @@
 // two. Schemas live in schemas/ and are validated against real outputs in
 // test/ui-contract.test.ts.
 
-import { deriveTitle } from "@copperbox/okf-mcp";
+import { deriveTitle } from "./okf.js";
 import { indexedConcept, type AnchorIndex, type LineRange } from "./anchors.js";
 import { glyphFor, type Glyph } from "./blame.js";
 import type { Confidence, WhyBundle } from "./bundle.js";
````

````diff
diff --git a/src/impact.ts b/src/impact.ts
new file mode 100644
index 0000000..36bcf2b
--- /dev/null
+++ b/src/impact.ts
@@ -0,0 +1,164 @@
+// Decision impact for a Git diff. Conservatively names every concept anchored
+// to a changed path, marks exact hunk overlap where it can prove it, and shows
+// only expired constraints causally upstream of those concepts.
+
+import { deriveTitle } from "./okf.js";
+import { dirname } from "node:path";
+import { parseLineRange, type LineRange } from "./anchors.js";
+import type { WhyBundle, WhyConcept } from "./bundle.js";
+import { git } from "./git.js";
+
+export class ImpactError extends Error {}
+
+export interface ChangedFile {
+  path: string;
+  lines: LineRange[];
+  deleted: boolean;
+}
+
+export interface ImpactConcept {
+  id: string;
+  title: string;
+  type: string;
+  status?: string;
+  paths: string[];
+  overlaps_hunk: boolean;
+}
+
+export interface ImpactConstraint {
+  id: string;
+  title: string;
+  expired_on?: string;
+  affects: string[];
+}
+
+export interface ImpactReport {
+  root: string;
+  range: string;
+  files: ChangedFile[];
+  concepts: ImpactConcept[];
+  expired_constraints: ImpactConstraint[];
+}
+
+function addRange(file: ChangedFile, start: number, count: number): void {
+  const at = Math.max(start, 1);
+  file.lines.push({ start: at, end: count === 0 ? at : at + count - 1 });
+}
+
+export function parseDiff(patch: string): ChangedFile[] {
+  const files: ChangedFile[] = [];
+  let current: ChangedFile | undefined;
+  for (const line of patch.split("\n")) {
+    const header = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
+    if (header !== null) {
+      current = { path: header[2]!, lines: [], deleted: false };
+      files.push(current);
+      continue;
+    }
+    if (current === undefined) continue;
+    const oldPath = /^--- a\/(.*)$/.exec(line);
+    if (oldPath !== null && current.deleted) current.path = oldPath[1]!;
+    if (line === "+++ /dev/null") current.deleted = true;
+    if (current.deleted && oldPath !== null) current.path = oldPath[1]!;
+    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
+    if (hunk !== null) addRange(current, Number(hunk[1]), hunk[2] === undefined ? 1 : Number(hunk[2]));
+  }
+  return files.sort((a, b) => a.path.localeCompare(b.path));
+}
+
+function overlaps(anchorLines: string | undefined, changed: ChangedFile): boolean {
+  if (anchorLines === undefined) return true;
+  const anchor = parseLineRange(anchorLines);
+  if (anchor === undefined) return false;
+  return changed.lines.some((line) => anchor.start <= line.end && line.start <= anchor.end);
+}
+
+function upstreamExpired(bundle: WhyBundle, start: WhyConcept): WhyConcept[] {
+  const found = new Map<string, WhyConcept>();
+  const seen = new Set<string>([start.id]);
+  const queue = [start];
+  while (queue.length > 0) {
+    const concept = queue.shift()!;
+    for (const link of concept.links) {
+      if (link.section?.toLowerCase() !== "because of" || link.resolvedId === undefined) continue;
+      const neighbor = bundle.concepts.get(link.resolvedId);
+      if (neighbor === undefined || seen.has(neighbor.id)) continue;
+      seen.add(neighbor.id);
+      if (neighbor.frontmatter.type === "constraint" && neighbor.why.status === "expired") {
+        found.set(neighbor.id, neighbor);
+      }
+      queue.push(neighbor);
+    }
+  }
+  return [...found.values()];
+}
+
+export function buildImpactReport(bundle: WhyBundle, range?: string): ImpactReport {
+  const repo = dirname(bundle.root);
+  const args = ["diff", "--find-renames", "--unified=0", "--no-color"];
+  const label = range ?? "HEAD..worktree";
+  if (range !== undefined) args.push(range);
+  else args.push("HEAD");
+  args.push("--");
+  const result = git(repo, args);
+  if (result.status !== 0) throw new ImpactError(`git diff ${label} failed: ${result.stderr.trim()}`);
+  const files = parseDiff(result.stdout);
+  const byPath = new Map(files.map((file) => [file.path, file]));
+  const concepts: ImpactConcept[] = [];
+  const expired = new Map<string, ImpactConstraint>();
+  for (const concept of bundle.concepts.values()) {
+    const anchors = concept.why.anchors.filter((anchor) => anchor.state !== "lost" && byPath.has(anchor.path));
+    if (anchors.length === 0) continue;
+    const item: ImpactConcept = {
+      id: concept.id,
+      title: deriveTitle(concept),
+      type: concept.frontmatter.type,
+      paths: [...new Set(anchors.map((anchor) => anchor.path))].sort(),
+      overlaps_hunk: anchors.some((anchor) => overlaps(anchor.lines, byPath.get(anchor.path)!)),
+    };
+    if (concept.why.status !== undefined) item.status = concept.why.status;
+    concepts.push(item);
+    for (const constraint of upstreamExpired(bundle, concept)) {
+      const existing = expired.get(constraint.id);
+      if (existing) existing.affects.push(concept.id);
+      else {
+        const warning: ImpactConstraint = {
+          id: constraint.id,
+          title: deriveTitle(constraint),
+          affects: [concept.id],
+        };
+        if (constraint.why.expired_on !== undefined) warning.expired_on = constraint.why.expired_on;
+        expired.set(constraint.id, warning);
+      }
+    }
+  }
+  concepts.sort((a, b) => Number(b.overlaps_hunk) - Number(a.overlaps_hunk) || a.id.localeCompare(b.id));
+  for (const item of expired.values()) item.affects.sort();
+  return {
+    root: bundle.root,
+    range: label,
+    files,
+    concepts,
+    expired_constraints: [...expired.values()].sort((a, b) => a.id.localeCompare(b.id)),
+  };
+}
+
+export function renderImpactReport(report: ImpactReport): string[] {
+  const lines = [`why impact: ${report.range} · ${report.files.length} changed file(s)`, ""];
+  if (report.concepts.length === 0) lines.push("No recorded decisions touch this diff.");
+  else {
+    lines.push(`Affected concepts (${report.concepts.length})`);
+    for (const item of report.concepts) {
+      lines.push(`  ${item.overlaps_hunk ? "●" : "○"} ${item.title} (${item.type}${item.status ? ` · ${item.status}` : ""})`);
+      lines.push(`    ${item.paths.join(", ")}${item.overlaps_hunk ? " · overlaps changed lines" : " · same file"}`);
+    }
+  }
+  if (report.expired_constraints.length > 0) {
+    lines.push("", `Expired upstream constraints (${report.expired_constraints.length})`);
+    for (const item of report.expired_constraints) {
+      lines.push(`  ⚠ ${item.title}${item.expired_on ? ` · expired ${item.expired_on}` : ""}`);
+      lines.push(`    affects ${item.affects.join(", ")}`);
+    }
+  }
+  return lines;
+}
````

````diff
diff --git a/src/init.ts b/src/init.ts
index d2a87ed..0704714 100644
--- a/src/init.ts
+++ b/src/init.ts
@@ -6,9 +6,10 @@ import { spawnSync } from "node:child_process";
 import { existsSync } from "node:fs";
 import { mkdir, readFile, writeFile } from "node:fs/promises";
 import { basename, join } from "node:path";
-import { appendLogEntry, OKF_VERSION, serializeDocument } from "@copperbox/okf-mcp";
+import { appendLogEntry, OKF_VERSION } from "@copperbox/okf-mcp";
 import { CONCEPT_TYPES } from "./bundle.js";
 import { BUNDLE_DIRNAME } from "./discover.js";
+import { serializeDocument } from "./okf.js";
 
 /** An init step that must stop the command cleanly (exit 1), not crash. */
 export class InitError extends Error {}
@@ -18,6 +19,7 @@ export const TYPE_DIRECTORIES = CONCEPT_TYPES.map((type) => `${type}s`);
 
 export const SNIPPET_BEGIN = "<!-- why:begin -->";
 export const SNIPPET_END = "<!-- why:end -->";
+export const OKF_CONFIG_FILENAME = "okf.config.json";
 
 /** Root of the git repo enclosing `cwd`; the bundle always lives at its top. */
 export function findRepoRoot(cwd: string): string {
@@ -64,6 +66,59 @@ export async function scaffoldBundle(repoRoot: string): Promise<string> {
   return root;
 }
 
+/**
+ * Register the archive with okf-mcp's project config. Existing unrelated
+ * settings and bundle mounts survive; a conflicting mount is left untouched
+ * so init never silently redirects a user's knowledge source.
+ */
+export async function writeOkfConfig(
+  repoRoot: string,
+): Promise<"created" | "updated" | "present" | "conflict"> {
+  const configPath = join(repoRoot, OKF_CONFIG_FILENAME);
+  const bundleId = basename(repoRoot);
+  let config: Record<string, unknown>;
+  try {
+    const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
+    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
+      throw new InitError(`why init: ${configPath} must contain a JSON object`);
+    }
+    config = parsed as Record<string, unknown>;
+  } catch (error) {
+    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
+      if (error instanceof InitError) throw error;
+      throw new InitError(`why init: cannot update ${configPath}: ${(error as Error).message}`);
+    }
+    config = {};
+  }
+  const bundlesValue = config.bundles;
+  if (bundlesValue !== undefined && !isRecord(bundlesValue)) {
+    throw new InitError(`why init: ${configPath} \"bundles\" must be a JSON object`);
+  }
+  const bundles = { ...(bundlesValue as Record<string, unknown> | undefined) };
+  const existing = bundles[bundleId];
+  if (existing !== undefined) {
+    const existingPath = typeof existing === "string" ? existing : isRecord(existing) ? existing.path : undefined;
+    if (existingPath !== BUNDLE_DIRNAME) return "conflict";
+    if (isRecord(existing) && existing.writable === false) return "conflict";
+    if (isRecord(existing) && existing.writable === true) return "present";
+    bundles[bundleId] = isRecord(existing)
+      ? { ...existing, writable: true }
+      : { path: BUNDLE_DIRNAME, writable: true };
+    config.bundles = bundles;
+    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
+    return "updated";
+  }
+  bundles[bundleId] = { path: BUNDLE_DIRNAME, writable: true };
+  config.bundles = bundles;
+  const result = Object.keys(config).length === 1 && Object.keys(bundles).length === 1 ? "created" : "updated";
+  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
+  return result;
+}
+
+function isRecord(value: unknown): value is Record<string, unknown> {
+  return value !== null && typeof value === "object" && !Array.isArray(value);
+}
+
 /** The knowledge-capture block dropped into CLAUDE.md (DESIGN.md §8). */
 export function captureSnippet(repoName: string): string {
   return [
@@ -74,8 +129,8 @@ export function captureSnippet(repoName: string): string {
     "decisions, constraints, attempts, incidents, and open questions.",
     "",
     "- Before non-trivial work, consult the archive for the decisions and",
-    "  constraints shaping the code you are about to change (mount it:",
-    `  \`npx -y @copperbox/okf-mcp --bundle ${repoName}=.why --writable\`).`,
+    "  constraints shaping the code you are about to change. okf-mcp loads",
+    `  the \`${repoName}\` bundle from the repo's \`okf.config.json\`.`,
     "- After making a durable decision — choosing an approach, ruling one out,",
     "  hitting a constraint — record it in `.why/` while the context is fresh.",
     SNIPPET_END,
````

````diff
diff --git a/src/lint.ts b/src/lint.ts
index 6778aa5..0e279af 100644
--- a/src/lint.ts
+++ b/src/lint.ts
@@ -59,6 +59,9 @@ const FIELD_RULES: Record<string, RuleId> = {
   anchors: "W103",
   verify: "W104",
   happened_on: "W100",
+  captured_on: "W100",
+  owner: "W100",
+  review_by: "W100",
   expired_on: "W100",
 };
````

````diff
diff --git a/src/okf.ts b/src/okf.ts
new file mode 100644
index 0000000..56381f5
--- /dev/null
+++ b/src/okf.ts
@@ -0,0 +1,133 @@
+// Small Markdown/frontmatter helpers owned by Why. okf-mcp 1.x intentionally
+// keeps parser internals out of its semver-covered library surface; Why only
+// needs this narrow subset for its own extension schema and draft workflow.
+
+import path from "node:path";
+import { parse, stringify } from "yaml";
+import type { ConceptFrontmatter } from "@copperbox/okf-mcp";
+
+export interface FrontmatterSplit {
+  data: Record<string, unknown> | null;
+  body: string;
+  present: boolean;
+  error?: string;
+}
+
+export interface BodySection {
+  heading: string;
+  level: number;
+  content: string;
+}
+
+interface Heading {
+  heading: string;
+  level: number;
+  start: number;
+  contentStart: number;
+}
+
+const OPEN = /^---\r?\n/;
+const CLOSE = /^(?:---|\.\.\.)\s*$/;
+const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
+const FENCE = /^ {0,3}(`{3,}|~{3,})/;
+
+export function splitFrontmatter(source: string): FrontmatterSplit {
+  if (!OPEN.test(source)) return { data: null, body: source, present: false };
+  const lines = source.split(/\r?\n/);
+  const close = lines.findIndex((line, index) => index > 0 && CLOSE.test(line));
+  if (close === -1) {
+    return { data: null, body: source, present: true, error: "unterminated frontmatter block" };
+  }
+  const body = lines.slice(close + 1).join("\n").replace(/^\r?\n/, "");
+  try {
+    const value: unknown = parse(lines.slice(1, close).join("\n"));
+    if (value === null || value === undefined) return { data: {}, body, present: true };
+    if (typeof value !== "object" || Array.isArray(value)) {
+      return { data: null, body, present: true, error: "frontmatter is not a YAML mapping" };
+    }
+    return { data: value as Record<string, unknown>, body, present: true };
+  } catch (error) {
+    return { data: null, body, present: true, error: `invalid YAML frontmatter: ${(error as Error).message}` };
+  }
+}
+
+export function serializeDocument(frontmatter: Record<string, unknown>, body: string): string {
+  const yaml = stringify(frontmatter).trimEnd();
+  return `---\n${yaml}\n---\n\n${body.replace(/^\s+/, "").trimEnd()}\n`;
+}
+
+function headings(body: string): Heading[] {
+  const result: Heading[] = [];
+  let offset = 0;
+  let fence: { char: string; length: number } | undefined;
+  for (const line of body.split("\n")) {
+    const start = offset;
+    offset += line.length + 1;
+    const marker = FENCE.exec(line)?.[1];
+    if (fence !== undefined) {
+      if (marker?.[0] === fence.char && marker.length >= fence.length && line.trim() === marker) fence = undefined;
+      continue;
+    }
+    if (marker !== undefined) {
+      fence = { char: marker[0]!, length: marker.length };
+      continue;
+    }
+    const match = ATX.exec(line);
+    if (match === null) continue;
+    result.push({
+      heading: (match[2] ?? "").replace(/[ \t]+#+$/, ""),
+      level: match[1]!.length,
+      start,
+      contentStart: Math.min(offset, body.length),
+    });
+  }
+  return result;
+}
+
+export function splitSections(body: string): BodySection[] {
+  const found = headings(body);
+  return found.map((heading, index) => ({
+    heading: heading.heading,
+    level: heading.level,
+    content: body.slice(heading.contentStart, found[index + 1]?.start ?? body.length).trim(),
+  }));
+}
+
+export function sectionAt(body: string, offset: number): string | undefined {
+  let section: string | undefined;
+  for (const heading of headings(body)) {
+    if (heading.start > offset) break;
+    section = heading.heading;
+  }
+  return section;
+}
+
+export function extractSection(body: string, name: string): BodySection | undefined {
+  const found = headings(body);
+  const index = found.findIndex((heading) => heading.heading.toLowerCase() === name.trim().toLowerCase());
+  if (index === -1) return undefined;
+  const heading = found[index]!;
+  const next = found.slice(index + 1).find((candidate) => candidate.level <= heading.level);
+  return {
+    heading: heading.heading,
+    level: heading.level,
+    content: body.slice(heading.contentStart, next?.start ?? body.length).trim(),
+  };
+}
+
+/** Remove the first named heading and its subtree, preserving surrounding text. */
+export function removeSection(body: string, name: string): string {
+  const found = headings(body);
+  const index = found.findIndex((heading) => heading.heading.toLowerCase() === name.trim().toLowerCase());
+  if (index === -1) return body;
+  const heading = found[index]!;
+  const next = found.slice(index + 1).find((candidate) => candidate.level <= heading.level);
+  return `${body.slice(0, heading.start).trimEnd()}\n${body.slice(next?.start ?? body.length).replace(/^\s+/, "")}`;
+}
+
+export function deriveTitle(concept: { id: string; path: string; frontmatter: ConceptFrontmatter }): string {
+  if (typeof concept.frontmatter.title === "string") return concept.frontmatter.title;
+  const title = path.posix.basename(concept.path).replace(/\.md$/i, "").split(/[-_\s]+/)
+    .filter(Boolean).map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ");
+  return title === "" ? concept.id : title;
+}
````

````diff
diff --git a/src/review.ts b/src/review.ts
new file mode 100644
index 0000000..1718a2f
--- /dev/null
+++ b/src/review.ts
@@ -0,0 +1,165 @@
+// Consolidated editorial inbox: drafts waiting for promotion, open questions,
+// and archive-health work. This is the human judgment seam; deterministic
+// commands prepare evidence, but nothing promotes or answers itself.
+
+import { deriveTitle, splitFrontmatter } from "./okf.js";
+import { readdir, readFile } from "node:fs/promises";
+import { join } from "node:path";
+import { DRAFTS_DIRNAME, EVIDENCE_SUFFIX } from "./capture.js";
+import { isPlainMap, type WhyBundle } from "./bundle.js";
+import { buildDoctorReport, type DoctorSectionKey } from "./doctor.js";
+
+export interface ReviewItem {
+  id: string;
+  title: string;
+  kind: "draft" | "question";
+  owner: string | null;
+  captured_on: string | null;
+  review_by: string | null;
+  age_days: number | null;
+  overdue: boolean;
+}
+
+export interface MaintenanceItem {
+  section: DoctorSectionKey;
+  severity: "red" | "yellow";
+  text: string;
+}
+
+export interface ReviewReport {
+  root: string;
+  as_of: string;
+  drafts: ReviewItem[];
+  questions: ReviewItem[];
+  maintenance: MaintenanceItem[];
+  total: number;
+  overdue: number;
+  unassigned: number;
+}
+
+function maintenanceText(item: unknown): string {
+  if (!isPlainMap(item)) return String(item);
+  const preferred = ["concept", "file", "path", "lines", "review_by", "expired_on", "rule", "message", "reason"];
+  const parts = preferred
+    .filter((key) => item[key] !== undefined)
+    .map((key) => key === "concept" || key === "file" ? String(item[key]) : `${key} ${String(item[key])}`);
+  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(item);
+}
+
+function dateString(value: unknown): string | null {
+  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
+  return null;
+}
+
+function daysSince(date: string | null, now: Date): number | null {
+  if (date === null) return null;
+  const then = Date.parse(`${date}T00:00:00.000Z`);
+  if (!Number.isFinite(then)) return null;
+  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
+}
+
+function isOverdue(date: string | null, today: string): boolean {
+  return date !== null && date < today;
+}
+
+async function readDrafts(bundle: WhyBundle, now: Date, today: string): Promise<ReviewItem[]> {
+  const dir = join(bundle.root, DRAFTS_DIRNAME);
+  let names: string[];
+  try {
+    names = await readdir(dir);
+  } catch (error) {
+    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
+    throw error;
+  }
+  const items: ReviewItem[] = [];
+  for (const name of names.sort()) {
+    if (!name.endsWith(".md") || name.endsWith(EVIDENCE_SUFFIX)) continue;
+    const split = splitFrontmatter(await readFile(join(dir, name), "utf8"));
+    const data = split.data;
+    const why = data !== null && isPlainMap(data.why) ? data.why : {};
+    const capturedOn = dateString(why.captured_on);
+    const reviewBy = dateString(why.review_by);
+    items.push({
+      id: name,
+      title: data !== null && typeof data.title === "string" ? data.title : name.replace(/\.md$/, ""),
+      kind: "draft",
+      owner: typeof why.owner === "string" && why.owner.trim() !== "" ? why.owner : null,
+      captured_on: capturedOn,
+      review_by: reviewBy,
+      age_days: daysSince(capturedOn, now),
+      overdue: isOverdue(reviewBy, today),
+    });
+  }
+  return items;
+}
+
+export async function buildReviewReport(bundle: WhyBundle, now: Date = new Date()): Promise<ReviewReport> {
+  const today = now.toISOString().slice(0, 10);
+  const drafts = await readDrafts(bundle, now, today);
+  const questions = [...bundle.concepts.values()]
+    .filter((concept) => concept.frontmatter.type === "question" && concept.why.status === "open")
+    .map((concept): ReviewItem => {
+      const capturedOn = concept.why.captured_on ?? concept.why.happened_on ?? null;
+      const reviewBy = concept.why.review_by ?? null;
+      return {
+        id: concept.id,
+        title: deriveTitle(concept),
+        kind: "question",
+        owner: concept.why.owner ?? null,
+        captured_on: capturedOn,
+        review_by: reviewBy,
+        age_days: daysSince(capturedOn, now),
+        overdue: isOverdue(reviewBy, today),
+      };
+    })
+    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.id.localeCompare(b.id));
+
+  const doctor = await buildDoctorReport(bundle, { now });
+  const maintenance: MaintenanceItem[] = [];
+  for (const [key, section] of Object.entries(doctor.sections)) {
+    if (key === "openQuestions") continue;
+    for (const item of section.items) {
+      maintenance.push({
+        section: key as DoctorSectionKey,
+        severity: section.severity,
+        text: maintenanceText(item),
+      });
+    }
+  }
+  const editorial = [...drafts, ...questions];
+  return {
+    root: bundle.root,
+    as_of: today,
+    drafts,
+    questions,
+    maintenance,
+    total: editorial.length + maintenance.length,
+    overdue: editorial.filter((item) => item.overdue).length,
+    unassigned: editorial.filter((item) => item.owner === null).length,
+  };
+}
+
+function queueLine(item: ReviewItem): string {
+  const flags = [item.overdue ? "OVERDUE" : undefined, item.owner ?? "unassigned"].filter(Boolean).join(" · ");
+  const age = item.age_days === null ? "age unknown" : `${item.age_days}d old`;
+  const due = item.review_by === null ? "no review date" : `review by ${item.review_by}`;
+  return `  ${item.id} — ${item.title}\n    ${flags} · ${age} · ${due}`;
+}
+
+export function renderReviewReport(report: ReviewReport): string[] {
+  const lines = [
+    `why review: ${report.total} item(s) at ${report.root}`,
+    `  ${report.overdue} overdue · ${report.unassigned} unassigned · as of ${report.as_of}`,
+    "",
+    `Drafts (${report.drafts.length})`,
+  ];
+  if (report.drafts.length === 0) lines.push("  none");
+  else for (const item of report.drafts) lines.push(...queueLine(item).split("\n"));
+  lines.push("", `Open questions (${report.questions.length})`);
+  if (report.questions.length === 0) lines.push("  none");
+  else for (const item of report.questions) lines.push(...queueLine(item).split("\n"));
+  lines.push("", `Maintenance (${report.maintenance.length})`);
+  if (report.maintenance.length === 0) lines.push("  none");
+  else for (const item of report.maintenance) lines.push(`  ${item.severity} ${item.section}: ${item.text}`);
+  return lines;
+}
````

````diff
diff --git a/src/workflow.ts b/src/workflow.ts
new file mode 100644
index 0000000..8d20947
--- /dev/null
+++ b/src/workflow.ts
@@ -0,0 +1,199 @@
+// Outcome-oriented workflows over the lower-level commands. These modules
+// deepen the public interface without hiding the judgment seam: bootstrap
+// prepares bounded evidence for an agent; maintain performs everything that
+// is safe and deterministic in one run.
+
+import { mkdir, writeFile } from "node:fs/promises";
+import { dirname, join } from "node:path";
+import { resolveAnchors, writeAnchorUpdates, type AnchorReport } from "./anchor.js";
+import { auditBundle, type AuditReport } from "./audit.js";
+import { CACHE_DIRNAME, ensureSelfIgnoringDir } from "./anchors.js";
+import { loadBundle, type WhyBundle } from "./bundle.js";
+import { extractEpisodes } from "./dig.js";
+import { withDigState } from "./dig-state.js";
+import { buildDoctorReport, type DoctorReport } from "./doctor.js";
+import { buildEvidencePack, readEpisodes } from "./evidence.js";
+import { lintBundle, type Finding } from "./lint.js";
+import { buildReviewReport, type ReviewReport } from "./review.js";
+import { git } from "./git.js";
+
+export class WorkflowError extends Error {}
+
+export interface BootstrapOptions {
+  evidenceDir?: string;
+  maxChars?: number;
+  full?: boolean;
+}
+
+export interface BootstrapReport {
+  root: string;
+  branch: string;
+  head: string;
+  episodes: number;
+  workspace: string | null;
+  handoff: string | null;
+  alreadyCurrent: boolean;
+}
+
+function handoffMarkdown(episodeFiles: string[]): string {
+  return [
+    "# why bootstrap handoff",
+    "",
+    "The deterministic cold-start pass is complete. Rationale remains an editorial",
+    "judgment: run the `skills/dig` skill once for each evidence pack below, in",
+    "order, then run `skills/dig-synthesize` once for the batch.",
+    "",
+    ...episodeFiles.map((file) => `- [ ] ${file}`),
+    "",
+    "Finish with `why maintain`, then spot-check the result with `why impact` and `why blame`.",
+    "",
+  ].join("\n");
+}
+
+export async function bootstrapBundle(
+  bundle: WhyBundle,
+  options: BootstrapOptions = {},
+): Promise<BootstrapReport> {
+  const repo = dirname(bundle.root);
+  let built: BootstrapReport | undefined;
+  const result = await withDigState(repo, bundle.root, { full: options.full === true }, async (range) => {
+    const report = extractEpisodes(repo, range.from === undefined ? { to: range.head } : { from: range.from, to: range.head });
+    const episodes = readEpisodes(JSON.stringify(report), "bootstrap episodes");
+    const cache = join(bundle.root, CACHE_DIRNAME);
+    await ensureSelfIgnoringDir(cache);
+    const workspace = join(cache, "bootstrap", range.head.slice(0, 12));
+    const packsDir = join(workspace, "evidence");
+    await mkdir(packsDir, { recursive: true });
+    await writeFile(join(workspace, "episodes.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
+    const episodeFiles: string[] = [];
+    for (const episode of episodes) {
+      const pack = await buildEvidencePack(episode, {
+        repo,
+        evidenceDir: options.evidenceDir,
+        maxChars: options.maxChars,
+      });
+      const name = `${pack.episodeId.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`;
+      await writeFile(join(packsDir, name), pack.markdown, "utf8");
+      episodeFiles.push(`evidence/${name}`);
+    }
+    const handoff = join(workspace, "HANDOFF.md");
+    await writeFile(handoff, handoffMarkdown(episodeFiles), "utf8");
+    built = {
+      root: bundle.root,
+      branch: range.branch,
+      head: range.head,
+      episodes: episodes.length,
+      workspace,
+      handoff,
+      alreadyCurrent: false,
+    };
+  });
+  return built ?? {
+    root: bundle.root,
+    branch: result.branch,
+    head: result.head,
+    episodes: 0,
+    workspace: null,
+    handoff: null,
+    alreadyCurrent: true,
+  };
+}
+
+export function renderBootstrapReport(report: BootstrapReport): string[] {
+  if (report.alreadyCurrent) {
+    return [`why bootstrap: ${report.branch} is current at ${report.head.slice(0, 12)} — no new history to prepare`];
+  }
+  return [
+    `why bootstrap: prepared ${report.episodes} episode(s) through ${report.head.slice(0, 12)}`,
+    `  workspace ${report.workspace}`,
+    `  handoff   ${report.handoff}`,
+    "  next      complete the handoff, then run `why maintain`",
+  ];
+}
+
+export interface MaintainReport {
+  root: string;
+  anchors: AnchorReport;
+  anchorsWritten: string[];
+  audit: AuditReport;
+  doctor: DoctorReport;
+  review: ReviewReport;
+  lint: Finding[];
+  healthy: boolean;
+}
+
+export async function maintainBundle(bundle: WhyBundle): Promise<MaintainReport> {
+  const repo = dirname(bundle.root);
+  const current = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
+  const integration = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
+  if (current.status === 0 && integration.status === 0) {
+    const branch = current.stdout.trim();
+    const target = integration.stdout.trim().replace(/^origin\//, "");
+    if (branch !== target) {
+      throw new WorkflowError(
+        `refusing to write maintenance updates on branch ${branch}; switch to ${target}, or use the read-only ` +
+          "`why lint`, `why anchor --check --allow-drift`, and `why review` commands",
+      );
+    }
+  }
+  const beforeLint = await lintBundle(bundle);
+  if (beforeLint.some((finding) => finding.severity === "error")) {
+    const doctor = await buildDoctorReport(bundle);
+    const review = await buildReviewReport(bundle);
+    return {
+      root: bundle.root,
+      anchors: { head: doctor.head ?? "unknown", results: [], skipped: [] },
+      anchorsWritten: [],
+      audit: {
+        root: bundle.root,
+        activeConstraints: 0,
+        checks: [],
+        asks: [],
+        reviewByPastDue: [],
+        unverifiable: [{ concept: "(bundle)", reason: "lint errors must be fixed before maintenance can write" }],
+        expired: [],
+        alreadyExpired: [],
+        questionsWritten: [],
+        questionnaire: null,
+      },
+      doctor,
+      review,
+      lint: beforeLint,
+      healthy: false,
+    };
+  }
+  const anchors = await resolveAnchors(bundle);
+  const anchorsWritten = await writeAnchorUpdates(bundle, anchors);
+  const afterAnchors = await loadBundle(bundle.root);
+  const audit = await auditBundle(afterAnchors);
+  const fresh = await loadBundle(bundle.root);
+  const lint = await lintBundle(fresh);
+  const doctor = await buildDoctorReport(fresh);
+  const review = await buildReviewReport(fresh);
+  return {
+    root: bundle.root,
+    anchors,
+    anchorsWritten,
+    audit,
+    doctor,
+    review,
+    lint,
+    healthy:
+      !lint.some((finding) => finding.severity === "error") &&
+      doctor.healthy &&
+      audit.unverifiable.length === 0 &&
+      !audit.checks.some((check) => check.outcome === "error"),
+  };
+}
+
+export function renderMaintainReport(report: MaintainReport): string[] {
+  const changed = report.anchors.results.filter((result) => result.changed).length;
+  return [
+    `why maintain: ${report.healthy ? "healthy" : "needs attention"} at ${report.root}`,
+    `  anchors  ${report.anchors.results.length} checked · ${changed} updated · ${report.anchorsWritten.length} concept file(s) written`,
+    `  audit    ${report.audit.activeConstraints} active constraint(s) · ${report.audit.expired.length} expired this run · ${report.audit.unverifiable.length} unverifiable`,
+    `  archive  ${report.doctor.red} red · ${report.doctor.yellow} yellow · ${report.lint.length} lint finding(s)`,
+    `  inbox    ${report.review.total} item(s) · ${report.review.overdue} overdue · ${report.review.unassigned} unassigned`,
+    "  next     run `why review` for the editorial queue",
+  ];
+}
````

````diff
diff --git a/test/audit.test.ts b/test/audit.test.ts
index 02205cc..128e7e7 100644
--- a/test/audit.test.ts
+++ b/test/audit.test.ts
@@ -160,9 +160,13 @@ test("failing check: flip + evidence + blast radius (transitive) + questions, th
       "questions/is-retries-still-needed.md",
     ]);
     const question = await readFile(join(bundle, "questions/is-deadline-still-needed.md"), "utf8");
-    assert.ok(question.includes("(/constraints/acme-cap.md)"), question);
-    assert.ok(question.includes("(/decisions/deadline.md)"), question);
+    assert.ok(question.includes("(../constraints/acme-cap.md)"), question);
+    assert.ok(question.includes("(../decisions/deadline.md)"), question);
     assert.match(question, /status: open/);
+    const queued = (await loadBundle(bundle)).concepts.get("questions/is-deadline-still-needed")!;
+    assert.equal(queued.why.captured_on, expired.expired_on);
+    assert.ok(queued.why.review_by !== undefined && queued.why.review_by > expired.expired_on);
+    assert.equal(queued.why.owner, undefined, "generated questions stay visibly unassigned");
 
     // Everything audit wrote lints clean (expired_on present, sections intact).
     const lint = capture();
````

````diff
diff --git a/test/capture.test.ts b/test/capture.test.ts
index 723b29a..daae983 100644
--- a/test/capture.test.ts
+++ b/test/capture.test.ts
@@ -11,7 +11,7 @@ import { existsSync } from "node:fs";
 import { mkdtemp } from "node:fs/promises";
 import { tmpdir } from "node:os";
 import { basename, join } from "node:path";
-import { splitFrontmatter } from "@copperbox/okf-mcp";
+import { splitFrontmatter } from "../src/okf.ts";
 import { parseLineRange } from "../src/anchors.ts";
 import { loadBundle } from "../src/bundle.ts";
 import {
@@ -165,7 +165,7 @@ test("merged PR → decision draft: verbatim quotes, PR + merge-commit citations
   const mergeSha = shas[1]!;
   const bundle = await loadBundle(whyRoot);
   const { runner } = fixtureRunner(prFixture(mergeSha));
-  const result = await capturePr(bundle, 7, { runner });
+  const result = await capturePr(bundle, 7, { runner, now: new Date("2026-07-04T12:00:00Z") });
 
   assert.equal(result.type, "decision");
   assert.equal(basename(result.draftPath), "pr-7-replace-striped-locks-with-queue.md");
@@ -177,6 +177,9 @@ test("merged PR → decision draft: verbatim quotes, PR + merge-commit citations
   const why = whyOf(data);
   assert.equal(why.status, "active");
   assert.equal(why.happened_on, "2026-07-02");
+  assert.equal(why.owner, "@jane");
+  assert.equal(why.captured_on, "2026-07-04");
+  assert.equal(why.review_by, "2026-07-18");
   assert.equal(why.confidence, "recorded");
   assert.deepEqual(why.anchors, [
     { path: "src/lock.rs", lines: "3-5", as_of: mergeSha, state: "live" },
@@ -310,7 +313,7 @@ test("drafts never serve: bundle loads skip .drafts/, blame finds nothing, lint
 
 // --- Promotion --------------------------------------------------------------------
 
-test("promotion: lint-clean draft moves into its type dir, gets a timestamp, and starts serving", async () => {
+test("promotion: lint-clean draft moves into its type dir, gets v0.2 provenance, and starts serving", async () => {
   const { repo, whyRoot, shas } = await seedRepo();
   const bundle = await loadBundle(whyRoot);
   const result = await captureCommit(bundle, shas[1]!, { runner: runCommand });
@@ -324,7 +327,8 @@ test("promotion: lint-clean draft moves into its type dir, gets a timestamp, and
   assert.ok(!existsSync(result.evidencePath), "evidence sidecar removed after promote");
 
   const { data } = await readDraft(target);
-  assert.ok(typeof data.timestamp === "string" && data.timestamp !== "", "writeConcept stamps timestamp");
+  assert.ok(typeof data.generated === "object" && data.generated !== null, "writeConcept stamps generated provenance");
+  assert.equal(data.timestamp, undefined, "a v0.2 bundle never receives legacy timestamp provenance");
 
   const lint = capture();
   assert.equal(await main(["lint", whyRoot], repo, lint.io), 0, lint.err.join("\n"));
````

````diff
diff --git a/test/impact.test.ts b/test/impact.test.ts
new file mode 100644
index 0000000..0f2257d
--- /dev/null
+++ b/test/impact.test.ts
@@ -0,0 +1,113 @@
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { rm } from "node:fs/promises";
+import { loadBundle } from "../src/bundle.ts";
+import { buildImpactReport, parseDiff } from "../src/impact.ts";
+import { main } from "../src/cli.ts";
+import { capture, git, makeRepo, write } from "./helpers.ts";
+
+test("parseDiff keeps new-side hunks, pure deletions, and renamed paths", () => {
+  const files = parseDiff([
+    "diff --git a/src/a.ts b/src/a.ts",
+    "--- a/src/a.ts",
+    "+++ b/src/a.ts",
+    "@@ -2,1 +2,2 @@",
+    "diff --git a/src/old.ts b/src/new.ts",
+    "similarity index 90%",
+    "--- a/src/old.ts",
+    "+++ b/src/new.ts",
+    "@@ -8,1 +8,0 @@",
+  ].join("\n"));
+  assert.deepEqual(files, [
+    { path: "src/a.ts", lines: [{ start: 2, end: 3 }], deleted: false },
+    { path: "src/new.ts", lines: [{ start: 8, end: 8 }], deleted: false },
+  ]);
+});
+
+test("impact reports exact and same-file concepts plus only causally upstream expiry", async () => {
+  const repo = await makeRepo("why-impact-");
+  try {
+    await write(repo, "src/a.ts", "one\ntwo\nthree\nfour\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "initial");
+    const asOf = git(repo, "rev-parse", "HEAD");
+    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
+    await write(repo, ".why/decisions/exact.md", `---
+type: decision
+title: Exact decision
+why:
+  status: active
+  confidence: recorded
+  anchors:
+    - path: src/a.ts
+      lines: 2
+      as_of: ${asOf}
+      state: live
+---
+
+# Exact decision
+
+# Why
+
+Because.
+
+# Because of
+
+- [Old constraint](/constraints/old.md)
+`);
+    await write(repo, ".why/decisions/same-file.md", `---
+type: decision
+title: Same-file decision
+why:
+  status: active
+  anchors:
+    - path: src/a.ts
+      lines: 4
+      as_of: ${asOf}
+      state: live
+---
+
+# Same-file decision
+
+# Why
+
+Because.
+`);
+    await write(repo, ".why/constraints/old.md", `---
+type: constraint
+title: Old constraint
+why:
+  status: expired
+  expired_on: 2026-01-01
+---
+
+# Old constraint
+
+# Still true?
+
+No.
+`);
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "record why");
+    await write(repo, "src/a.ts", "one\nTWO\nthree\nfour\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "change the decision line");
+
+    const report = buildImpactReport(await loadBundle(`${repo}/.why`), "HEAD~1..HEAD");
+    assert.deepEqual(report.concepts.map((item) => [item.id, item.overlaps_hunk]), [
+      ["decisions/exact", true],
+      ["decisions/same-file", false],
+    ]);
+    assert.deepEqual(report.expired_constraints, [{
+      id: "constraints/old",
+      title: "Old constraint",
+      expired_on: "2026-01-01",
+      affects: ["decisions/exact"],
+    }]);
+    const cli = capture();
+    assert.equal(await main(["impact", "HEAD~1..HEAD", "--bundle", `${repo}/.why`, "--json"], repo, cli.io), 0);
+    assert.equal(JSON.parse(cli.out.join("\n")).concepts.length, 2);
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
````

````diff
diff --git a/test/init.test.ts b/test/init.test.ts
index 47b8544..fd0c429 100644
--- a/test/init.test.ts
+++ b/test/init.test.ts
@@ -9,9 +9,11 @@ import { loadBundle, validateBundle } from "@copperbox/okf-mcp";
 import { main } from "../src/cli.ts";
 import {
   InitError,
+  OKF_CONFIG_FILENAME,
   SNIPPET_BEGIN,
   SNIPPET_END,
   writeCaptureSnippet,
+  writeOkfConfig,
 } from "../src/init.ts";
 import { capture } from "./helpers.ts";
 
@@ -52,7 +54,7 @@ test("init scaffolds a bundle that okf-mcp validates with zero errors", async ()
     assert.deepEqual(dirs, ["attempts", "constraints", "decisions", "incidents", "questions"]);
 
     const index = await readFile(join(root, "index.md"), "utf8");
-    assert.ok(index.includes('okf_version: "0.1"'), index);
+    assert.ok(index.includes('okf_version: "0.2"'), index);
     assert.ok(index.includes("generated: false"), index);
     assert.ok(index.includes(`description: Decision archive for ${basename(repo)}`), index);
 
@@ -65,8 +67,10 @@ test("init scaffolds a bundle that okf-mcp validates with zero errors", async ()
     assert.deepEqual(report.warnings, []);
 
     const text = out.join("\n");
-    assert.ok(text.includes("okf-mcp"), `next steps should show the mount command: ${text}`);
-    assert.ok(text.includes("why dig"), `next steps should point at why dig: ${text}`);
+    assert.ok(text.includes("okf-mcp"), `next steps should show the server command: ${text}`);
+    const config = JSON.parse(await readFile(join(repo, OKF_CONFIG_FILENAME), "utf8"));
+    assert.deepEqual(config.bundles[basename(repo)], { path: ".why", writable: true });
+    assert.ok(text.includes("why bootstrap"), `next steps should point at why bootstrap: ${text}`);
   } finally {
     await rm(repo, { recursive: true, force: true });
   }
@@ -121,6 +125,26 @@ test("init outside a git repository exits 1 with a clear message", async () => {
   }
 });
 
+test("okf config registration preserves other mounts and refuses an explicit read-only conflict", async () => {
+  const repo = await makeGitRepo();
+  try {
+    const configPath = join(repo, OKF_CONFIG_FILENAME);
+    await writeFile(configPath, JSON.stringify({ bundles: { team: "../team" }, searchLimit: 20 }));
+    assert.equal(await writeOkfConfig(repo), "updated");
+    const updated = JSON.parse(await readFile(configPath, "utf8"));
+    assert.equal(updated.bundles.team, "../team");
+    assert.deepEqual(updated.bundles[basename(repo)], { path: ".why", writable: true });
+    assert.equal(updated.searchLimit, 20);
+
+    updated.bundles[basename(repo)].writable = false;
+    await writeFile(configPath, JSON.stringify(updated));
+    assert.equal(await writeOkfConfig(repo), "conflict");
+    assert.equal(JSON.parse(await readFile(configPath, "utf8")).bundles[basename(repo)].writable, false);
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
+
 test("--capture-snippet creates CLAUDE.md with one marked block", async () => {
   const repo = await makeGitRepo();
   try {
````

````diff
diff --git a/test/review.test.ts b/test/review.test.ts
new file mode 100644
index 0000000..be7b6a4
--- /dev/null
+++ b/test/review.test.ts
@@ -0,0 +1,62 @@
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { mkdir, rm } from "node:fs/promises";
+import { loadBundle } from "../src/bundle.ts";
+import { buildReviewReport, renderReviewReport } from "../src/review.ts";
+import { git, makeRepo, write } from "./helpers.ts";
+
+test("review is one queue for owned drafts, overdue questions, and maintenance", async () => {
+  const repo = await makeRepo("why-review-");
+  try {
+    await mkdir(`${repo}/.why/.drafts`, { recursive: true });
+    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
+    await write(repo, ".why/.drafts/pr-7.md", `---
+type: decision
+title: Captured choice
+why:
+  status: active
+  owner: '@jane'
+  captured_on: 2026-07-01
+  review_by: 2026-07-15
+---
+
+# Captured choice
+
+# Why
+
+Because.
+`);
+    await write(repo, ".why/questions/open.md", `---
+type: question
+title: Who owns this?
+why:
+  status: open
+  happened_on: 2026-07-10
+  review_by: 2026-09-01
+---
+
+# Who owns this?
+`);
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "queue");
+    const report = await buildReviewReport(await loadBundle(`${repo}/.why`), new Date("2026-08-01T12:00:00Z"));
+    assert.equal(report.total, 2);
+    assert.equal(report.overdue, 1);
+    assert.equal(report.unassigned, 1);
+    assert.deepEqual(report.drafts[0], {
+      id: "pr-7.md",
+      title: "Captured choice",
+      kind: "draft",
+      owner: "@jane",
+      captured_on: "2026-07-01",
+      review_by: "2026-07-15",
+      age_days: 31,
+      overdue: true,
+    });
+    const text = renderReviewReport(report).join("\n");
+    assert.match(text, /OVERDUE · @jane · 31d old/);
+    assert.match(text, /unassigned/);
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
````

````diff
diff --git a/test/skills.test.ts b/test/skills.test.ts
index 051b0d4..d9f93c6 100644
--- a/test/skills.test.ts
+++ b/test/skills.test.ts
@@ -31,6 +31,10 @@ const DOC_PATHS = [
  * plan (Phases 1–4 plus the Phase 5/6 UI surface: `export`, `serve`). */
 const IMPLEMENTED_SUBCOMMANDS = new Set([
   "init",
+  "bootstrap",
+  "maintain",
+  "review",
+  "impact",
   "lint",
   "blame",
   "anchor",
@@ -47,6 +51,7 @@ const IMPLEMENTED_SUBCOMMANDS = new Set([
 const NON_TOOL_TOKENS = new Set([
   "child_process",
   "happened_on",
+  "captured_on",
   "expired_on",
   "as_of",
   "review_by",
@@ -54,6 +59,7 @@ const NON_TOOL_TOKENS = new Set([
   "retry_jitter",
   "acquire_shared",
   "pull_request",
+  "base_ref",
   "workflow_dispatch",
   "node_modules",
 ]);
@@ -114,8 +120,10 @@ test("docs reference only why subcommands that exist at this point in the plan",
 });
 
 test("docs name only okf-mcp tools that actually exist", () => {
-  const okfReadme = read("node_modules/@copperbox/okf-mcp/README.md");
-  const tools = new Set([...okfReadme.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]!));
+  // The published 1.x package keeps its tool catalog in runtime registration
+  // code; docs/tools.md is linked from README but intentionally not packed.
+  const server = read("node_modules/@copperbox/okf-mcp/dist/server.js");
+  const tools = new Set([...server.matchAll(/registerTool\("([a-z_]+)"/g)].map((m) => m[1]!));
   for (const known of ["search_concepts", "get_concept", "write_concept", "update_concept"]) {
     assert.ok(tools.has(known), `okf-mcp README table no longer lists ${known} — update this test`);
   }
````

````diff
diff --git a/test/workflow.test.ts b/test/workflow.test.ts
new file mode 100644
index 0000000..c5918a9
--- /dev/null
+++ b/test/workflow.test.ts
@@ -0,0 +1,95 @@
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { existsSync } from "node:fs";
+import { readFile, rm } from "node:fs/promises";
+import { loadBundle } from "../src/bundle.ts";
+import { scaffoldBundle } from "../src/init.ts";
+import { bootstrapBundle, maintainBundle, WorkflowError } from "../src/workflow.ts";
+import { git, makeRepo, write } from "./helpers.ts";
+
+test("bootstrap prepares episodes, evidence, and one agent handoff, then becomes current", async () => {
+  const repo = await makeRepo("why-bootstrap-");
+  try {
+    await write(repo, "src/a.ts", "export const a = 1;\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "first choice\n\nBecause the old value timed out.");
+    const root = await scaffoldBundle(repo);
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "add why bundle");
+    const first = await bootstrapBundle(await loadBundle(root), { full: true });
+    assert.equal(first.alreadyCurrent, false);
+    assert.ok(first.episodes > 0);
+    assert.ok(first.handoff !== null && existsSync(first.handoff));
+    const handoff = await readFile(first.handoff!, "utf8");
+    assert.match(handoff, /skills\/dig/);
+    assert.match(handoff, /skills\/dig-synthesize/);
+    const second = await bootstrapBundle(await loadBundle(root));
+    assert.equal(second.alreadyCurrent, true);
+    assert.equal(second.episodes, 0);
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
+
+test("maintain re-anchors drift and returns the consolidated health and review result", async () => {
+  const repo = await makeRepo("why-maintain-");
+  try {
+    await write(repo, "src/a.ts", "one\ntwo\nthree\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "initial");
+    const asOf = git(repo, "rev-parse", "HEAD");
+    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
+    await write(repo, ".why/decisions/a.md", `---
+type: decision
+title: Keep two
+why:
+  status: active
+  anchors:
+    - path: src/a.ts
+      lines: 2
+      as_of: ${asOf}
+      state: live
+---
+
+# Keep two
+
+# Why
+
+Because.
+`);
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "record why");
+    await write(repo, "src/a.ts", "zero\none\ntwo\nthree\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "shift lines");
+    const report = await maintainBundle(await loadBundle(`${repo}/.why`));
+    assert.equal(report.healthy, true);
+    assert.equal(report.anchorsWritten.length, 1);
+    assert.equal(report.review.total, 0);
+    const updated = await readFile(`${repo}/.why/decisions/a.md`, "utf8");
+    assert.match(updated, /lines: 3/);
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
+
+test("maintain refuses writes away from the known integration branch", async () => {
+  const repo = await makeRepo("why-maintain-branch-");
+  try {
+    await write(repo, "src/a.ts", "one\n");
+    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
+    git(repo, "add", ".");
+    git(repo, "commit", "-qm", "initial");
+    git(repo, "branch", "-M", "main");
+    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
+    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
+    git(repo, "switch", "-qc", "feature/work");
+    const bundle = await loadBundle(`${repo}/.why`);
+    await assert.rejects(
+      () => maintainBundle(bundle),
+      (error: unknown) => error instanceof WorkflowError && /switch to main/.test(error.message),
+    );
+  } finally {
+    await rm(repo, { recursive: true, force: true });
+  }
+});
````
