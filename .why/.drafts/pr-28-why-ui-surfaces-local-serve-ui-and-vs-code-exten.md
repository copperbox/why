---
type: decision
title: "Why UI surfaces: local serve UI and VS Code extension"
description: "Draft captured from PR #28 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: .gitignore
      lines: 4-6
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: DESIGN.md
      lines: 178-179
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: DESIGN.md
      lines: "181"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: docs/ui-contract.md
      lines: 3-4
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: docs/ui-contract.md
      lines: 9-21
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: docs/ui-contract.md
      lines: 25-27
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: docs/ui-contract.md
      lines: 288-368
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: docs/vscode.md
      lines: 1-129
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: package-lock.json
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: package.json
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: README.md
      lines: "106"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: schemas/doctor.schema.json
      lines: 1-61
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: schemas/files.schema.json
      lines: 1-18
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: schemas/gitblame.schema.json
      lines: 1-52
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: src/cli.ts
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: src/doctor.ts
      lines: 265-343
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: src/doctor.ts
      lines: 377-383
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: src/serve-assets.ts
      lines: 1-63
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: src/serve.ts
      lines: 1-290
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/e2e/serve.e2e.test.ts
      lines: 1-70
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/helpers.ts
      lines: "6"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/helpers.ts
      lines: "9"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/helpers.ts
      lines: 47-68
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/serve-dom.test.ts
      lines: 1-159
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/serve.test.ts
      lines: 1-264
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/skills.test.ts
      lines: 21-28
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/skills.test.ts
      lines: "31"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/skills.test.ts
      lines: "42"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/skills.test.ts
      lines: "57"
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/ui-contract.test.ts
      lines: 33-35
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/ui-contract.test.ts
      lines: 323-327
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/ui-contract.test.ts
      lines: 331-333
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: test/ui-contract.test.ts
      lines: 345-347
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: ui/app.js
      lines: 1-316
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: ui/graph.js
      lines: 1-164
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: ui/story-panel.d.ts
      lines: 1-9
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: ui/story-panel.js
      lines: 1-125
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: ui/style.css
      lines: 1-220
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/.vscodeignore
      lines: 1-10
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/LICENSE
      lines: 1-21
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/package-lock.json
      lines: 1-4742
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/package.json
      lines: 1-72
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/README.md
      lines: 1-44
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/core/cli-locate.ts
      lines: 1-53
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/core/contract.ts
      lines: 1-287
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/core/decorations.ts
      lines: 1-81
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/core/hover.ts
      lines: 1-81
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/core/story-html.ts
      lines: 1-144
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/src/extension.ts
      lines: 1-238
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test-integration/run.ts
      lines: 1-29
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test-integration/suite.ts
      lines: 1-23
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/cli-locate.test.ts
      lines: 1-63
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/contract.test.ts
      lines: 1-100
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/decorations.test.ts
      lines: 1-76
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/fixtures/coverage.json
      lines: 1-46
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/fixtures/story.json
      lines: 1-59
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/hover.test.ts
      lines: 1-106
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/test/story-html.test.ts
      lines: 1-61
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/tsconfig.build.json
      lines: 1-13
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
    - path: vscode-why/tsconfig.json
      lines: 1-13
      as_of: 61a4e85c359faa26997a12af016ba47f5d0db650
      state: live
---

# Why UI surfaces: local serve UI and VS Code extension

<!-- capture draft from PR #28 (merged 2026-07-13). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: package-lock.json: 56 hunks collapsed into one whole-file anchor -->
<!-- capture: package.json: 6 hunks collapsed into one whole-file anchor -->
<!-- capture: src/cli.ts: 6 hunks collapsed into one whole-file anchor -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-28-why-ui-surfaces-local-serve-ui-and-vs-code-exten.evidence.md (removed on promote) -->

