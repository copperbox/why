# Evidence pack: pr-38

- commits: e31b5b3
- files touched: .why/decisions/ui-contract-enforces-ladder-in-schema.md, docs/vscode.md, issues/504-decoration-toggle.md, vscode-why/package-lock.json, vscode-why/package.json, vscode-why/src/core/decorations.ts, vscode-why/src/extension.ts, vscode-why/test/decorations.test.ts
- references: PR #38

## Commits

### commit e31b5b3

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-14

vscode: toggle for coverage decorations (scrollbar mark off by default) (#38)

* vscode: toggle for coverage decorations, scrollbar mark off by default

The gutter stripe + scrollbar mark were always on whenever the extension
was active, with no way to quiet them short of disabling it. Split the
single per-token decoration type into independent gutter and overview-ruler
lanes so each toggles on its own, add nested settings
(why.decorations.enabled / .gutter / .overviewRuler) with the intrusive
scrollbar mark now off by default, and a `why: Toggle Annotations` command
for one-keystroke mute/unmute. paint() gates each lane via the pure
visibleLanes() helper (master overrides both); a hidden lane is cleared,
not skipped, and onDidChangeConfiguration repaints without a CLI re-run.
Hovers and Show Story are unaffected. Docs + unit tests updated.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

* vscode: bump to 0.1.1 for the decoration toggle

Patch bump in package.json + package-lock.json and rebuild the .vsix
(vscode-why-0.1.1.vsix; the artifact is gitignored). Point the install
doc at the new filename.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

* why anchor

---------

Co-authored-by: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

## Pull requests

### PR #38 — vscode: toggle for coverage decorations (scrollbar mark off by default)

by @dantheuber

## What

The VS Code extension's "green line" — the gutter stripe in the number column plus the mark in the scrollbar overview ruler — was always on whenever the extension was active, with no way to quiet it short of disabling the extension. This adds independent per-lane toggles and a one-keystroke command, and turns the more intrusive scrollbar mark off by default.

## Changes

- Split the single per-token decoration type into two lanes (gutter-only border, ruler-only overview mark) so they toggle independently.
- New nested settings:
  - `why.decorations.enabled` (default `true`) — master toggle
  - `why.decorations.gutter` (default `true`) — number-column stripe
  - `why.decorations.overviewRuler` (**default `false`**) — scrollbar mark, off by default since it stays visible even when scrolled away
- New `why: Toggle Annotations` command (palette) — flips `why.decorations.enabled`, writing to workspace scope when already set there, else global.
- `paint()` gates each lane via the pure `visibleLanes()` helper (master overrides both); a hidden lane is cleared, not skipped. `onDidChangeConfiguration` repaints on any `why.decorations` change with no CLI re-run (coverage is cached).
- Hovers and `why: Show Story` are unaffected — only the always-on paint is gated.
- Patch bump `0.1.0` → `0.1.1`, rebuilt `vscode-why-0.1.1.vsix`, docs + unit tests updated. Spec of record: `issues/504-decoration-toggle.md`.

## Verification

`vscode-why` verify passes (32/32 unit tests, incl. new `visibleLanes` cases: defaults, master override, each lane alone). The extension-host integration test needs a display server, so the in-editor toggle can't be driven in the sandbox — that path is the manual-QA checklist in `docs/vscode.md`.

Note: one pre-existing failure in the *root* suite (`docs/ci.md` workflow-drift test) is present on `main` and untouched here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


## Diffs

### diff of commit e31b5b3

````diff
diff --git a/.why/decisions/ui-contract-enforces-ladder-in-schema.md b/.why/decisions/ui-contract-enforces-ladder-in-schema.md
index 25d160e..60315d9 100644
--- a/.why/decisions/ui-contract-enforces-ladder-in-schema.md
+++ b/.why/decisions/ui-contract-enforces-ladder-in-schema.md
@@ -18,8 +18,8 @@ why:
       as_of: 58dc0db
       state: live
     - path: test/ui-contract.test.ts
-      lines: 1-338
-      as_of: 58dc0db
+      lines: 1-351
+      as_of: 394ff31
       state: live
 ---
````

````diff
diff --git a/docs/vscode.md b/docs/vscode.md
index ba29478..f51545b 100644
--- a/docs/vscode.md
+++ b/docs/vscode.md
@@ -42,7 +42,7 @@ Either through the UI — Extensions view → `…` menu → *Install from VSIX
 or from a terminal:
 
 ```
-code --install-extension vscode-why/vscode-why-0.1.0.vsix
+code --install-extension vscode-why/vscode-why-0.1.1.vsix
 ```
 
 The extension activates in any workspace containing a `.why/` directory. The
@@ -50,6 +50,26 @@ The extension activates in any workspace containing a `.why/` directory. The
 then the `why.cliPath` setting. If none resolves you get one non-modal info
 message per session, then silence until the next session.
 
+## Settings and commands
+
+The inline coverage marks come in two lanes, toggled independently:
+
+| Setting | Default | What it controls |
+| --- | --- | --- |
+| `why.decorations.enabled` | `true` | Master toggle for both marks. Off hides everything; hovers and *Show Story* are unaffected. |
+| `why.decorations.gutter` | `true` | The stripe in the number column, per covered line. |
+| `why.decorations.overviewRuler` | `false` | The mark in the scrollbar overview ruler. Off by default — it stays visible even when scrolled away, which some find intrusive during regular editing. |
+| `why.cliPath` | `""` | Path to the `why` CLI, checked after `node_modules/.bin` and PATH. |
+
+Commands (palette, `why:` category):
+
+- **`why: Toggle Annotations`** — flips `why.decorations.enabled` for a
+  one-keystroke mute/unmute (bind it yourself in *Keyboard Shortcuts* if you
+  use it often). It writes to the workspace scope when the setting is already
+  set there, otherwise globally.
+- **`why: Show Story`** — the full card panel for the cursor's span.
+- **`why: Refresh`** — re-export coverage now (the escape hatch).
+
 ## Manual QA script
 
 Build a throwaway repo whose fabricated sources match the harbor bundle's
@@ -76,9 +96,14 @@ code "$QA"
 Then walk this checklist:
 
 1. **Activation + decorations.** Open `src/lock.rs`. Every line carries a
-   subtle colored stripe (the whole-file anchor of
+   subtle colored stripe in the number column (the whole-file anchor of
    `incidents/2024-03-lock-stall` covers the file); the colors come from your
-   theme, not fixed hex. The overview ruler shows the same marks.
+   theme, not fixed hex. The scrollbar overview ruler is **clear** by default;
+   set `why.decorations.overviewRuler` to `true` and the same marks appear
+   there too.
+1a. **Toggle.** Run `why: Toggle Annotations` from the palette: the gutter
+   stripes vanish. Run it again: they return. Confirm hovers still work while
+   the marks are hidden (step 2 with decorations off).
 2. **Hover on `src/lock.rs` line 47** (inside the 41–58 span of
    `decisions/queue-based-locking`). The card list shows, in order:
    - **first**, the expired-upstream warning: `⚠` glyph, *Acme 45s gateway
````

````diff
diff --git a/issues/504-decoration-toggle.md b/issues/504-decoration-toggle.md
new file mode 100644
index 0000000..5c137ae
--- /dev/null
+++ b/issues/504-decoration-toggle.md
@@ -0,0 +1,53 @@
+# VS Code extension: toggle for coverage decorations
+
+Labels: phase:6
+
+> Implemented directly on the `decoration-toggle` branch (not via the
+> Sandcastle queue) — this file is the spec of record.
+
+## Context
+
+The gutter stripe + overview-ruler mark (the "green line" in the number column
+and scrollbar) is painted on every covered span whenever the extension is
+active. It's the right default for discovery, but it's persistent and some
+find it intrusive during regular editing — the scrollbar mark especially,
+since it stays visible even when scrolled away. There was no way to quiet it
+short of disabling the whole extension. Add per-lane settings plus a
+one-keystroke command to mute/unmute, with the scrollbar mark off by default.
+Hovers and `why: Show Story` are on-demand, not passive, so they stay
+available regardless — only the always-on paint is gated.
+
+## What shipped
+
+- Three nested settings under `contributes.configuration`:
+  - `why.decorations.enabled` (boolean, default `true`) — master toggle.
+  - `why.decorations.gutter` (boolean, default `true`) — the number-column stripe.
+  - `why.decorations.overviewRuler` (boolean, default `false`) — the scrollbar mark.
+- `why: Toggle Annotations` command (palette, `why` category) flips
+  `why.decorations.enabled`, writing to the workspace scope when the setting is
+  already set there, else global.
+- The single per-token decoration type was split into two lanes (gutter-only
+  border, ruler-only overview mark) so the lanes toggle independently. `paint`
+  reads the settings via the pure `visibleLanes` helper in
+  `src/core/decorations.ts` (master overrides both lanes); a hidden lane is
+  cleared, not skipped, so no mark lingers after a toggle-off.
+- `onDidChangeConfiguration` repaints visible editors on any `why.decorations`
+  change — no CLI re-run (coverage is already cached).
+
+## Acceptance criteria
+
+- [x] Defaults paint the gutter stripe only; the scrollbar/overview-ruler mark
+      is off until `why.decorations.overviewRuler` is enabled.
+- [x] `why.decorations.enabled` = `false` (Settings UI or command) clears all
+      marks within a repaint — no reload, no CLI re-run; hovers still work.
+- [x] `why: Toggle Annotations` flips the setting at the right scope and the
+      marks appear/disappear each invocation.
+- [x] Unit test (plain `node:test`, no electron) covers `visibleLanes`:
+      defaults, master override, and each lane on its own.
+- [x] `docs/vscode.md` documents the settings + command; `package.json`
+      `contributes` declares the command and the three config properties.
+
+## Out of scope
+
+A default keybinding (users bind `why.toggleAnnotations` themselves), a
+status-bar affordance, and gating hovers.
````

````diff
diff --git a/vscode-why/package-lock.json b/vscode-why/package-lock.json
index d4755da..af21e29 100644
--- a/vscode-why/package-lock.json
+++ b/vscode-why/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "vscode-why",
-  "version": "0.1.0",
+  "version": "0.1.1",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "vscode-why",
-      "version": "0.1.0",
+      "version": "0.1.1",
       "license": "MIT",
       "devDependencies": {
         "@types/node": "^22.10.0",
````

````diff
diff --git a/vscode-why/package.json b/vscode-why/package.json
index cbfdb0a..29a423a 100644
--- a/vscode-why/package.json
+++ b/vscode-why/package.json
@@ -2,7 +2,7 @@
   "name": "vscode-why",
   "displayName": "why — decision archaeology",
   "description": "Inline why annotations, GitLens-style: gutter marks and hover cards from the repo's .why/ bundle, rendered from the why CLI's UI-contract payloads.",
-  "version": "0.1.0",
+  "version": "0.1.1",
   "publisher": "copperbox",
   "license": "MIT",
   "private": true,
@@ -32,6 +32,11 @@
         "command": "why.refresh",
         "category": "why",
         "title": "Refresh"
+      },
+      {
+        "command": "why.toggleAnnotations",
+        "category": "why",
+        "title": "Toggle Annotations"
       }
     ],
     "menus": {
@@ -49,6 +54,21 @@
           "type": "string",
           "default": "",
           "description": "Path to the `why` CLI executable. Checked after the workspace's node_modules/.bin and PATH."
+        },
+        "why.decorations.enabled": {
+          "type": "boolean",
+          "default": true,
+          "description": "Master toggle for the inline coverage marks (the gutter stripe and scrollbar mark). Turning this off hides both, regardless of the per-lane settings below; hovers and `why: Show Story` are unaffected. Flip it quickly with the `why: Toggle Annotations` command."
+        },
+        "why.decorations.gutter": {
+          "type": "boolean",
+          "default": true,
+          "description": "Show the coverage stripe in the number column for covered lines."
+        },
+        "why.decorations.overviewRuler": {
+          "type": "boolean",
+          "default": false,
+          "description": "Show the coverage mark in the scrollbar overview ruler. Off by default — it stays visible even when scrolled away, which some find intrusive during regular editing."
         }
       }
     }
