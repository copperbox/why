# Evidence pack: pr-34

- commits: 0e7ff62
- files touched: .why/.drafts/pr-32-why-capture-draft-for-33.evidence.md, .why/.drafts/pr-32-why-capture-draft-for-33.md
- references: PR #34

## Commits

### commit 0e7ff62

- author: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>
- date: 2026-07-13

why: capture draft for #32 (#34)

* why capture: draft from #28

* why capture: draft from #32

---------

Co-authored-by: dantheuber <2682437+dantheuber@users.noreply.github.com>
Co-authored-by: Dan Essig <dan.essig@gmail.com>

## Pull requests

### PR #34 — why: capture draft for #32

by @app/github-actions

Automated changes by [create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action


## Diffs

### diff of commit 0e7ff62

````diff
diff --git a/.why/.drafts/pr-32-why-capture-draft-for-33.evidence.md b/.why/.drafts/pr-32-why-capture-draft-for-33.evidence.md
new file mode 100644
index 0000000..5dac3ad
--- /dev/null
+++ b/.why/.drafts/pr-32-why-capture-draft-for-33.evidence.md
@@ -0,0 +1,365 @@
+# Evidence pack: pr-32
+
+- commits: 83607dc
+- files touched: .why/.drafts/pr-33-why-serve-syntax-highlighting.evidence.md, .why/.drafts/pr-33-why-serve-syntax-highlighting.md
+- references: PR #32
+
+## Commits
+
+### commit 83607dc
+
+- author: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>
+- date: 2026-07-12
+
+why capture: draft from #33 (#32)
+
+Co-authored-by: dantheuber <2682437+dantheuber@users.noreply.github.com>
+
+## Pull requests
+
+### PR #32 — why: capture draft for #33
+
+by @app/github-actions
+
+Automated changes by [create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action
+
+
+## Diffs
+
+### diff of commit 83607dc
+
+````diff
+diff --git a/.why/.drafts/pr-33-why-serve-syntax-highlighting.evidence.md b/.why/.drafts/pr-33-why-serve-syntax-highlighting.evidence.md
+new file mode 100644
+index 0000000..561fec6
+--- /dev/null
++++ b/.why/.drafts/pr-33-why-serve-syntax-highlighting.evidence.md
+@@ -0,0 +1,611 @@
++# Evidence pack: pr-33
++
++- commits: 9c434ae
++- files touched: package-lock.json, package.json, src/cli.ts, test/cli.test.ts, test/serve-highlight.test.ts, test/serve.test.ts, ui/app.js, ui/highlight.js, ui/style.css, vscode-why/.vscode/launch.json, vscode-why/.vscode/tasks.json, vscode-why/.vscodeignore
++- references: PR #33
++
++## Commits
++
++### commit 9c434ae
++
++- author: Dan Essig <dantheuber@users.noreply.github.com>
++- date: 2026-07-12
++
++Why serve syntax highlighting (#33)
++
++* vscode extension fixes and syntax highlighting in the serve ui
++
++* 0.8.1
++
++## Pull requests
++
++### PR #33 — Why serve syntax highlighting
++
++by @dantheuber
++
++- adding syntax highlighting to the code viewed in `why serve` ui
++- fixed an issue with vscode built extension
++
++
++## Diffs
++
++### diff of commit 9c434ae
++
++````diff
++diff --git a/package-lock.json b/package-lock.json
++index 4d14500..43b9a64 100644
++--- a/package-lock.json
+++++ b/package-lock.json
++@@ -1,12 +1,12 @@
++ {
++   "name": "@copperbox/why",
++-  "version": "0.8.0",
+++  "version": "0.8.1",
++   "lockfileVersion": 3,
++   "requires": true,
++   "packages": {
++     "": {
++       "name": "@copperbox/why",
++-      "version": "0.8.0",
+++      "version": "0.8.1",
++       "license": "MIT",
++       "dependencies": {
++         "@copperbox/okf-mcp": "^0.19.1",
++````
++
++````diff
++diff --git a/package.json b/package.json
++index dd214b5..b34587c 100644
++--- a/package.json
+++++ b/package.json
++@@ -1,6 +1,6 @@
++ {
++   "name": "@copperbox/why",
++-  "version": "0.8.0",
+++  "version": "0.8.1",
++   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
++   "type": "module",
++   "license": "MIT",
++````
++
++````diff
++diff --git a/src/cli.ts b/src/cli.ts
++index 5f5e4ef..b005e15 100644
++--- a/src/cli.ts
+++++ b/src/cli.ts
++@@ -2,8 +2,10 @@
++ // `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
++ // DESIGN.md is the source of truth for what each subcommand must do.
++ 
+++import { realpathSync } from "node:fs";
++ import { mkdir, readFile, writeFile } from "node:fs/promises";
++ import { basename, dirname, join, resolve } from "node:path";
+++import { pathToFileURL } from "node:url";
++ import { parseArgs, type ParseArgsConfig } from "node:util";
++ import { AnchorError, renderAnchorReport, resolveAnchors, writeAnchorUpdates } from "./anchor.js";
++ import { CACHE_DIRNAME, ensureSelfIgnoringDir, loadAnchorIndex } from "./anchors.js";
++@@ -634,9 +636,21 @@ export async function main(
++   return spec.run(ctx);
++ }
++ 
++-const isDirectRun =
++-  process.argv[1] !== undefined &&
++-  import.meta.url === new URL(`file://${process.argv[1]}`).href;
++-if (isDirectRun) {
+++// Are we the entry point, or imported (e.g. by tests)? `import.meta.url` is
+++// realpath-resolved, but `process.argv[1]` keeps the invoked path verbatim —
+++// so a symlinked launch (npm's local installs and every `node_modules/.bin`
+++// shim are symlinks) would never match a naive string compare, and `main()`
+++// would silently never run. Resolve argv[1]'s symlinks to the same realpath,
+++// and build the URL with pathToFileURL so odd characters compare correctly.
+++function isDirectRun(): boolean {
+++  const entry = process.argv[1];
+++  if (entry === undefined) return false;
+++  try {
+++    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
+++  } catch {
+++    return false;
+++  }
+++}
+++if (isDirectRun()) {
++   process.exit(await main(process.argv.slice(2)));
++ }
++````
++
++````diff
++diff --git a/test/cli.test.ts b/test/cli.test.ts
++index 9dcc1c9..abdf346 100644
++--- a/test/cli.test.ts
+++++ b/test/cli.test.ts
++@@ -1,9 +1,9 @@
++ import { test } from "node:test";
++ import assert from "node:assert/strict";
++ import { spawnSync } from "node:child_process";
++-import { mkdtemp, mkdir, rm } from "node:fs/promises";
+++import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
++ import { tmpdir } from "node:os";
++-import { join } from "node:path";
+++import { join, resolve } from "node:path";
++ import { COMMANDS, main, usage } from "../src/cli.ts";
++ import { capture } from "./helpers.ts";
++ 
++@@ -70,3 +70,26 @@ test("acceptance: npx tsx src/cli.ts lint examples/harbor is clean", () => {
++   assert.ok(result.stdout.includes("6 concepts"), result.stdout);
++   assert.ok(result.stdout.includes("no findings"), result.stdout);
++ });
+++
+++test("regression: main() runs when launched through a symlink", async () => {
+++  // npm's local installs and every node_modules/.bin shim are symlinks, and
+++  // that is exactly how the VS Code extension shells out to the CLI. The
+++  // direct-run guard must resolve argv[1]'s symlinks (import.meta.url is
+++  // already realpath-resolved); a naive string compare left main() silently
+++  // un-run — empty stdout, exit 0 — and the extension rendered nothing.
+++  const dir = await mkdtemp(join(tmpdir(), "why-cli-link-"));
+++  try {
+++    const link = join(dir, "why-link.ts");
+++    await symlink(resolve("src/cli.ts"), link);
+++    const result = spawnSync(process.execPath, ["--import", "tsx", link, "--help"], {
+++      encoding: "utf8",
+++    });
+++    assert.equal(result.status, 0, result.stderr);
+++    assert.ok(
+++      result.stdout.includes("why — decision archaeology"),
+++      `guard skipped main(): ${JSON.stringify(result.stdout)}`,
+++    );
+++  } finally {
+++    await rm(dir, { recursive: true, force: true });
+++  }
+++});
++````
++
++````diff
++diff --git a/test/serve-highlight.test.ts b/test/serve-highlight.test.ts
++new file mode 100644
++index 0000000..48a57fb
++--- /dev/null
+++++ b/test/serve-highlight.test.ts
++@@ -0,0 +1,98 @@
+++// The file view's syntax highlighter (ui/highlight.js) is best-effort and
+++// purely presentational, but it has one hard invariant: it must never alter the
+++// code it colors. Every test here first asserts the round-trip — the token
+++// texts, joined, reproduce the input line verbatim — then checks a specific
+++// classification. Rendering goes through jsdom (no browser), the same way the
+++// SPA drives it, so a token becoming a `tok-*` span is proven end to end.
+++
+++import { test } from "node:test";
+++import assert from "node:assert/strict";
+++import { JSDOM } from "jsdom";
+++// @ts-expect-error — plain-JS UI module, no types
+++import { appendTokens, langForPath, tokenize } from "../ui/highlight.js";
+++
+++/** tokenize + the round-trip guard in one call: the lexer may never drop or
+++ * mutate a character. Returns the tokens and the carry state. */
+++function lex(line: string, lang: string | null, state: unknown 
[clipped: diff of .why/.drafts/pr-32-why-capture-draft-for-33.evidence.md in 0e7ff62 — showing 8000 of 13190 chars]
````

````diff
diff --git a/.why/.drafts/pr-32-why-capture-draft-for-33.md b/.why/.drafts/pr-32-why-capture-draft-for-33.md
new file mode 100644
index 0000000..de81c39
--- /dev/null
+++ b/.why/.drafts/pr-32-why-capture-draft-for-33.md
@@ -0,0 +1,40 @@
+---
+type: decision
+title: "why: capture draft for #33"
+description: "Draft captured from PR #32 — replace with the one-line truth this
+  decision created."
+why:
+  status: active
+  happened_on: 2026-07-13
+  confidence: recorded
+  anchors:
+    - path: .why/.drafts/pr-33-why-serve-syntax-highlighting.evidence.md
+      lines: 1-611
+      as_of: 83607dc7b699949fd15475e412edced9863f1cee
+      state: live
+    - path: .why/.drafts/pr-33-why-serve-syntax-highlighting.md
+      lines: 1-109
+      as_of: 83607dc7b699949fd15475e412edced9863f1cee
+      state: live
+---
+
+# why: capture draft for #33
+
+<!-- capture draft from PR #32 (merged 2026-07-13). Replace this comment with a
+one-paragraph summary: what is true now because of this decision. -->
+
+# Why
+
+<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
+the why, rewrite it into narrative, and delete the rest. Never keep a claim
+the quotes below do not support (DESIGN.md §2). Full evidence pack:
+.drafts/pr-32-why-capture-draft-for-33.evidence.md (removed on promote) -->
+
+> Automated changes by [create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action
+
+— PR #32 description by @app/github-actions
+
+# Citations
+
+[1] [PR #32: why: capture draft for #33](https://github.com/copperbox/why/pull/32)
+[2] [merge commit 83607dc](https://github.com/copperbox/why/commit/83607dc7b699949fd15475e412edced9863f1cee)
````
