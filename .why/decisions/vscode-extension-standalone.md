---
type: decision
title: The VS Code extension is a standalone package that shells out to the CLI
description: vscode-why/ is its own package (not a workspace member) so root
  release/publish never touch it; it renders by shelling out to the why CLI,
  with all logic in an electron-free src/core/.
tags:
  - ui
  - vscode
timestamp: 2026-07-13T23:46:17.728Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: DESIGN.md
      lines: "179"
      as_of: 61a4e85
      state: live
    - path: vscode-why/package.json
      lines: 1-72
      as_of: 61a4e85
      state: live
    - path: vscode-why/src/extension.ts
      lines: 1-238
      as_of: 61a4e85
      state: live
    - path: vscode-why/src/core/contract.ts
      lines: 1-287
      as_of: 61a4e85
      state: live
    - path: vscode-why/src/core/cli-locate.ts
      lines: 1-53
      as_of: 61a4e85
      state: live
    - path: docs/vscode.md
      lines: 1-129
      as_of: 61a4e85
      state: live
---

# The VS Code extension is a standalone package that shells out to the CLI

`vscode-why/` gives `why` an inline, GitLens-style surface: gutter stripes by confidence, hover cards, and a "Show Story" webview. It is a standalone npm package — its own `package.json`, tsconfig, and lockfile — deliberately *not* an npm workspace member, and excluded from the root `files` whitelist and tsconfig. It renders by shelling out to the `why` CLI (`export ui-index`, `blame --json`) and holds zero engine logic; all rendering logic lives in an electron-free `src/core/` (CLI discovery, schema-version-aware contract parsing, decoration mapping, warnings-first hovers, story HTML).

# Why

Recorded in the PR's "What & why" and DESIGN.md §8 [1][2]. Like `serve`, the extension is a *pure consumer* of the UI contract — no engine logic is duplicated into it. Standalone packaging is the load-bearing choice: keeping `vscode-why/` out of the workspace and the root `files` whitelist means root `npm version` and publish never touch the extension, so the two release cadences stay independent. Shelling out to the CLI (rather than linking the library) keeps the surfaces decoupled and version-tolerant — contract parsing is schema-version aware and refuses forward versions rather than mis-rendering. Isolating logic in an electron-free `src/core/` (no `vscode` import) makes it unit-testable without the editor, which is why `test:vscode` passes even with `vscode-why/node_modules` absent. Staleness is always noted when HEAD differs from the coverage HEAD or can't be resolved.

# Because of

- [The UI ⇄ backend boundary is a versioned JSON data contract](/decisions/ui-data-contract.md)

# Citations

[1] [PR #28: Why UI surfaces: local serve UI and VS Code extension](https://github.com/copperbox/why/pull/28)
[2] [merge commit 61a4e85](https://github.com/copperbox/why/commit/61a4e85c359faa26997a12af016ba47f5d0db650)