````

````diff
diff --git a/vscode-why/src/core/decorations.ts b/vscode-why/src/core/decorations.ts
index 49636e3..3604395 100644
--- a/vscode-why/src/core/decorations.ts
+++ b/vscode-why/src/core/decorations.ts
@@ -23,6 +23,28 @@ export type ThemeToken = (typeof TREATMENT_TOKENS)[keyof typeof TREATMENT_TOKENS
 
 export const ALL_TOKENS: readonly ThemeToken[] = [...new Set(Object.values(TREATMENT_TOKENS))];
 
+/** The `why.decorations.*` settings that gate painting. */
+export interface DecorationSettings {
+  /** Master toggle — the `why: Toggle Annotations` command flips this. */
+  enabled: boolean;
+  /** The number-column stripe. */
+  gutter: boolean;
+  /** The scrollbar / overview-ruler mark (off by default — the most intrusive). */
+  overviewRuler: boolean;
+}
+
+/**
+ * Which decoration lanes actually paint. The master `enabled` overrides both
+ * per-lane flags, so one toggle command silences everything regardless of the
+ * gutter/ruler preferences it will restore.
+ */
+export function visibleLanes(settings: DecorationSettings): { gutter: boolean; overviewRuler: boolean } {
+  return {
+    gutter: settings.enabled && settings.gutter,
+    overviewRuler: settings.enabled && settings.overviewRuler,
+  };
+}
+
 /** Spans covering a 1-based line; a span without `lines` is a whole-file
  * claim and covers every line (same rule as the serve SPA). */
 export function coveringSpans(spans: CoverageSpan[], line: number): CoverageSpan[] {
````

````diff
diff --git a/vscode-why/src/extension.ts b/vscode-why/src/extension.ts
index 82ee5fc..db228f3 100644
--- a/vscode-why/src/extension.ts
+++ b/vscode-why/src/extension.ts
@@ -10,7 +10,7 @@ import * as path from "node:path";
 import * as vscode from "vscode";
 import { locateWhyCli, type CliLocation } from "./core/cli-locate.js";
 import { parseCoverage, parseStory, type Coverage, type CoverageSpan, type Story } from "./core/contract.js";
-import { ALL_TOKENS, coveringSpans, decorationRanges, type ThemeToken } from "./core/decorations.js";
+import { ALL_TOKENS, coveringSpans, decorationRanges, visibleLanes, type ThemeToken } from "./core/decorations.js";
 import { hoverMarkdown, stalenessNote } from "./core/hover.js";
 import { renderStoryHtml } from "./core/story-html.js";
 
@@ -41,7 +41,11 @@ function run(command: string, args: string[], cwd: string): Promise<string> {
 
 class WhyExtension implements vscode.Disposable {
   private readonly disposables: vscode.Disposable[] = [];
-  private readonly decorationTypes = new Map<ThemeToken, vscode.TextEditorDecorationType>();
+  // Two lanes per token so the gutter stripe and the overview-ruler (scrollbar)
+  // mark can be toggled independently — a single type carrying both can't hide
+  // one without the other.
+  private readonly gutterTypes = new Map<ThemeToken, vscode.TextEditorDecorationType>();
+  private readonly rulerTypes = new Map<ThemeToken, vscode.TextEditorDecorationType>();
   private readonly output = vscode.window.createOutputChannel("why");
   private readonly storyCache = new Map<string, Story>();
   private coverage: Coverage | undefined;
@@ -53,13 +57,20 @@ class WhyExtension implements vscode.Disposable {
     for (const token of ALL_TOKENS) {
       // A subtle gutter-side stripe per covered span; ThemeColor keeps every
       // color a theme token (issue 503: no hardcoded hex).
-      this.decorationTypes.set(
+      this.gutterTypes.set(
         token,
         vscode.window.createTextEditorDecorationType({
           isWholeLine: true,
           borderWidth: "0 0 0 2px",
           borderStyle: "solid",
           borderColor: new vscode.ThemeColor(token),
+        }),
+      );
+      // The matching scrollbar mark, painted on its own type so it can be hidden
+      // independently (it's off by default — the more intrusive of the two).
+      this.rulerTypes.set(
+        token,
+        vscode.window.createTextEditorDecorationType({
           overviewRulerColor: new vscode.ThemeColor(token),
           overviewRulerLane: vscode.OverviewRulerLane.Left,
         }),
@@ -67,6 +78,16 @@ class WhyExtension implements vscode.Disposable {
     }
   }
 
+  /** Which decoration lanes to paint, per the `why.decorations.*` settings. */
+  private decorationLanes(): { gutter: boolean; overviewRuler: boolean } {
+    const cfg = vscode.workspace.getConfiguration("why");
+    return visibleLanes({
+      enabled: cfg.get<boolean>("decorations.enabled", true),
+      gutter: cfg.get<boolean>("decorations.gutter", true),
+      overviewRuler: cfg.get<boolean>("decorations.overviewRuler", false),
+    });
+  }
+
   private locateCli(): CliLocation | undefined {
     const setting = vscode.workspace.getConfiguration("why").get<string>("cliPath");
     const located = locateWhyCli({
@@ -109,15 +130,29 @@ class WhyExtension implements vscode.Disposable {
 
   private paint(editor: vscode.TextEditor): void {
     const ranges = decorationRanges(this.spansFor(editor.document), editor.document.lineCount);
-    for (const [token, type] of this.decorationTypes) {
-      const lineRanges = ranges.get(token) ?? [];
-      editor.setDecorations(
-        type,
-        lineRanges.map((r) => new vscode.Range(r.start - 1, 0, r.end - 1, 0)),
-      );
+    const lanes = this.decorationLanes();
+    for (const token of ALL_TOKENS) {
+      const vsRanges = (ranges.get(token) ?? []).map((r) => new vscode.Range(r.start - 1, 0, r.end - 1, 0));
+      // A hidden lane is cleared, not skipped — otherwise a mark lingers after
+      // the setting is turned off.
+      editor.setDecorations(this.gutterTypes.get(token)!, lanes.gutter ? vsRanges : []);
+      editor.setDecorations(this.rulerTypes.get(token)!, lanes.overviewRuler ? vsRanges : []);
     }
   }
 
+  /** Flip the master `why.decorations.enabled`, writing back to whichever scope
+   * already holds it (workspace if set there, else global). */
+  private async toggleAnnotations(): Promise<void> {
+    const cfg = vscode.workspace.getConfiguration("why");
+    const current = cfg.get<boolean>("decorations.enabled", true);
+    const target =
+      cfg.inspect<boolean>("decorations.enabled")?.workspaceValue !== undefined
+        ? vscode.ConfigurationTarget.Workspace
+        : vscode.ConfigurationTarget.Global;
+    await cfg.update("decorations.enabled", !current, target);
+    // The onDidChangeConfiguration handler repaints.
+  }
+
   async refresh(): Promise<void> {
     this.storyCache.clear();
     try {
@@ -198,6 +233,14 @@ class WhyExtension implements vscode.Disposable {
       this,
       vscode.commands.registerCommand("why.refresh", () => this.refresh()),
       vscode.commands.registerCommand("why.showStory", () => this.showStory()),
+      vscode.commands.registerCommand("why.toggleAnnotations", () => this.toggleAnnotations()),
+      // Repaint (no CLI re-run — coverage is cached) when the marks are toggled,
+      // whether from the command or the Settings UI.
+      vscode.workspace.onDidChangeConfiguration((e) => {
+        if (e.affectsConfiguration("why.decorations")) {
+          for (const editor of vscode.window.visibleTextEditors) this.paint(editor);
+        }
+      }),
       vscode.languages.registerHoverProvider({ scheme: "file" }, {
         provideHover: (document, position) => this.provideHover(document, position),
       }),
@@ -220,7 +263,8 @@ class WhyExtension implements vscode.Disposable {
 
   dispose(): void {
     if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
-    for (const type of this.decorationTypes.values()) type.dispose();
+    for (const type of this.gutterTypes.values()) type.dispose();
+    for (const type of this.rulerTypes.values()) type.dispose();
     this.output.dispose();
   }
 }
````

````diff
diff --git a/vscode-why/test/decorations.test.ts b/vscode-why/test/decorations.test.ts
index 66894d6..65148df 100644
--- a/vscode-why/test/decorations.test.ts
+++ b/vscode-why/test/decorations.test.ts
@@ -12,6 +12,7 @@ import {
   coveringSpans,
   decorationRanges,
   TREATMENT_TOKENS,
+  visibleLanes,
 } from "../src/core/decorations.ts";
 
 const here = __dirname;
@@ -74,3 +75,28 @@ test("a span with no confidence falls back to the muted token", () => {
 test("no covering spans → no ranges at all", () => {
   assert.equal(decorationRanges([], 100).size, 0);
 });
+
+test("visibleLanes: defaults paint the gutter stripe only, scrollbar mark off", () => {
+  assert.deepEqual(
+    visibleLanes({ enabled: true, gutter: true, overviewRuler: false }),
+    { gutter: true, overviewRuler: false },
+  );
+});
+
+test("visibleLanes: the master toggle overrides both per-lane flags", () => {
+  assert.deepEqual(
+    visibleLanes({ enabled: false, gutter: true, overviewRuler: true }),
+    { gutter: false, overviewRuler: false },
+  );
+});
+
+test("visibleLanes: each lane can be shown on its own", () => {
+  assert.deepEqual(
+    visibleLanes({ enabled: true, gutter: false, overviewRuler: true }),
+    { gutter: false, overviewRuler: true },
+  );
+  assert.deepEqual(
+    visibleLanes({ enabled: true, gutter: true, overviewRuler: true }),
+    { gutter: true, overviewRuler: true },
+  );
+});
````
