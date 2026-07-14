---
type: decision
title: Coverage decorations are two independently-toggleable lanes, with the
  scrollbar mark off by default
description: The extension's always-on paint was split into gutter and
  overview-ruler lanes gated by why.decorations.* settings and a Toggle
  Annotations command; the scrollbar mark ships off because it stays visible
  when scrolled away. Hovers stay ungated.
tags:
  - ui
  - vscode
timestamp: 2026-07-14T17:22:50.291Z
why:
  status: active
  happened_on: 2026-07-14
  confidence: recorded
  anchors:
    - path: vscode-why/src/core/decorations.ts
      lines: 26-46
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/src/extension.ts
      symbol: paint
      lines: 131-141
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/src/extension.ts
      symbol: toggleAnnotations
      lines: 143-154
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package.json
      lines: 57-71
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: docs/vscode.md
      lines: 53-72
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: issues/504-decoration-toggle.md
      lines: 1-53
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
---

# Coverage decorations are two independently-toggleable lanes, with the scrollbar mark off by default

The extension's inline coverage paint is no longer a single always-on decoration type. It is two lanes — a gutter stripe in the number column and a mark in the scrollbar overview ruler — created as separate `TextEditorDecorationType`s so either can be hidden without the other. Three nested settings gate them: `why.decorations.enabled` (master, default `true`), `why.decorations.gutter` (default `true`), and `why.decorations.overviewRuler` (default **`false`**). The pure `visibleLanes()` helper resolves settings to lanes, with the master overriding both; `paint()` clears a hidden lane rather than skipping it, and `onDidChangeConfiguration` repaints from cached coverage with no CLI re-run. A `why: Toggle Annotations` palette command flips the master setting, writing to workspace scope when it is already set there, else global. Hovers and `why: Show Story` are untouched.

# Why

Recorded in the PR description, the merge commit message, and the spec of record in `issues/504-decoration-toggle.md` [1][2]. The paint is passive: before this it was on whenever the extension was active, and the only way to quiet it was to disable the extension outright. That is the right default for discovery but intrusive during regular editing — the scrollbar mark most of all, because it stays visible even when the covered code is scrolled away, so it ships off by default while the gutter stripe stays on.

The shape follows from that. The lanes are separate decoration types because a single type carrying both a border and an `overviewRulerColor` cannot hide one without the other. A hidden lane is cleared rather than skipped so no mark lingers after a toggle-off. The repaint listens on configuration change instead of re-running the CLI because coverage is already cached, which is what makes the toggle feel like one keystroke. Only the always-on paint is gated: hovers and *Show Story* are on-demand rather than passive, so they are never the thing you are trying to mute and stay available regardless.

# Because of

- [The VS Code extension is a standalone package that shells out to the CLI](/decisions/vscode-extension-standalone.md)

# Citations

[1] [PR #38: vscode: toggle for coverage decorations (scrollbar mark off by default)](https://github.com/copperbox/why/pull/38)
[2] [merge commit e31b5b3](https://github.com/copperbox/why/commit/e31b5b389e5a8a2c040098a88c5db748c206eb93)
