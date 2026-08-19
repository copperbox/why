---
type: decision
title: "`why serve` is a read-only, foreground, localhost-only viewer — the one
  no-daemon exception"
description: A thin HTTP server on 127.0.0.1 that wraps the same library calls
  the CLI uses, never writes, reloads per request, and serves self-contained
  in-memory-bundled assets.
tags:
  - ui
  - serve
timestamp: 2026-07-13T23:46:17.592Z
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: DESIGN.md
      lines: 193-196
      as_of: fa87a3b
      state: live
    - path: src/serve.ts
      as_of: 61a4e85
      state: live
    - path: src/serve-assets.ts
      as_of: 61a4e85
      state: live
    - path: ui/story-panel.js
      as_of: 61a4e85
      state: live
---

# `why serve` is a read-only, foreground, localhost-only viewer — the one no-daemon exception

`why serve` is a thin HTTP server bound to `127.0.0.1` that shows git blame and why-blame side by side, with a story panel and constraint graph. Its endpoints wrap the same library calls the CLI uses (`buildUiIndex`, `buildBlameReport`, `buildGraph`, `buildDoctorReport`); it is strictly read-only (the anchor index loads with `write: false`, non-GET is 405, no `.cache` is written), reloads the bundle per request so edits and a new HEAD show on refresh, and serves its SPA assets bundled in-memory by esbuild at start-up with no external URLs. It is the one deliberate exception to the pipeline's no-daemon rule.

# Why

Recorded in the PR's "What & why" and DESIGN.md §8, amended in the same diff [1][2]. `serve` is a *pure consumer* of the UI contract — it duplicates no engine logic, wrapping the CLI's own library calls instead. Read-only by construction so that viewing a bundle can never mutate it; git blame is served at HEAD so line numbers match coverage computed at the same HEAD; per-request reload avoids a silently stale story. Assets are self-contained (no CDN) so the viewer works offline and pins nothing. The story panel renders expired-upstream warnings *before* hits so this surface and the VS Code extension tell the same story in the same loud order. The no-daemon invariant is preserved as an invariant: nothing in the pipeline depends on `serve` — it is optional, foreground, and user-started/stopped — so DESIGN §8 carves it out as the single exception rather than abandoning the rule.

# Because of

- [The UI ⇄ backend boundary is a versioned JSON data contract](ui-data-contract.md)
- [`why blame` warns on every expired constraint](blame-warns-on-every-expired-constraint.md)

# Citations

[1] [PR #28: Why UI surfaces: local serve UI and VS Code extension](https://github.com/copperbox/why/pull/28)
[2] [merge commit 61a4e85](https://github.com/copperbox/why/commit/61a4e85c359faa26997a12af016ba47f5d0db650)
