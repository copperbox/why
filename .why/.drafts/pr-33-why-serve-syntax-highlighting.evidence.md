# Evidence pack: pr-33

- commits: 9c434ae
- files touched: package-lock.json, package.json, src/cli.ts, test/cli.test.ts, test/serve-highlight.test.ts, test/serve.test.ts, ui/app.js, ui/highlight.js, ui/style.css, vscode-why/.vscode/launch.json, vscode-why/.vscode/tasks.json, vscode-why/.vscodeignore
- references: PR #33

## Commits

### commit 9c434ae

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-12

Why serve syntax highlighting (#33)

* vscode extension fixes and syntax highlighting in the serve ui

* 0.8.1

## Pull requests

### PR #33 — Why serve syntax highlighting

by @dantheuber

- adding syntax highlighting to the code viewed in `why serve` ui
- fixed an issue with vscode built extension


## Diffs

### diff of commit 9c434ae

````diff
diff --git a/package-lock.json b/package-lock.json
index 4d14500..43b9a64 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "@copperbox/why",
-  "version": "0.8.0",
+  "version": "0.8.1",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "@copperbox/why",
-      "version": "0.8.0",
+      "version": "0.8.1",
       "license": "MIT",
       "dependencies": {
         "@copperbox/okf-mcp": "^0.19.1",
````

````diff
diff --git a/package.json b/package.json
index dd214b5..b34587c 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@copperbox/why",
-  "version": "0.8.0",
+  "version": "0.8.1",
   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
   "type": "module",
   "license": "MIT",
````

````diff
diff --git a/src/cli.ts b/src/cli.ts
index 5f5e4ef..b005e15 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -2,8 +2,10 @@
 // `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
 // DESIGN.md is the source of truth for what each subcommand must do.
 
+import { realpathSync } from "node:fs";
 import { mkdir, readFile, writeFile } from "node:fs/promises";
 import { basename, dirname, join, resolve } from "node:path";
+import { pathToFileURL } from "node:url";
 import { parseArgs, type ParseArgsConfig } from "node:util";
 import { AnchorError, renderAnchorReport, resolveAnchors, writeAnchorUpdates } from "./anchor.js";
 import { CACHE_DIRNAME, ensureSelfIgnoringDir, loadAnchorIndex } from "./anchors.js";
@@ -634,9 +636,21 @@ export async function main(
   return spec.run(ctx);
 }
 
-const isDirectRun =
-  process.argv[1] !== undefined &&
-  import.meta.url === new URL(`file://${process.argv[1]}`).href;
-if (isDirectRun) {
+// Are we the entry point, or imported (e.g. by tests)? `import.meta.url` is
+// realpath-resolved, but `process.argv[1]` keeps the invoked path verbatim —
+// so a symlinked launch (npm's local installs and every `node_modules/.bin`
+// shim are symlinks) would never match a naive string compare, and `main()`
+// would silently never run. Resolve argv[1]'s symlinks to the same realpath,
+// and build the URL with pathToFileURL so odd characters compare correctly.
+function isDirectRun(): boolean {
+  const entry = process.argv[1];
+  if (entry === undefined) return false;
+  try {
+    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
+  } catch {
+    return false;
+  }
+}
+if (isDirectRun()) {
   process.exit(await main(process.argv.slice(2)));
 }
````

````diff
diff --git a/test/cli.test.ts b/test/cli.test.ts
index 9dcc1c9..abdf346 100644
--- a/test/cli.test.ts
+++ b/test/cli.test.ts
@@ -1,9 +1,9 @@
 import { test } from "node:test";
 import assert from "node:assert/strict";
 import { spawnSync } from "node:child_process";
-import { mkdtemp, mkdir, rm } from "node:fs/promises";
+import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
 import { tmpdir } from "node:os";
-import { join } from "node:path";
+import { join, resolve } from "node:path";
 import { COMMANDS, main, usage } from "../src/cli.ts";
 import { capture } from "./helpers.ts";
 
@@ -70,3 +70,26 @@ test("acceptance: npx tsx src/cli.ts lint examples/harbor is clean", () => {
   assert.ok(result.stdout.includes("6 concepts"), result.stdout);
   assert.ok(result.stdout.includes("no findings"), result.stdout);
 });
+
+test("regression: main() runs when launched through a symlink", async () => {
+  // npm's local installs and every node_modules/.bin shim are symlinks, and
+  // that is exactly how the VS Code extension shells out to the CLI. The
+  // direct-run guard must resolve argv[1]'s symlinks (import.meta.url is
+  // already realpath-resolved); a naive string compare left main() silently
+  // un-run — empty stdout, exit 0 — and the extension rendered nothing.
+  const dir = await mkdtemp(join(tmpdir(), "why-cli-link-"));
+  try {
+    const link = join(dir, "why-link.ts");
+    await symlink(resolve("src/cli.ts"), link);
+    const result = spawnSync(process.execPath, ["--import", "tsx", link, "--help"], {
+      encoding: "utf8",
+    });
+    assert.equal(result.status, 0, result.stderr);
+    assert.ok(
+      result.stdout.includes("why — decision archaeology"),
+      `guard skipped main(): ${JSON.stringify(result.stdout)}`,
+    );
+  } finally {
+    await rm(dir, { recursive: true, force: true });
+  }
+});
````

````diff
diff --git a/test/serve-highlight.test.ts b/test/serve-highlight.test.ts
new file mode 100644
index 0000000..48a57fb
--- /dev/null
+++ b/test/serve-highlight.test.ts
@@ -0,0 +1,98 @@
+// The file view's syntax highlighter (ui/highlight.js) is best-effort and
+// purely presentational, but it has one hard invariant: it must never alter the
+// code it colors. Every test here first asserts the round-trip — the token
+// texts, joined, reproduce the input line verbatim — then checks a specific
+// classification. Rendering goes through jsdom (no browser), the same way the
+// SPA drives it, so a token becoming a `tok-*` span is proven end to end.
+
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { JSDOM } from "jsdom";
+// @ts-expect-error — plain-JS UI module, no types
+import { appendTokens, langForPath, tokenize } from "../ui/highlight.js";
+
+/** tokenize + the round-trip guard in one call: the lexer may never drop or
+ * mutate a character. Returns the tokens and the carry state. */
+function lex(line: string, lang: string | null, state: unknown = null) {
+  const result = tokenize(line, lang, state);
+  const joined = result.tokens.map((t: { text: string }) => t.text).join("");
+  assert.equal(joined, line, `highlighter altered the line: "${joined}" !== "${line}"`);
+  return result;
+}
+
+const classOf = (tokens: Array<{ text: string; cls: string | null }>, text: string) =>
+  tokens.find((t) => t.text === text)?.cls;
+
+test("langForPath maps known extensions and rejects the rest", () => {
+  assert.equal(langForPath("src/serve.ts"), "ts");
+  assert.equal(langForPath("crates/db/lock.rs"), "rust");
+  assert.equal(langForPath("scripts/build.py"), "python");
+  assert.equal(langForPath("main.go"), "go");
+  assert.equal(langForPath("README.md"), null);
+  assert.equal(langForPath("Makefile"), null); // no extension → plain
+});
+
+test("an unknown language renders as a single plain token, unchanged", () => {
+  const { tokens, state } = lex("some :: arbitrary || text", null);
+  assert.equal(state, null);
+  assert.deepEqual(tokens, [{ text: "some :: arbitrary || text", cls: null }]);
+});
+
+test("classifies keywords, strings, comments, numbers, types and calls", () => {
+  const { tokens } = lex(`const port = connect("127.0.0.1"); // bind`, "ts");
+  assert.equal(classOf(tokens, "const"), "kw");
+  assert.equal(classOf(tokens, "connect"), "fn");
+  assert.equal(classOf(tokens, `"127.0.0.1"`), "str");
+  assert.equal(classOf(tokens, "// bind"), "com");
+
+  const typed = lex("let n: usize = 0x1F;", "rust").tokens;
+  assert.equal(classOf(typed, "let"), "kw");
+  assert.equal(classOf(typed, "usize"), "kw"); // rust primitive is a keyword here
+  assert.equal(classOf(typed, "0x1F"), "num");
+
+  const generic = lex("const p: Point = mk();", "ts").tokens;
+  assert.equal(classOf(generic, "Point"), "type"); // capitalized → type
+});
+
+test("a block comment carries across lines via the returned state", () => {
+  const first = lex("code(); /* open", "ts");
+  assert.deepEqual(first.state, { block: true });
+  assert.equal(classOf(first.tokens, "/* open"), "com");
+  assert.equal(classOf(first.tokens, "code"), "fn");
+
+  const middle = lex("still comment", "ts", first.state);
+  assert.deepEqual(middle.state, { block: true });
+  assert.equal(middle.tokens[0].cls, "com");
+
+  const last = lex("end */ live();", "ts", middle.state);
+  assert.equal(last.state, null);
+  assert.equal(classOf(last.tokens, "end */"), "com");
+  assert.equal(classOf(last.tokens, "live"), "fn");
+});
+
+test("Rust lifetimes stay plain; char literals are strings", () => {
+  const life = lex("fn f<'a>(x: &'a str) {", "rust").tokens;
+  // No token equals a lifetime-as-string; the ' is emitted as plain text.
+  assert.ok(
+    !life.some((t: { cls: string | null }) => t.cls === "str"),
+    "a lifetime must not become a string",
+  );
+  assert.equal(classOf(life, "fn"), "kw");
+
+  const ch = lex("let c = 'x';", "rust").tokens;
+  assert.equal(classOf(ch, "'x'"), "str");
+});
+
+test("appendTokens renders classed runs as tok-* spans and preserves text", () => {
+  const dom = new JSDOM("<!doctype html><html><body></body></html>");
+  const doc = dom.window.document;
+  const cell = doc.createElement("td");
+  const line = `const x = "hi"; // note`;
+  const { tokens } = lex(line, "ts");
+  appendTokens(doc, cell, tokens);
+
+  assert.equal(cell.textContent, line, "rendered text must equal the source line");
+  assert.equal(cell.querySelector(".tok-kw")!.textContent, "const");
+  assert.equal(cell.querySelector(".tok-str")!.textContent, `"hi"`);
+  assert.equal(cell.querySelector(".tok-com")!.textContent, "// note");
+});
````

````diff
diff --git a/test/serve.test.ts b/test/serve.test.ts
index 6579e1c..0fef910 100644
--- a/test/serve.test.ts
+++ b/test/serve.test.ts
@@ -226,6 +226,14 @@ test("the built app boots in jsdom: tree renders, gutter paints, click tells the
   assert.ok(gutter.classList.contains("why-conf-recorded"), gutter.className);
   assert.equal(gutter.textContent, "●");
 
+  // The bundled highlighter (ui/highlight.js) colors the Rust source — every
+  // `// line N` becomes a comment token span — without ever altering the code:
+  // each td.text still reads exactly as HEAD blamed it.
+  assert.ok(doc.querySelector("table.code td.text .tok-com"), "Rust comments are highlighted");
+  const blame = await (await fetch(new URL("/api/blame?path=src/lock.rs", running.url))).json();
+  const rendered = [...doc.querySelectorAll("table.code td.text")].map((c) => c.textContent);
+  assert.deepEqual(rendered, blame.lines.map((l: { text: string }) => l.text), "highlighting is verbatim");
+
   // Click line 47 → the story panel renders the loud warning first (matching
   // the VS Code hover/webview order), then the hit.
   (line47 as HTMLElement).click();
````

````diff
diff --git a/ui/app.js b/ui/app.js
index d1ca4c9..54c7f43 100644
--- a/ui/app.js
+++ b/ui/app.js
@@ -4,6 +4,7 @@
 // from the JSON API; nothing here re-derives them (docs/ui-contract.md).
 
 import { renderGraph, TYPE_COLORS } from "./graph.js";
+import { appendTokens, langForPath, tokenize } from "./highlight.js";
 import { renderStoryPanel } from "./story-panel.js";
 
 const doc = document;
@@ -143,6 +144,8 @@ async function showFile(path, fileView, storyPanel) {
   const spans = state.coverage.get(path) ?? [];
 
   const table = h("table", "code");
+  const lang = langForPath(path);
+  let hlState = null; // threaded across lines so a block comment can span rows
   let prevSha = "";
   blame.lines.forEach((line, i) => {
     const n = i + 1;
@@ -164,7 +167,11 @@ async function showFile(path, fileView, storyPanel) {
       row.classList.add("covered");
     }
     row.append(why);
-    row.append(h("td", "text", line.text));
+    const textCell = h("td", "text");
+    const { tokens, state } = tokenize(line.text, lang, hlState);
+    hlState = state;
+    appendTokens(doc, textCell, tokens);
+    row.append(textCell);
     row.onclick = () => showStory(path, n, storyPanel);
     table.append(row);
   });
````

````diff
diff --git a/ui/highlight.js b/ui/highlight.js
new file mode 100644
index 0000000..912eb41
--- /dev/null
+++ b/ui/highlight.js
@@ -0,0 +1,202 @@
+// Hand-rolled, dependency-free syntax highlighting for the file view — the same
+// self-contained/zero-CDN philosophy as the graph's canvas force sim (ui/graph.js).
+// Highlighting is pure presentation: it colors the code text the blame payload
+// already carries and asserts nothing about the *why*, so it lives in the client
+// renderer rather than in the UI data contract.
+//
+// `tokenize` is a small, stateless-per-call lexer that a caller drives line by
+// line, threading the returned `state` back in so a block comment can span rows
+// (blame gives us one line at a time). It is deliberately best-effort: unknown
+// languages, multi-line strings, and Rust lifetimes vs char literals are handled
+// gracefully but not perfectly. Every character of the input is emitted in some
+// token, so joining the token texts always reproduces the line verbatim.
+
+/** Extensions → a language key in LANGS, or null for "render as plain text". */
+const LANG_BY_EXTENSION = {
+  ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "ts",
+  ".js": "ts", ".mjs": "ts", ".cjs": "ts", ".jsx": "ts",
+  ".rs": "rust",
+  ".py": "python", ".pyi": "python",
+  ".go": "go",
+  ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".hpp": "c", ".cxx": "c",
+  ".java": "c", ".cs": "c",
+  ".json": "json",
+};
+
+const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
+
+// A language is a lexer config, not a grammar: comment/string delimiters plus a
+// keyword set. `char` enables Rust-style char-literal detection so lifetimes
+// (`'a`) are not mistaken for an unterminated string.
+const LANGS = {
+  ts: {
+    line: "//", block: ["/*", "*/"], quotes: ["\"", "'", "`"],
+    keywords: words(`abstract any as async await boolean break case catch class const continue
+      debugger declare default delete do else enum export extends false finally for from function
+      get if implements import in infer instanceof interface is keyof let module namespace never new
+      null number object of override private protected public readonly return satisfies set static
+      string super switch symbol this throw true try type typeof undefined unknown var void while
+      with yield`),
+  },
+  rust: {
+    line: "//", block: ["/*", "*/"], quotes: ["\""], char: true,
+    keywords: words(`as async await bool break char const continue crate dyn else enum extern false
+      fn for i8 i16 i32 i64 i128 if impl in isize let loop match mod move mut pub ref return self
+      Self static str struct super trait true type u8 u16 u32 u64 u128 union unsafe use usize where
+      while f32 f64`),
+  },
+  python: {
+    line: "#", block: null, quotes: ["\"", "'"],
+    keywords: words(`and as assert async await break class continue def del elif else except False
+      finally for from global if import in is lambda None nonlocal not or pass raise return True try
+      while with yield self`),
+  },
+  go: {
+    line: "//", block: ["/*", "*/"], quotes: ["\"", "`", "'"], char: true,
+    keywords: words(`break case chan const continue default defer else fallthrough for func go goto
+      if import interface map package range return select struct switch type var bool byte error
+      false float32 float64 int int8 int16 int32 int64 nil rune string true uint uintptr`),
+  },
+  c: {
+    line: "//", block: ["/*", "*/"], quotes: ["\"", "'"],
+    keywords: words(`auto bool break case catch char class const constexpr continue default delete
+      do double else enum extern false final float for friend goto if inline int long namespace new
+      nullptr operator override private protected public register return short signed sizeof static
+      struct switch template this throw true try typedef typename union unsigned using virtual void
+      volatile while`),
+  },
+  json: { line: null, block: null, quotes: ["\""], keywords: words("true false null") },
+};
+
+const isIdentStart = (ch) => /[A-Za-z_$]/.test(ch);
+const isIdent = (ch) => /[A-Za-z0-9_$]/.test(ch);
+const isDigit = (ch) => ch >= "0" && ch <= "9";
+
+/** File extension of a repo-relative path, lowercased, including the dot. */
+function extname(path) {
+  const base = path.slice(path.lastIndexOf("/") + 1);
+  const dot = base.lastIndexOf(".");
+  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
+}
+
+/** The language key for a path, or null when we have no lexer for it. */
+export function langForPath(path) {
+  return LANG_BY_EXTENSION[extname(path)] ?? null;
+}
+
+/**
+ * Lex one line into `{ text, cls }` runs. `cls` is a token class ("kw", "str",
+ * "com", "num", "type", "fn") or null for plain text. `state` carries a pending
+ * block comment across lines; pass the returned `state` into the next line.
+ */
+export function tokenize(text, lang, state) {
+  const spec = lang && LANGS[lang];
+  if (!spec) return { tokens: text === "" ? [] : [{ text, cls: null }], state: null };
+
+  const tokens = [];
+  let plain = "";
+  const flush = () => {
+    if (plain !== "") tokens.push({ text: plain, cls: null });
+    plain = "";
+  };
+  const push = (t, cls) => {
+    flush();
+    tokens.push({ text: t, cls });
+  };
+
+  let i = 0;
+  // Resume an open block comment from the previous line.
+  if (state && state.block && spec.block) {
+    const close = text.indexOf(spec.block[1]);
+    if (close === -1) {
+      return { tokens: [{ text, cls: "com" }], state: { block: true } };
+    }
+    push(text.slice(0, close + spec.block[1].length), "com");
+    i = close + spec.block[1].length;
+  }
+
+  while (i < text.length) {
+    const ch = text[i];
+    const rest = text.slice(i);
+
+    if (spec.line && rest.startsWith(spec.line)) {
+      push(rest, "com");
+      i = text.length;
+      break;
+    }
+    if (spec.block && rest.startsWith(spec.block[0])) {
+      const close = text.indexOf(spec.block[1], i + spec.block[0].length);
+      if (close === -1) {
+        push(rest, "com");
+        return { tokens, state: { block: true } };
+      }
+      const end = close + spec.block[1].length;
+      push(text.slice(i, end), "com");
+      i = end;
+      continue;
+    }
+    // Rust/Go char vs lifetime: only lex `'` as a string when it looks like a
+    // char literal; otherwise it is a lifetime/label and stays plain.
+    if (spec.char && ch === "'") {
+      const m = /^'(\\.|[^'\\])'/.exec(rest);
+      if (m) {
+        push(m[0], "str");
+        i += m[0].length;
+        continue;
+      }
+      plain += ch;
+      i++;
+      continue;
+    }
+    if (spec.quotes.includes(ch)) {
+      let j = i + 1;
+      while (j < text.length) {
+        if (text[j] === "\\") { j += 2; continue; }
+        if (text[j] === ch) { j++; break; }
+        j++;
+      }
+      push(text.slice(i, j), "str");
+      i = j;
+      continue;
+    }
+    if (isDigit(ch) || (ch === "." && isDigit(text[i + 1] ?? ""))) {
+      let j = i;
+      while (j < text.length && /[0-9a-fA-FxXoObB._]/.test(text[j])) j++;
+      push(text.slice(i, j), "num");
+      i = j;
+      continue;
+    }
+    if (isIdentStart(ch)) {
+      let j = i;
+      while (j < text.length && isIdent(text[j])) j++;
+      const word = text.slice(i, j);
+      let k = j;
+      while (k < text.length && (text[k] === " " || text[k] === "\t")) k++;
+      let cls = null;
+      if (spec.keywords.has(word)) cls = "kw";
+      else if (/^[A-Z]/.test(word)) cls = "type";
+      else if (text[k] === "(") cls = "fn";
+      push(word, cls);
+      i = j;
+      continue;
+    }
+    plain += ch;
+    i++;
+  }
+  flush();
+  return { tokens, state: null };
+}
+
+/** Append `tokenize` output into `cell`; classed runs become spans, plain text
+ * stays a text node so `white-space: pre` preserves it exactly. */
+export function appendTokens(doc, cell, tokens) {
+  for (const { text, cls } of tokens) {
+    if (cls === null) cell.append(d
[clipped: diff of ui/highlight.js in 9c434ae — showing 8000 of 8195 chars]
````

````diff
diff --git a/ui/style.css b/ui/style.css
index 6214e84..d9fcb96 100644
--- a/ui/style.css
+++ b/ui/style.css
@@ -124,6 +124,15 @@ td.num { color: var(--dim); text-align: right; user-select: none; width: 3.5rem;
 td.git { color: var(--dim); width: 12rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; }
 td.text { width: 100%; }
 
+/* Syntax highlighting (ui/highlight.js) — best-effort token classes over the
+ * code text; purely presentational, layered on top of the blame payload. */
+td.text .tok-kw { color: #c678dd; }
+td.text .tok-str { color: #98c379; }
+td.text .tok-com { color: var(--dim); font-style: italic; }
+td.text .tok-num { color: #d19a66; }
+td.text .tok-type { color: #e5c07b; }
+td.text .tok-fn { color: #61afef; }
+
 /* The why gutter stripe: color by confidence; scar tissue and questions
  * get their own loud treatments. */
 td.why {
````

````diff
diff --git a/vscode-why/.vscode/launch.json b/vscode-why/.vscode/launch.json
new file mode 100644
index 0000000..9597828
--- /dev/null
+++ b/vscode-why/.vscode/launch.json
@@ -0,0 +1,16 @@
+{
+  "version": "0.2.0",
+  "configurations": [
+    {
+      "name": "Run Extension",
+      "type": "extensionHost",
+      "request": "launch",
+      "args": [
+        "--extensionDevelopmentPath=${workspaceFolder}",
+        "/home/dan/why-vscode-qa"
+      ],
+      "outFiles": ["${workspaceFolder}/out/**/*.js"],
+      "preLaunchTask": "npm: build"
+    }
+  ]
+}
````

````diff
diff --git a/vscode-why/.vscode/tasks.json b/vscode-why/.vscode/tasks.json
new file mode 100644
index 0000000..d54416b
--- /dev/null
+++ b/vscode-why/.vscode/tasks.json
@@ -0,0 +1,12 @@
+{
+  "version": "2.0.0",
+  "tasks": [
+    {
+      "type": "npm",
+      "script": "build",
+      "problemMatcher": ["$tsc"],
+      "group": "build",
+      "label": "npm: build"
+    }
+  ]
+}
````

````diff
diff --git a/vscode-why/.vscodeignore b/vscode-why/.vscodeignore
index 067a803..bd36c37 100644
--- a/vscode-why/.vscodeignore
+++ b/vscode-why/.vscodeignore
@@ -1,4 +1,5 @@
 .vscodeignore
+.vscode/**
 tsconfig.json
 tsconfig.build.json
 src/**
````