> <!-- sandcastle-feature: {"slug":"ui-surfaces","branch":"sandcastle/feature-ui-surfaces","members":[{"id":"21","title":"`why serve` — standalone local UI: blame gutter + story panel + graph"},{"id":"22","title":"VS Code extension: why annotations inline, GitLens-style"}]} -->
>
> **Automated feature branch assembled by Sandcastle.** Review the changes and merge into `main` when ready.
>
> ### Issues in this feature
> - [x] #21 `why serve` — standalone local UI: blame gutter + story panel + graph
> - [x] #22 VS Code extension: why annotations inline, GitLens-style
>
> ### Release
> `v0.8.0` (minor bump)
>
> ### Summary
> ## What & why
>
> Adds two new ways to consume `why` bundles beyond the CLI:
>
> 1. **`why serve`** — a standalone, localhost-only web UI showing git blame and why-blame side by side, with a story panel and constraint graph.
> 2. **VS Code extension (`vscode-why/`)** — inline why annotations GitLens-style: gutter stripes by confidence, hover cards, and a "Show Story" webview.
>
> Both are pure consumers of the UI contract — no engine logic duplicated into either surface.
>
> ## Changes
>
> **UI contract & schemas**
> - Extended `docs/ui-contract.md` and added `schemas/{files,gitblame,doctor}.schema.json` to cover file content, git blame, and doctor summary payloads.
> - `doctor.ts` now exposes a shared `buildDoctorSummary`/`ITEM_TEXT` so CLI and UI render identical findings text.
>
> **`why serve` (src/serve.ts, src/serve-assets.ts, ui/)**
> - Thin HTTP server wrapping existing library calls (`buildUiIndex`, `buildBlameReport`, `buildGraph`, `buildDoctorReport`); six endpoints, non-GET rejected with 405.
> - Strictly read-only: no `.cache` is ever written (verified byte-level in tests).
> - `gitblame` payload is served at HEAD so line numbers match coverage computed at the same HEAD.
> - Assets (`ui/app.js`, `story-panel.js`, `graph.js`, `style.css`) bundled in-memory via esbuild at server start; self-containment test scans for any external URLs.
> - Bundle reloads per request so edits/new HEAD show on refresh without staleness.
>
> **VS Code extension (`vscode-why/`)**
> - New standalone package: own `package.json`/tsconfig/lockfile, not an npm workspace member, excluded from root tsconfig/npm files — root `npm version` and publish never touch it.
> - Shells out to the `why` CLI (`export ui-index`, `blame --json`); zero engine logic lives in the extension.
> - Rendering logic isolated in `src/core/` (no `vscode` import): CLI discovery, contract parsing (schema-version aware), decoration mapping, hover cards (warnings first), story HTML rendering.
> - Staleness always noted when HEAD differs from coverage HEAD or can't be resolved.
> - Docs at `docs/vscode.md` (install-from-vsix + manual QA script).
>
> **Misc**
> - `test/helpers.ts`: extracted shared `makeHarborRepo` fixture used by both the serve endpoint suite and the optional e2e browser test.
>
> ## Review notes
>
> - Worth double-checking the workspace-isolation setup for `vscode-why/` (`.gitignore`, root `package.json` `files` whitelist, tsconfig `include` exclusion) — this is what keeps the root release/publish flow from touching the extension package.
> - `test:vscode` runs extension unit tests through the root `tsx` rather than the extension's own toolchain; confirms it works even with `vscode-why/node_modules` absent.
> - Browser/integration tiers (`test:e2e`, `vscode-why`'s `test:integration`) are optional and skip themselves without a display/deps — not part of `npm run verify`.
> - Test status: root `npm run verify` reported 268/268 (239 root + 29 extension) at the last commit before this bump; version bump commit itself changes no code.
>
> Closes #21
> Closes #22

— PR #28 description by @dantheuber

> This PR delivers both UI surfaces to a high standard: `why serve` is a genuinely thin, provably read-only localhost server (endpoints wrap the same library calls the CLI uses; the read-only test asserts a byte-identical tree and no cache write), the SPA is self-contained esbuild-bundled assets with a no-http(s)-references test, the DOM/jsdom smoke tests assert the hedge prefix and loud expired-constraint warning, and the VS Code extension isolates all logic in electron-free src/core/ with substantive unit tests (discovery order, contract parsing with forward-version refusal, decoration clipping, staleness, warning-first hovers, webview escaping). I verified beyond the green verify: started `why serve` against this repo's own .why/ (every endpoint 200, doctor healthy) and ran `vsce package` in vscode-why/ (clean .vsix, 11 files), and confirmed root verify passed with vscode-why/node_modules absent. It fails on one merge-blocking repo contract: DESIGN.md §8 still enumerates nine subcommands and states 'No daemon. Everything is a run-to-completion command suitable for CI' — `why serve` is a tenth subcommand that blocks until Ctrl-C, the PR's own README edit says 'all ten subcommands', and DESIGN.md is untouched. .sandcastle/CODING_STANDARDS.md's project invariants say a deviation must change DESIGN.md in the same diff with reasoning, and precedent (PR #27 amended §8 when adding `export`) confirms the practice. One remediation round to amend DESIGN.md (plus an optional cross-surface ordering alignment) and this merges.
>
> 1. DESIGN.md §8 ('Implementation shape') is not amended by this PR and now contradicts the shipped behavior twice: (1) the CLI enumeration `why dig | anchor | audit | blame | capture | lint | doctor | export | init` omits `serve` while README.md (edited in this PR) says 'all ten subcommands', and (2) the bullet '**No daemon.** Everything is a run-to-completion command suitable for CI' is false as written — `why serve` (src/serve.ts, src/cli.ts runServe) blocks until the server closes. Per .sandcastle/CODING_STANDARDS.md project invariant 'DESIGN.md is the contract... the PR must change DESIGN.md in the same diff with the reasoning, or it is wrong' (and precedent: PR #27 amended §8 when adding `export`). Correct looks like: add `serve` to the §8 CLI list, describe the two UI surfaces (`why serve` local read-only UI and the vscode-why/ extension) as dumb renderers of the docs/ui-contract.md payloads, and qualify the no-daemon bullet (e.g. 'no resident process is ever required — `why serve` is an optional, foreground, localhost-only viewer the user starts and stops; nothing in the pipeline depends on it').
> 2. ui/story-panel.js:111-112 renders hits before warnings, while both VS Code surfaces render the expired-upstream warning FIRST (vscode-why/src/core/hover.ts:613 `[...story.warnings, ...story.hits]`, story-html.ts whose header comment says 'ordered like the hovers... so both surfaces tell the same story'). For the harbor lock.rs:47 story the serve panel shows the Acme expired warning below the queue-based-locking hit, the extension above it — the same story told in opposite orders across surfaces, and warnings-last undercuts issue #21's 'expired-upstream warnings visually loud'. Correct looks like: in renderStoryPanel, append warning cards before hit cards, and extend test/serve-dom.test.ts to assert the warning card precedes the hit card in the DOM (compare positions via compareDocumentPosition or child order).

— PR #28 comment by @dantheuber (2026-07-13)

> PR #28 delivers both UI surfaces as pure consumers of the versioned UI contract: `why serve` (thin read-only 127.0.0.1 HTTP server wrapping the same library calls the CLI uses, six schema-valid JSON endpoints, self-contained esbuild-bundled SPA with blame gutter, warnings-first story panel, canvas graph, and doctor chips) and a `vscode-why/` extension (CLI shell-out only, theme-token decorations, hedge-verbatim hovers with expired-upstream warnings first, staleness notes, isolated packaging). Every acceptance criterion of issues #21 and #22 is met by identifiable code and tests that would fail if the behavior broke; DESIGN.md is amended in the same diff for the no-daemon exception. Beyond the green verify, I independently confirmed the three claims the verify run cannot prove: `why serve` on this repo's own bundle serves every endpoint with 200s, root `test:vscode` passes 29/29 with `vscode-why/node_modules` removed, and `vsce package --no-dependencies` produces the documented .vsix.

— PR #28 comment by @dantheuber (2026-07-13)

# Citations

[1] [PR #28: Why UI surfaces: local serve UI and VS Code extension](https://github.com/copperbox/why/pull/28)
[2] [merge commit 61a4e85](https://github.com/copperbox/why/commit/61a4e85c359faa26997a12af016ba47f5d0db650)
