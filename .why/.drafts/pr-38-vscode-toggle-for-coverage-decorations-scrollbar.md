---
type: decision
title: "vscode: toggle for coverage decorations (scrollbar mark off by default)"
description: "Draft captured from PR #38 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-14
  confidence: recorded
  anchors:
    - path: .why/decisions/ui-contract-enforces-ladder-in-schema.md
      lines: 21-22
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: docs/vscode.md
      lines: "45"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: docs/vscode.md
      lines: 53-72
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: docs/vscode.md
      lines: "99"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: docs/vscode.md
      lines: 101-106
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: issues/504-decoration-toggle.md
      lines: 1-53
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package-lock.json
      lines: "3"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package-lock.json
      lines: "9"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package.json
      lines: "5"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package.json
      lines: 35-39
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/package.json
      lines: 57-71
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/src/core/decorations.ts
      lines: 26-47
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/src/extension.ts
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/test/decorations.test.ts
      lines: "15"
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
    - path: vscode-why/test/decorations.test.ts
      lines: 78-102
      as_of: e31b5b389e5a8a2c040098a88c5db748c206eb93
      state: live
---

# vscode: toggle for coverage decorations (scrollbar mark off by default)

<!-- capture draft from PR #38 (merged 2026-07-14). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->
<!-- capture: vscode-why/src/extension.ts: 9 hunks collapsed into one whole-file anchor -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-38-vscode-toggle-for-coverage-decorations-scrollbar.evidence.md (removed on promote) -->

> ## What
>
> The VS Code extension's "green line" — the gutter stripe in the number column plus the mark in the scrollbar overview ruler — was always on whenever the extension was active, with no way to quiet it short of disabling the extension. This adds independent per-lane toggles and a one-keystroke command, and turns the more intrusive scrollbar mark off by default.
>
> ## Changes
>
> - Split the single per-token decoration type into two lanes (gutter-only border, ruler-only overview mark) so they toggle independently.
> - New nested settings:
>   - `why.decorations.enabled` (default `true`) — master toggle
>   - `why.decorations.gutter` (default `true`) — number-column stripe
>   - `why.decorations.overviewRuler` (**default `false`**) — scrollbar mark, off by default since it stays visible even when scrolled away
> - New `why: Toggle Annotations` command (palette) — flips `why.decorations.enabled`, writing to workspace scope when already set there, else global.
> - `paint()` gates each lane via the pure `visibleLanes()` helper (master overrides both); a hidden lane is cleared, not skipped. `onDidChangeConfiguration` repaints on any `why.decorations` change with no CLI re-run (coverage is cached).
> - Hovers and `why: Show Story` are unaffected — only the always-on paint is gated.
> - Patch bump `0.1.0` → `0.1.1`, rebuilt `vscode-why-0.1.1.vsix`, docs + unit tests updated. Spec of record: `issues/504-decoration-toggle.md`.
>
> ## Verification
>
> `vscode-why` verify passes (32/32 unit tests, incl. new `visibleLanes` cases: defaults, master override, each lane alone). The extension-host integration test needs a display server, so the in-editor toggle can't be driven in the sandbox — that path is the manual-QA checklist in `docs/vscode.md`.
>
> Note: one pre-existing failure in the *root* suite (`docs/ci.md` workflow-drift test) is present on `main` and untouched here.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)

— PR #38 description by @dantheuber

# Citations

[1] [PR #38: vscode: toggle for coverage decorations (scrollbar mark off by default)](https://github.com/copperbox/why/pull/38)
[2] [merge commit e31b5b3](https://github.com/copperbox/why/commit/e31b5b389e5a8a2c040098a88c5db748c206eb93)
