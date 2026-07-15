---
type: decision
title: The serve UI ships zero external assets
description: why serve bundles all assets in-repo via esbuild and pulls nothing
  from a CDN — a no-external-URL test enforces it, and the hand-rolled
  highlighter and canvas graph exist so no third-party runtime is fetched.
tags:
  - serve
  - ui
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/serve-assets.ts
      as_of: 61a4e85
      state: live
    - path: ui/graph.js
      as_of: 61a4e85
      state: live
    - path: ui/highlight.js
      as_of: 9c434ae
      state: live
---

The `why serve` SPA is fully self-contained: `src/serve-assets.ts` bundles the UI in-memory with esbuild at server start, and a test scans the served payload for any `http(s)` reference and fails if one appears. Presentational features that would normally reach for a library are hand-rolled instead — the constraint graph is a canvas force sim (`ui/graph.js`) and syntax highlighting is a small dependency-free lexer (`ui/highlight.js`).

# Why

Recorded across the serve UI and the later highlighting change [1]. `serve` is a localhost-only viewer of a decision archive; a CDN dependency would make it fail offline, leak requests, and couple the tool's output to a third party's uptime and versioning. The no-external-URL test makes "self-contained" a checked invariant rather than a hope. `ui/highlight.js` says so in its own header — it exists "the same self-contained / zero-CDN philosophy as the graph's canvas force sim" — and it deliberately lives in the client renderer, not the UI data contract, because highlighting is pure presentation that asserts nothing about the *why*. The same reasoning is why the highlighter never alters the code it colors: joining its token texts must reproduce each blamed line verbatim, so coloring can never change what the archive shows [2].

# Citations

[1] [PR #28: Why UI surfaces: local serve UI and VS Code extension](https://github.com/copperbox/why/pull/28)
[2] [PR #33: Why serve syntax highlighting](https://github.com/copperbox/why/pull/33)
