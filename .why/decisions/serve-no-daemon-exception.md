---
type: decision
title: why serve is a scoped exception to the no-daemon rule
description: why serve is the only foreground, blocking subcommand — an
  optional, localhost-only, read-only viewer; DESIGN §8's 'no daemon,
  run-to-completion' bullet was amended to carve the exception rather than
  dropped.
tags:
  - serve
  - architecture
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/serve.ts
      as_of: 61a4e85
      state: live
    - path: DESIGN.md
      lines: 193-196
      as_of: fa87a3b
      state: live
---

`why serve` starts a localhost-only HTTP server and blocks until Ctrl-C — the only `why` subcommand that is not run-to-completion. DESIGN §8's "No daemon. Everything is a run-to-completion command suitable for CI" bullet was qualified in the same diff rather than deleted: no resident process is ever *required*; `serve` is an optional foreground viewer the user starts and stops, and nothing in the pipeline depends on it.

# Why

Recorded when the UI surfaces shipped [1]. `serve` genuinely breaks the letter of the no-daemon invariant, and the project contract is that DESIGN.md is the source of truth — a deviation must amend it in the same diff with reasoning (precedent: §8 was amended when `export` was added), or the change is wrong. The gate caught the omission and it was fixed before merge: §8 now lists `serve` and describes it, plus the `vscode-why/` extension, as dumb renderers of the `docs/ui-contract.md` payloads. The exception is deliberately narrow — foreground, localhost-only (127.0.0.1), read-only (no `.cache` is ever written), and optional — so the "suitable for CI" spirit still holds for every automated path; only the interactive viewer blocks [2].

# Citations

[1] [PR #28: Why UI surfaces: local serve UI and VS Code extension](https://github.com/copperbox/why/pull/28)
[2] [merge commit 61a4e85](https://github.com/copperbox/why/commit/61a4e85c359faa26997a12af016ba47f5d0db650)
