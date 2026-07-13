// The file view's syntax highlighter (ui/highlight.js) is best-effort and
// purely presentational, but it has one hard invariant: it must never alter the
// code it colors. Every test here first asserts the round-trip — the token
// texts, joined, reproduce the input line verbatim — then checks a specific
// classification. Rendering goes through jsdom (no browser), the same way the
// SPA drives it, so a token becoming a `tok-*` span is proven end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
// @ts-expect-error — plain-JS UI module, no types
import { appendTokens, langForPath, tokenize } from "../ui/highlight.js";

/** tokenize + the round-trip guard in one call: the lexer may never drop or
 * mutate a character. Returns the tokens and the carry state. */
function lex(line: string, lang: string | null, state: unknown = null) {
  const result = tokenize(line, lang, state);
  const joined = result.tokens.map((t: { text: string }) => t.text).join("");
  assert.equal(joined, line, `highlighter altered the line: "${joined}" !== "${line}"`);
  return result;
}

const classOf = (tokens: Array<{ text: string; cls: string | null }>, text: string) =>
  tokens.find((t) => t.text === text)?.cls;

test("langForPath maps known extensions and rejects the rest", () => {
  assert.equal(langForPath("src/serve.ts"), "ts");
  assert.equal(langForPath("crates/db/lock.rs"), "rust");
  assert.equal(langForPath("scripts/build.py"), "python");
  assert.equal(langForPath("main.go"), "go");
  assert.equal(langForPath("README.md"), null);
  assert.equal(langForPath("Makefile"), null); // no extension → plain
});

test("an unknown language renders as a single plain token, unchanged", () => {
  const { tokens, state } = lex("some :: arbitrary || text", null);
  assert.equal(state, null);
  assert.deepEqual(tokens, [{ text: "some :: arbitrary || text", cls: null }]);
});

test("classifies keywords, strings, comments, numbers, types and calls", () => {
  const { tokens } = lex(`const port = connect("127.0.0.1"); // bind`, "ts");
  assert.equal(classOf(tokens, "const"), "kw");
  assert.equal(classOf(tokens, "connect"), "fn");
  assert.equal(classOf(tokens, `"127.0.0.1"`), "str");
  assert.equal(classOf(tokens, "// bind"), "com");

  const typed = lex("let n: usize = 0x1F;", "rust").tokens;
  assert.equal(classOf(typed, "let"), "kw");
  assert.equal(classOf(typed, "usize"), "kw"); // rust primitive is a keyword here
  assert.equal(classOf(typed, "0x1F"), "num");

  const generic = lex("const p: Point = mk();", "ts").tokens;
  assert.equal(classOf(generic, "Point"), "type"); // capitalized → type
});

test("a block comment carries across lines via the returned state", () => {
  const first = lex("code(); /* open", "ts");
  assert.deepEqual(first.state, { block: true });
  assert.equal(classOf(first.tokens, "/* open"), "com");
  assert.equal(classOf(first.tokens, "code"), "fn");

  const middle = lex("still comment", "ts", first.state);
  assert.deepEqual(middle.state, { block: true });
  assert.equal(middle.tokens[0].cls, "com");

  const last = lex("end */ live();", "ts", middle.state);
  assert.equal(last.state, null);
  assert.equal(classOf(last.tokens, "end */"), "com");
  assert.equal(classOf(last.tokens, "live"), "fn");
});

test("Rust lifetimes stay plain; char literals are strings", () => {
  const life = lex("fn f<'a>(x: &'a str) {", "rust").tokens;
  // No token equals a lifetime-as-string; the ' is emitted as plain text.
  assert.ok(
    !life.some((t: { cls: string | null }) => t.cls === "str"),
    "a lifetime must not become a string",
  );
  assert.equal(classOf(life, "fn"), "kw");

  const ch = lex("let c = 'x';", "rust").tokens;
  assert.equal(classOf(ch, "'x'"), "str");
});

test("appendTokens renders classed runs as tok-* spans and preserves text", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const cell = doc.createElement("td");
  const line = `const x = "hi"; // note`;
  const { tokens } = lex(line, "ts");
  appendTokens(doc, cell, tokens);

  assert.equal(cell.textContent, line, "rendered text must equal the source line");
  assert.equal(cell.querySelector(".tok-kw")!.textContent, "const");
  assert.equal(cell.querySelector(".tok-str")!.textContent, `"hi"`);
  assert.equal(cell.querySelector(".tok-com")!.textContent, "// note");
});
