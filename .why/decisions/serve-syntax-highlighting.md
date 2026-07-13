---
type: decision
title: Syntax highlighting lives in the serve UI's client renderer, not the data
  contract
description: The file view colors code with a hand-rolled, dependency-free
  highlighter in the browser; it is pure presentation and asserts nothing about
  the why.
tags:
  - ui
  - serve
timestamp: 2026-07-13T23:41:51.250Z
why:
  status: active
  happened_on: 2026-07-12
  confidence: recorded
  anchors:
    - path: ui/highlight.js
      lines: 1-202
      as_of: 9c434ae
      state: live
    - path: ui/app.js
      lines: 144-175
      symbol: showFile
      as_of: 9c434ae
      state: live
    - path: ui/style.css
      lines: 127-135
      as_of: 9c434ae
      state: live
---

# Syntax highlighting lives in the serve UI's client renderer, not the data contract

The `why serve` file view colors the code it blames with a hand-rolled, dependency-free lexer (`ui/highlight.js`), driven line by line from `showFile` in `ui/app.js`. It runs entirely in the browser over the text the blame payload already carries, and its one hard invariant is that it never alters that text — joining the token runs reproduces each line verbatim.

# Why

Recorded in the module's own header at the time [2]. Two reasons fix its shape. First, **zero-CDN, self-contained**: the highlighter is hand-rolled with no dependency, the same philosophy as the graph's canvas force sim — the served UI pulls nothing at runtime. Second, **presentation is not the contract**: highlighting only recolors text the blame API already returns and asserts nothing about the *why*, so it belongs in the client renderer, not in the versioned UI data contract. The verbatim round-trip is enforced as an invariant precisely because coloring must never change what HEAD blamed.

# Because of

- [The UI ⇄ backend boundary is a versioned JSON data contract](/decisions/ui-data-contract.md)

# Citations

[1] [PR #33: Why serve syntax highlighting](https://github.com/copperbox/why/pull/33)
[2] [merge commit 9c434ae](https://github.com/copperbox/why/commit/9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69)
