# The VS Code extension (`vscode-why/`)

Inline why annotations, GitLens-style: gutter-side stripes per covered span
and hover cards with the recorded rationale, at the moment someone is about
to edit the code. The extension is a *pure contract consumer* — it shells out
to the `why` CLI (`why export ui-index` for coverage, `why blame --json` for
stories) with the workspace root as cwd and renders the versioned payloads
from [docs/ui-contract.md](ui-contract.md). Zero engine logic lives in
extension code: hedging, glyphs, confidence, and blast radii all arrive
precomputed in the data.

## Building the .vsix

```
cd vscode-why
npm install
npm run verify     # typecheck + unit tests (plain node:test — no display needed)
npm run package    # tsc build + vsce package --no-dependencies
```

`npm run package` writes `vscode-why/vscode-why-<version>.vsix` — that path is
the build artifact. Nothing is published anywhere; the extension is excluded
from the root npm package (the `files` whitelist covers only `dist` and `ui`)
and from the release version-bump automation (the release step runs
`npm version` against the root `package.json` only; `vscode-why/` is not an
npm workspace and versions independently).

The extension-host integration test exists but is **not** part of any verify:

```
cd vscode-why
npm run test:integration
```

It downloads VS Code via `@vscode/test-electron` and therefore needs network
access and a display server (`xvfb-run npm run test:integration` in CI). The
default `npm run verify` — root and `vscode-why/` — stays green in a sandbox.

## Installing from the .vsix

Either through the UI — Extensions view → `…` menu → *Install from VSIX…* —
or from a terminal:

```
code --install-extension vscode-why/vscode-why-0.1.0.vsix
```

The extension activates in any workspace containing a `.why/` directory. The
`why` CLI is located in order: the workspace's `node_modules/.bin`, then PATH,
then the `why.cliPath` setting. If none resolves you get one non-modal info
message per session, then silence until the next session.

## Settings and commands

The inline coverage marks come in two lanes, toggled independently:

| Setting | Default | What it controls |
| --- | --- | --- |
| `why.decorations.enabled` | `true` | Master toggle for both marks. Off hides everything; hovers and *Show Story* are unaffected. |
| `why.decorations.gutter` | `true` | The stripe in the number column, per covered line. |
| `why.decorations.overviewRuler` | `false` | The mark in the scrollbar overview ruler. Off by default — it stays visible even when scrolled away, which some find intrusive during regular editing. |
| `why.cliPath` | `""` | Path to the `why` CLI, checked after `node_modules/.bin` and PATH. |

Commands (palette, `why:` category):

- **`why: Toggle Annotations`** — flips `why.decorations.enabled` for a
  one-keystroke mute/unmute (bind it yourself in *Keyboard Shortcuts* if you
  use it often). It writes to the workspace scope when the setting is already
  set there, otherwise globally.
- **`why: Show Story`** — the full card panel for the cursor's span.
- **`why: Refresh`** — re-export coverage now (the escape hatch).

## Manual QA script

Build a throwaway repo whose fabricated sources match the harbor bundle's
anchors (the same fixture shape the serve tests use), with this checkout's
CLI on PATH via an npm link into the temp repo:

```bash
WHY_REPO="$PWD"                      # this checkout
QA=$(mktemp -d /tmp/why-vscode-qa.XXXX)
cd "$QA"
git init -q
mkdir -p src/dispatch src/server config
for i in $(seq 1 80); do echo "// line $i"; done > src/lock.rs
for i in $(seq 1 30); do echo "// line $i"; done > src/dispatch/queue.rs
for i in $(seq 1 20); do echo "// line $i"; done > src/server/deadline.rs
for i in $(seq 1 40); do echo "// line $i"; done > config/defaults.toml
cp -r "$WHY_REPO/examples/harbor" .why
rm -rf .why/.cache
git add . && git commit -qm "files matching the harbor anchors"
(cd "$WHY_REPO" && npm run build) && npm install --no-save "$WHY_REPO"
code "$QA"
```

Then walk this checklist:

1. **Activation + decorations.** Open `src/lock.rs`. Every line carries a
   subtle colored stripe in the number column (the whole-file anchor of
   `incidents/2024-03-lock-stall` covers the file); the colors come from your
   theme, not fixed hex. The scrollbar overview ruler is **clear** by default;
   set `why.decorations.overviewRuler` to `true` and the same marks appear
   there too.
1a. **Toggle.** Run `why: Toggle Annotations` from the palette: the gutter
   stripes vanish. Run it again: they return. Confirm hovers still work while
   the marks are hidden (step 2 with decorations off).
2. **Hover on `src/lock.rs` line 47** (inside the 41–58 span of
   `decisions/queue-based-locking`). The card list shows, in order:
   - **first**, the expired-upstream warning: `⚠` glyph, *Acme 45s gateway
     timeout*, an **EXPIRED 2025-06-30** badge, the verbatim rationale
     ("AcmeCorp's API gateway killed any request exceeding 45 seconds…"),
     the scar-tissue line *→ downstream decision "47s request deadline" may
     now be scar tissue.*, and the Issue #612 citation link;
   - then `●` *Queue-based locking* — `decision` · active · `recorded` —
     with its rationale rendered verbatim (no hedge: confidence is
     `recorded`) and the PR #212 citation link;
   - then `●` *2024-03 lock stall* — `incident` · resolved — from the
     whole-file anchor.
3. **Hover on `config/defaults.toml` line 23** (inside 22–24): `●` *47s
   request deadline* — `decision` · active · `corroborated`, rationale
   verbatim, citations to commit 51be07d and Issue #143. The same expired-Acme
   warning card renders first here too — the 47s deadline is its blast radius.
4. **Hover on `config/defaults.toml` line 31**: `?` *Why is retry jitter
   disabled?* — an open `question`, no confidence badge, no rationale — an
   honest gap, not a guess.
5. **Hover on an uncovered line** (e.g. `config/defaults.toml` line 5):
   no why hover at all.
6. **`why: Show Story`.** Put the cursor on `src/lock.rs:47`, run the command
   from the editor context menu (and once from the palette). A side panel
   opens with the same cards in the same order, themed like your editor;
   citation links open in the browser.
7. **Staleness.** Commit anything (`git commit --allow-empty -qm tick`), then
   hover line 47 again *without* running `why: Refresh` — within a moment the
   `.git/HEAD` watcher re-exports coverage; if you instead edit
   `.why/` timestamps away or point `why.cliPath` at a stale checkout, hovers
   append a muted *as of `<short-sha>`* note rather than hiding data.
8. **Refresh.** Delete `.why/decisions/queue-based-locking.md`, save any
   file (or run `why: Refresh`): the 41–58 stripes drop to the whole-file
   incident coloring only. Restore the file; they return.
9. **CLI missing.** Remove the linked CLI (`npm uninstall --no-save
   @copperbox/why`) and reload the window: exactly one info message ("why:
   CLI not found…"), then silence — no repeated toasts on hover or save.

## Testing layout

- `vscode-why/test/*.test.ts` — plain `node:test` units, no electron, no
  display: CLI discovery order, contract parsing against fixture JSON (copies
  of the ui-contract doc examples, drift-checked against the doc when run
  inside this repo), decoration-set computation, staleness-note logic, hover
  markdown (hedge prefix, warning-first ordering), story webview HTML. The
  root `npm run verify` runs these too, through the root `tsx` — they need
  no `vscode-why/node_modules`.
- `vscode-why/test-integration/` — the `@vscode/test-electron` host test
  behind `npm run test:integration` (display + network required; see above).
