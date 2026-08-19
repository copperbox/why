---
type: decision
title: The CLI direct-run guard resolves symlinks
description: why's entry-point guard realpath-resolves argv[1] before comparing
  to import.meta.url, so a symlinked launch still runs main() — the VS Code
  extension shells out through .bin symlinks.
tags:
  - cli
  - vscode
timestamp: 2026-07-13
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: src/cli.ts
      lines: 808-823
      as_of: eab8a44
      state: live
    - path: test/cli.test.ts
      lines: 73-95
      as_of: 9c434ae
      state: live
---

The "am I the entry point?" guard in `src/cli.ts` resolves `process.argv[1]`'s symlinks with `realpathSync` and builds the URL with `pathToFileURL` before comparing to `import.meta.url`. A `try/catch` treats an unresolvable path as "not the entry point."

# Why

Recorded in the code and its regression test when the guard was rewritten [1]. `import.meta.url` is already realpath-resolved, but the original guard compared it against a naive `` `file://${process.argv[1]}` `` — and `process.argv[1]` keeps the invoked path verbatim. npm's local installs and every `node_modules/.bin` shim are symlinks, which is exactly how the VS Code extension shells out to the CLI. Under that launch the string compare never matched, so `main()` silently never ran: empty stdout, exit 0, and the extension rendered nothing. Resolving `argv[1]` to the same realpath closes the gap; `pathToFileURL` also makes odd characters compare correctly. `test/cli.test.ts` pins it by launching the CLI through a symlink and asserting the usage banner appears — a future "simplify the guard back to a string compare" would fail there [2].

# Citations

[1] [PR #33: Why serve syntax highlighting](https://github.com/copperbox/why/pull/33)
[2] [merge commit 9c434ae](https://github.com/copperbox/why/commit/9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69)
