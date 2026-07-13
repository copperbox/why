// Hand-rolled, dependency-free syntax highlighting for the file view — the same
// self-contained/zero-CDN philosophy as the graph's canvas force sim (ui/graph.js).
// Highlighting is pure presentation: it colors the code text the blame payload
// already carries and asserts nothing about the *why*, so it lives in the client
// renderer rather than in the UI data contract.
//
// `tokenize` is a small, stateless-per-call lexer that a caller drives line by
// line, threading the returned `state` back in so a block comment can span rows
// (blame gives us one line at a time). It is deliberately best-effort: unknown
// languages, multi-line strings, and Rust lifetimes vs char literals are handled
// gracefully but not perfectly. Every character of the input is emitted in some
// token, so joining the token texts always reproduces the line verbatim.

/** Extensions → a language key in LANGS, or null for "render as plain text". */
const LANG_BY_EXTENSION = {
  ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "ts",
  ".js": "ts", ".mjs": "ts", ".cjs": "ts", ".jsx": "ts",
  ".rs": "rust",
  ".py": "python", ".pyi": "python",
  ".go": "go",
  ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".hpp": "c", ".cxx": "c",
  ".java": "c", ".cs": "c",
  ".json": "json",
};

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

// A language is a lexer config, not a grammar: comment/string delimiters plus a
// keyword set. `char` enables Rust-style char-literal detection so lifetimes
// (`'a`) are not mistaken for an unterminated string.
const LANGS = {
  ts: {
    line: "//", block: ["/*", "*/"], quotes: ["\"", "'", "`"],
    keywords: words(`abstract any as async await boolean break case catch class const continue
      debugger declare default delete do else enum export extends false finally for from function
      get if implements import in infer instanceof interface is keyof let module namespace never new
      null number object of override private protected public readonly return satisfies set static
      string super switch symbol this throw true try type typeof undefined unknown var void while
      with yield`),
  },
  rust: {
    line: "//", block: ["/*", "*/"], quotes: ["\""], char: true,
    keywords: words(`as async await bool break char const continue crate dyn else enum extern false
      fn for i8 i16 i32 i64 i128 if impl in isize let loop match mod move mut pub ref return self
      Self static str struct super trait true type u8 u16 u32 u64 u128 union unsafe use usize where
      while f32 f64`),
  },
  python: {
    line: "#", block: null, quotes: ["\"", "'"],
    keywords: words(`and as assert async await break class continue def del elif else except False
      finally for from global if import in is lambda None nonlocal not or pass raise return True try
      while with yield self`),
  },
  go: {
    line: "//", block: ["/*", "*/"], quotes: ["\"", "`", "'"], char: true,
    keywords: words(`break case chan const continue default defer else fallthrough for func go goto
      if import interface map package range return select struct switch type var bool byte error
      false float32 float64 int int8 int16 int32 int64 nil rune string true uint uintptr`),
  },
  c: {
    line: "//", block: ["/*", "*/"], quotes: ["\"", "'"],
    keywords: words(`auto bool break case catch char class const constexpr continue default delete
      do double else enum extern false final float for friend goto if inline int long namespace new
      nullptr operator override private protected public register return short signed sizeof static
      struct switch template this throw true try typedef typename union unsigned using virtual void
      volatile while`),
  },
  json: { line: null, block: null, quotes: ["\""], keywords: words("true false null") },
};

const isIdentStart = (ch) => /[A-Za-z_$]/.test(ch);
const isIdent = (ch) => /[A-Za-z0-9_$]/.test(ch);
const isDigit = (ch) => ch >= "0" && ch <= "9";

/** File extension of a repo-relative path, lowercased, including the dot. */
function extname(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/** The language key for a path, or null when we have no lexer for it. */
export function langForPath(path) {
  return LANG_BY_EXTENSION[extname(path)] ?? null;
}

/**
 * Lex one line into `{ text, cls }` runs. `cls` is a token class ("kw", "str",
 * "com", "num", "type", "fn") or null for plain text. `state` carries a pending
 * block comment across lines; pass the returned `state` into the next line.
 */
export function tokenize(text, lang, state) {
  const spec = lang && LANGS[lang];
  if (!spec) return { tokens: text === "" ? [] : [{ text, cls: null }], state: null };

  const tokens = [];
  let plain = "";
  const flush = () => {
    if (plain !== "") tokens.push({ text: plain, cls: null });
    plain = "";
  };
  const push = (t, cls) => {
    flush();
    tokens.push({ text: t, cls });
  };

  let i = 0;
  // Resume an open block comment from the previous line.
  if (state && state.block && spec.block) {
    const close = text.indexOf(spec.block[1]);
    if (close === -1) {
      return { tokens: [{ text, cls: "com" }], state: { block: true } };
    }
    push(text.slice(0, close + spec.block[1].length), "com");
    i = close + spec.block[1].length;
  }

  while (i < text.length) {
    const ch = text[i];
    const rest = text.slice(i);

    if (spec.line && rest.startsWith(spec.line)) {
      push(rest, "com");
      i = text.length;
      break;
    }
    if (spec.block && rest.startsWith(spec.block[0])) {
      const close = text.indexOf(spec.block[1], i + spec.block[0].length);
      if (close === -1) {
        push(rest, "com");
        return { tokens, state: { block: true } };
      }
      const end = close + spec.block[1].length;
      push(text.slice(i, end), "com");
      i = end;
      continue;
    }
    // Rust/Go char vs lifetime: only lex `'` as a string when it looks like a
    // char literal; otherwise it is a lifetime/label and stays plain.
    if (spec.char && ch === "'") {
      const m = /^'(\\.|[^'\\])'/.exec(rest);
      if (m) {
        push(m[0], "str");
        i += m[0].length;
        continue;
      }
      plain += ch;
      i++;
      continue;
    }
    if (spec.quotes.includes(ch)) {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === ch) { j++; break; }
        j++;
      }
      push(text.slice(i, j), "str");
      i = j;
      continue;
    }
    if (isDigit(ch) || (ch === "." && isDigit(text[i + 1] ?? ""))) {
      let j = i;
      while (j < text.length && /[0-9a-fA-FxXoObB._]/.test(text[j])) j++;
      push(text.slice(i, j), "num");
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < text.length && isIdent(text[j])) j++;
      const word = text.slice(i, j);
      let k = j;
      while (k < text.length && (text[k] === " " || text[k] === "\t")) k++;
      let cls = null;
      if (spec.keywords.has(word)) cls = "kw";
      else if (/^[A-Z]/.test(word)) cls = "type";
      else if (text[k] === "(") cls = "fn";
      push(word, cls);
      i = j;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return { tokens, state: null };
}

/** Append `tokenize` output into `cell`; classed runs become spans, plain text
 * stays a text node so `white-space: pre` preserves it exactly. */
export function appendTokens(doc, cell, tokens) {
  for (const { text, cls } of tokens) {
    if (cls === null) cell.append(doc.createTextNode(text));
    else {
      const span = doc.createElement("span");
      span.className = `tok-${cls}`;
      span.textContent = text;
      cell.append(span);
    }
  }
}
