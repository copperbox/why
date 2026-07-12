import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { findSymbol } from "../src/find-symbol.ts";

// Every test builds a throwaway repo in a temp dir — nothing here depends on
// this repository's own history, and no grammar is fetched from the network
// (web-tree-sitter and tree-sitter-wasms are ordinary package.json deps).

function git(repo: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

function makeRepo(t: { after(fn: () => void): void }): string {
  const repo = mkdtempSync(join(tmpdir(), "why-symbol-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "user.name", "symbol-test");
  return repo;
}

function write(repo: string, rel: string, lines: string[]): void {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, lines.join("\n") + "\n");
}

function commit(repo: string, msg: string): string {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
  return git(repo, "rev-parse", "HEAD").trim();
}

// One fixture per grammar-backed language. `present` declares the symbol
// exactly once at `span`; `renamed` has it renamed away; `duplicate` declares
// it twice; `unrelated` is a different file that also declares it.
interface LanguageCase {
  language: string;
  ext: string;
  symbol: string;
  present: string[];
  span: { start: number; end: number };
  renamed: string[];
  duplicate: string[];
  unrelated: string[];
}

const LANGUAGE_CASES: LanguageCase[] = [
  {
    language: "typescript",
    ext: ".ts",
    symbol: "targetSym",
    present: [
      "const PAD = 2;",
      "",
      "export function targetSym(a: number): number {",
      "  return a + PAD;",
      "}",
      "",
      "export function other(): number {",
      "  return PAD;",
      "}",
    ],
    span: { start: 3, end: 5 },
    renamed: [
      "const PAD = 2;",
      "",
      "export function renamedSym(a: number): number {",
      "  return a + PAD;",
      "}",
    ],
    duplicate: [
      "export function targetSym(a: number): number;",
      "export function targetSym(a: string): string;",
      "export function targetSym(a: unknown): unknown {",
      "  return a;",
      "}",
    ],
    unrelated: [
      "export function targetSym(a: number): number {",
      "  return a * 100; // unrelated homonym",
      "}",
    ],
  },
  {
    language: "javascript",
    ext: ".js",
    symbol: "targetSym",
    present: [
      "function targetSym(a) {",
      "  return a + 1;",
      "}",
      "module.exports = { targetSym };",
    ],
    span: { start: 1, end: 3 },
    renamed: ["function renamedSym(a) {", "  return a + 1;", "}"],
    duplicate: [
      "function targetSym(a) {",
      "  return a;",
      "}",
      "function targetSym(a, b) {",
      "  return a + b;",
      "}",
    ],
    unrelated: ["function targetSym(x) {", "  return x * 100; // unrelated homonym", "}"],
  },
  {
    language: "rust",
    ext: ".rs",
    symbol: "target_sym",
    present: [
      "pub fn target_sym(a: u32) -> u32 {",
      "    a + 1",
      "}",
      "",
      "pub fn other() -> u32 {",
      "    2",
      "}",
    ],
    span: { start: 1, end: 3 },
    renamed: ["pub fn renamed_sym(a: u32) -> u32 {", "    a + 1", "}"],
    duplicate: [
      "struct A;",
      "struct B;",
      "impl A {",
      "    fn target_sym(&self) -> u32 { 1 }",
      "}",
      "impl B {",
      "    fn target_sym(&self) -> u32 { 2 }",
      "}",
    ],
    unrelated: ["pub fn target_sym(x: u64) -> u64 {", "    x * 100 // unrelated homonym", "}"],
  },
  {
    language: "python",
    ext: ".py",
    symbol: "target_sym",
    present: ["PAD = 2", "", "def target_sym(a):", "    return a + PAD", "", "def other():", "    return PAD"],
    span: { start: 3, end: 4 },
    renamed: ["PAD = 2", "", "def renamed_sym(a):", "    return a + PAD"],
    duplicate: ["def target_sym(a):", "    return a", "", "def target_sym(a, b):", "    return a + b"],
    unrelated: ["def target_sym(x):", "    return x * 100  # unrelated homonym"],
  },
  {
    language: "go",
    ext: ".go",
    symbol: "targetSym",
    present: [
      "package m",
      "",
      "func targetSym(a int) int {",
      "\treturn a + 1",
      "}",
      "",
      "func other() int {",
      "\treturn 2",
      "}",
    ],
    span: { start: 3, end: 5 },
    renamed: ["package m", "", "func renamedSym(a int) int {", "\treturn a + 1", "}"],
    duplicate: [
      "package m",
      "",
      "type A struct{}",
      "",
      "func (a A) targetSym() int { return 1 }",
      "",
      "func targetSym() int { return 2 }",
    ],
    unrelated: ["package u", "", "func targetSym(x int) int {", "\treturn x * 100 // unrelated homonym", "}"],
  },
];

for (const c of LANGUAGE_CASES) {
  const file = `src/mod${c.ext}`;

  test(`${c.language}: symbol present in the same file returns its span`, async (t) => {
    const repo = makeRepo(t);
    write(repo, file, c.present);
    const asOf = commit(repo, "c1");
    const res = await findSymbol(repo, { path: file, symbol: c.symbol, asOf });
    assert.deepEqual(res, { found: true, path: file, lines: c.span, confidence: "syntactic" });
  });

  test(`${c.language}: symbol renamed away returns not-found, never a guess`, async (t) => {
    const repo = makeRepo(t);
    write(repo, file, c.present);
    const asOf = commit(repo, "c1");
    write(repo, file, c.renamed);
    commit(repo, "c2 rename the symbol");
    const res = await findSymbol(repo, { path: file, symbol: c.symbol, asOf });
    assert.deepEqual(res, { found: false, reason: "not-found" });
  });

  test(`${c.language}: file git mv'ed with the symbol intact is followed`, async (t) => {
    const repo = makeRepo(t);
    write(repo, file, c.present);
    const asOf = commit(repo, "c1");
    mkdirSync(join(repo, "lib"), { recursive: true });
    git(repo, "mv", file, `lib/moved${c.ext}`);
    commit(repo, "c2 move the file");
    const res = await findSymbol(repo, { path: file, symbol: c.symbol, asOf });
    assert.deepEqual(res, {
      found: true,
      path: `lib/moved${c.ext}`,
      lines: c.span,
      confidence: "syntactic",
    });
  });

  test(`${c.language}: same-named symbol in an unconnected file is not followed`, async (t) => {
    const repo = makeRepo(t);
    write(repo, file, c.present);
    const asOf = commit(repo, "c1");
    git(repo, "rm", "-q", file);
    commit(repo, "c2 delete the original");
    write(repo, `src/unrelated${c.ext}`, c.unrelated);
    commit(repo, "c3 unrelated file with the same name");
    const res = await findSymbol(repo, { path: file, symbol: c.symbol, asOf });
    assert.deepEqual(res, { found: false, reason: "not-found" });
  });

  test(`${c.language}: duplicate declarations are ambiguous, never a guess`, async (t) => {
    const repo = makeRepo(t);
    write(repo, file, c.duplicate);
    const asOf = commit(repo, "c1");
    const res = await findSymbol(repo, { path: file, symbol: c.symbol, asOf });
    assert.deepEqual(res, { found: false, reason: "ambiguous" });
  });
}

test("typescript: span reflects HEAD after edits above the symbol", async (t) => {
  const c = LANGUAGE_CASES[0];
  const repo = makeRepo(t);
  write(repo, "src/mod.ts", c.present);
  const asOf = commit(repo, "c1");
  write(repo, "src/mod.ts", ["// one", "// two", "// three", ...c.present]);
  commit(repo, "c2 insert three lines above");
  const res = await findSymbol(repo, { path: "src/mod.ts", symbol: c.symbol, asOf });
  assert.deepEqual(res, {
    found: true,
    path: "src/mod.ts",
    lines: { start: c.span.start + 3, end: c.span.end + 3 },
    confidence: "syntactic",
  });
});

test("rust: a connected move wins while an unconnected homonym is ignored", async (t) => {
  const c = LANGUAGE_CASES[2];
  const repo = makeRepo(t);
  write(repo, "src/mod.rs", c.present);
  const asOf = commit(repo, "c1");
  git(repo, "mv", "src/mod.rs", "src/moved.rs");
  commit(repo, "c2 move");
  write(repo, "src/unrelated.rs", c.unrelated);
  commit(repo, "c3 unrelated homonym");
  const res = await findSymbol(repo, { path: "src/mod.rs", symbol: c.symbol, asOf });
  assert.deepEqual(res, {
    found: true,
    path: "src/moved.rs",
    lines: c.span,
    confidence: "syntactic",
  });
});

test("typescript: a module-scope const anchor resolves via its declarator", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/mod.ts", [
    "export const REQUEST_DEADLINE = 45_000;",
    "",
    "export function other(): number {",
    "  const REQUEST_DEADLINE = 1; // local shadow must not create ambiguity",
    "  return REQUEST_DEADLINE;",
    "}",
  ]);
  const asOf = commit(repo, "c1");
  const res = await findSymbol(repo, { path: "src/mod.ts", symbol: "REQUEST_DEADLINE", asOf });
  assert.deepEqual(res, {
    found: true,
    path: "src/mod.ts",
    lines: { start: 1, end: 1 },
    confidence: "syntactic",
  });
});

