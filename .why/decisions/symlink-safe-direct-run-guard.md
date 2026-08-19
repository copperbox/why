---
type: decision
title: The CLI direct-run guard resolves the entry path's symlinks before comparing
description: isDirectRun realpath-resolves the entry path and builds its URL
  with pathToFileURL, so a symlinked launch (npm bins, the VS Code extension)
  still runs main().
tags:
  - cli
  - vscode
timestamp: 2026-07-13T23:41:51.383Z
why:
  status: active
  happened_on: 2026-07-12
  confidence: recorded
  anchors:
    - path: src/cli.ts
      symbol: isDirectRun
      lines: 661-669
      as_of: fa87a3b
      state: live
    - path: test/cli.test.ts
      lines: 73-95
      as_of: 9c434ae
      state: live
---

# The CLI direct-run guard resolves argv[1]'s symlinks before comparing

`isDirectRun` decides whether `src/cli.ts` is the entry point or an import. It realpath-resolves `process.argv[1]` and builds the comparison URL with `pathToFileURL`, so the check matches `import.meta.url` even when the CLI is launched through a symlink.

# Why

Recorded in the guard's own comment and the regression test at the time [2]. `import.meta.url` is already realpath-resolved, but `process.argv[1]` keeps the invoked path verbatim. npm's local installs and every `node_modules/.bin` shim are symlinks — and that is exactly how the VS Code extension shells out to the CLI. The old naive string compare therefore never matched under a symlinked launch, so `main()` silently never ran: empty stdout, exit 0, and the extension rendered nothing. Resolving argv[1]'s symlinks to the same realpath (and using `pathToFileURL` so odd characters compare correctly) closes that gap; a regression test launches the CLI through a symlink to keep it closed.

# Because of

- [The VS Code extension is a standalone package that shells out to the CLI](vscode-extension-standalone.md)

# Citations

[1] [PR #33: Why serve syntax highlighting](https://github.com/copperbox/why/pull/33)
[2] [merge commit 9c434ae](https://github.com/copperbox/why/commit/9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69)
