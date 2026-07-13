---
type: decision
title: Why serve syntax highlighting
description: "Draft captured from PR #33 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-13
  confidence: recorded
  anchors:
    - path: package-lock.json
      lines: "3"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: package-lock.json
      lines: "9"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: package.json
      lines: "3"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: src/cli.ts
      lines: "5"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: src/cli.ts
      lines: "8"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: src/cli.ts
      lines: 639-654
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: test/cli.test.ts
      lines: "4"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: test/cli.test.ts
      lines: "6"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: test/cli.test.ts
      lines: 73-95
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: test/serve-highlight.test.ts
      lines: 1-98
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: test/serve.test.ts
      lines: 229-236
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: ui/app.js
      lines: "7"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: ui/app.js
      lines: 147-148
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: ui/app.js
      lines: 170-174
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: ui/highlight.js
      lines: 1-202
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: ui/style.css
      lines: 127-135
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: vscode-why/.vscode/launch.json
      lines: 1-16
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: vscode-why/.vscode/tasks.json
      lines: 1-12
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
    - path: vscode-why/.vscodeignore
      lines: "2"
      as_of: 9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69
      state: live
---

# Why serve syntax highlighting

<!-- capture draft from PR #33 (merged 2026-07-13). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-33-why-serve-syntax-highlighting.evidence.md (removed on promote) -->

> - adding syntax highlighting to the code viewed in `why serve` ui
> - fixed an issue with vscode built extension

— PR #33 description by @dantheuber

# Citations

[1] [PR #33: Why serve syntax highlighting](https://github.com/copperbox/why/pull/33)
[2] [merge commit 9c434ae](https://github.com/copperbox/why/commit/9c434ae5ae3fde4f7cae0c63b6cfb80db1036a69)