// --- regex-heuristic fallback (unsupported extensions) -----------------------

test("toml: a key = value never yields a fabricated range", async (t) => {
  const repo = makeRepo(t);
  write(repo, "config.toml", ["[server]", "retry_limit = 5", 'host = "example.invalid"']);
  const asOf = commit(repo, "c1");
  const res = await findSymbol(repo, { path: "config.toml", symbol: "retry_limit", asOf });
  assert.deepEqual(res, { found: false, reason: "not-found" });
});

test("unsupported extension: a real declaration is found but marked heuristic", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/build.zig", [
    "const std = @import(\"std\");",
    "",
    "fn targetSym(a: u32) u32 {",
    "    return a + 1;",
    "}",
  ]);
  const asOf = commit(repo, "c1");
  const res = await findSymbol(repo, { path: "src/build.zig", symbol: "targetSym", asOf });
  // The heuristic may only claim the declaration line itself — it cannot know
  // the declaration's extent, so a wider range would be fabricated.
  assert.deepEqual(res, {
    found: true,
    path: "src/build.zig",
    lines: { start: 3, end: 3 },
    confidence: "heuristic",
  });
});

test("unsupported extension: duplicate declarations are ambiguous", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/dup.zig", ["fn targetSym() void {}", "fn targetSym(a: u32) void {}"]);
  const asOf = commit(repo, "c1");
  const res = await findSymbol(repo, { path: "src/dup.zig", symbol: "targetSym", asOf });
  assert.deepEqual(res, { found: false, reason: "ambiguous" });
});

// --- input validation --------------------------------------------------------

test("throws on an as_of that does not resolve to a commit", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/mod.ts", ["export function f(): void {}"]);
  commit(repo, "c1");
  await assert.rejects(
    findSymbol(repo, { path: "src/mod.ts", symbol: "f", asOf: "deadbeef" }),
    /as_of/,
  );
});

test("throws when as_of is not an ancestor of HEAD", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/mod.ts", ["export function f(): void {}"]);
  commit(repo, "c1");
  git(repo, "checkout", "-q", "-b", "side");
  write(repo, "src/side.ts", ["export function g(): void {}"]);
  const sideSha = commit(repo, "side commit");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/main.ts", ["export function h(): void {}"]);
  commit(repo, "c2");
  await assert.rejects(
    findSymbol(repo, { path: "src/mod.ts", symbol: "f", asOf: sideSha }),
    /ancestor/,
  );
});

test("throws on an empty symbol", async (t) => {
  const repo = makeRepo(t);
  write(repo, "src/mod.ts", ["export function f(): void {}"]);
  const asOf = commit(repo, "c1");
  await assert.rejects(findSymbol(repo, { path: "src/mod.ts", symbol: "  ", asOf }), /non-empty/);
});
