# vscode-why

Inline **why** annotations, GitLens-style: the moment you are about to edit
weird code is the moment its recorded rationale matters, and that moment
happens in the editor.

The extension is a *pure contract consumer* — it shells out to the `why` CLI
(`why export ui-index`, `why blame --json`) and renders the versioned JSON
payloads documented in the repo's `docs/ui-contract.md`. Zero engine logic
lives here: hedging, confidence, glyphs, and blast radii all arrive
precomputed in the data.

## What it does

- **Line marks** — a subtle stripe per covered span, colored by
  confidence/status through VS Code theme tokens (no hardcoded hex).
- **Hovers** — a markdown card per covering concept: status glyph, title,
  confidence badge, the pre-hedged `renderedRationale` verbatim, citation
  links; an expired upstream constraint always warns *first*.
- **`why: Show Story`** (editor context menu + palette) — a webview panel
  with the full story cards for the cursor's line.
- **`why: Refresh`** — manual escape hatch; automatic refresh happens on file
  save, `.why/**` changes, and `.git/HEAD` changes (debounced).
- **Staleness** — when the coverage payload's recorded sha ≠ current HEAD,
  hovers carry a muted "as of `<short-sha>`" note instead of hiding data or
  resolving anchors themselves.

## CLI discovery

`why` is located in order: the workspace's `node_modules/.bin`, then PATH,
then the `why.cliPath` setting. If none resolves, one non-modal info message
per session, then silence.

## Development

```
npm install
npm run verify            # typecheck + unit tests (plain node:test, no display)
npm run test:integration  # extension-host test via @vscode/test-electron — needs a display (xvfb in CI)
npm run package           # build + vsce package --no-dependencies → .vsix
```

Install instructions and a manual QA script live in the repo's
`docs/vscode.md`.
