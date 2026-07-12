# VS Code extension: why annotations inline, GitLens-style
Labels: phase:6

## Context

The highest-leverage surface: the moment someone is about to edit weird code is the moment the why matters, and that moment happens in the editor. The extension is a pure contract consumer — it shells out to the `why` CLI and renders; zero engine logic in extension code.

## Scope

- New `vscode-why/` directory with its own `package.json` (VS Code engine field, activation on workspaces containing `.why/`), own `npm run verify` (typecheck + unit tests). Root `verify` runs it too **if and only if** its unit tests need no display server; anything needing VS Code's electron host goes behind a separate script (see testing note below).
- CLI integration: locate `why` (workspace `node_modules/.bin`, then PATH, then `why.cliPath` setting); run `why export ui-index` and `why blame --json` via child_process with the workspace root as cwd. CLI missing → one non-modal info message per session, then silence.
- Features:
  - Line decorations from coverage: a subtle gutter mark per covered span, themed by confidence/status (colors via VS Code theme tokens, not hardcoded hex).
  - Hover provider on covered lines: markdown card — status glyph, title, confidence badge, `renderedRationale` (pre-hedged by contract), citation links, expired-upstream warning first when present.
  - Command `why: Show Story` (editor context menu + palette): opens a webview panel with the full story cards for the cursor's span — reuse the serve SPA's card renderer bundle if it factors cleanly; otherwise render the same markdown as hovers in a list. Judge the trade in the PR body.
  - Refresh: on file save, on `.why/**` change, and on `.git/HEAD` change (debounced); a manual `why: Refresh` command as the escape hatch.
  - Staleness: when the ui-index's recorded sha ≠ current HEAD, show a muted "as of <short-sha>" note in hovers rather than hiding data or resolving anchors itself.
- Packaging: `vsce package` script producing a `.vsix` (not published anywhere by this issue); exclude `vscode-why/` from the root package's npm `files` and from the release version-bump automation.

## Acceptance criteria

- [ ] Unit tests (plain node:test, no electron) cover: CLI discovery order, ui-index/story parsing against contract fixture JSON, decoration-set computation from coverage fixtures, staleness-note logic, and hover markdown generation (assert hedge prefix and warning ordering).
- [ ] The extension host integration test (`@vscode/test-electron`) exists but runs behind `npm run test:integration` in `vscode-why/`, documented as requiring a display (xvfb in CI later) — NOT part of default verify, so the sandboxed pipeline stays green.
- [ ] Root `npm run verify` passes with the new directory present and still passes if `vscode-why/node_modules` is absent (workspace isolation — no root-level type or test breakage).
- [ ] `vsce package` succeeds in CI-like conditions (`--no-dependencies` acceptable), `.vsix` land as a build artifact path documented in the PR.
- [ ] `docs/vscode.md`: install-from-vsix instructions and a manual QA script against a temp repo (fabricated files matching harbor anchors), including what each hover should show for the lock.rs and defaults.toml lines.

## Out of scope

Marketplace publishing, inline end-of-line blame text (decorations + hover only for v1), edit/capture flows, remote workspaces.
