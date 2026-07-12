// Symbol resolver (DESIGN.md §4, resolution order step 1).
//
// findSymbol re-evaluates the claim "this concept is about the symbol
// `symbol`, last seen in `path` at commit `as_of`" against HEAD:
//
//   - The same file still declares the symbol exactly once → its current span.
//   - The symbol is gone from that file (or the file is gone) → search files
//     that git history *connects* to the original path (rename/copy detection
//     via `git log --follow -M -C` over as_of..HEAD). A same-named symbol in
//     a file git does not connect is NOT followed — the never-silently-wrong
//     invariant beats recall, so the result is not-found instead.
//   - More than one declaration in the deciding file, or more than one
//     connected file declaring the symbol → ambiguous, never a guess.
//
// Parsing: tree-sitter via WASM (web-tree-sitter + the prebuilt grammars in
// tree-sitter-wasms, both installed through package.json — nothing is fetched
// at run time) for TypeScript/TSX/JavaScript, Rust, Python and Go, matching
// declaration nodes by their `name` field. Any other extension falls back to
// a line-regex heuristic over common declaration keywords (function / fn /
// def / class / func). Heuristic results carry confidence: "heuristic" and
// span only the declaration line itself — the heuristic can locate a
// declaration but must never fabricate its extent. Tree-sitter results carry
// confidence: "syntactic" and the full declaration node's span.

import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import Parser from "web-tree-sitter";
import { git, gitOrThrow, showFile } from "./git.js";
import type { LineRange } from "./trace-range.js";

export interface SymbolAnchor {
  /** Repo-relative POSIX path, valid at `asOf`. */
  path: string;
  symbol: string;
  /** Commit-ish at which `path` held the symbol. Must be an ancestor of HEAD. */
  asOf: string;
}

export type SymbolConfidence = "syntactic" | "heuristic";

export type FindSymbolResult =
  | { found: true; path: string; lines: LineRange; confidence: SymbolConfidence }
  | { found: false; reason: "not-found" | "ambiguous" };

// --- tree-sitter setup -------------------------------------------------------

const GRAMMAR_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".rs": "rust",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
};

interface DeclRule {
  /** Field holding the declared name(s) — Go specs can declare several. */
  nameField: string;
  /** Accept only these node types as names (e.g. Python assignment targets). */
  nameTypes?: string[];
  /** Report the parent node's span (variable_declarator → the whole `const …`). */
  spanIsParent?: boolean;
  /** Match only module-scope declarations, so locals can't collide. */
  moduleScopeOnly?: boolean;
}

const NAME: DeclRule = { nameField: "name" };
const MODULE_VAR: DeclRule = { nameField: "name", spanIsParent: true, moduleScopeOnly: true };

const DECL_RULES: Record<string, Record<string, DeclRule>> = {
  typescript: {
    function_declaration: NAME,
    generator_function_declaration: NAME,
    function_signature: NAME,
    class_declaration: NAME,
    abstract_class_declaration: NAME,
    interface_declaration: NAME,
    type_alias_declaration: NAME,
    enum_declaration: NAME,
    method_definition: NAME,
    method_signature: NAME,
    abstract_method_signature: NAME,
    public_field_definition: NAME,
    variable_declarator: MODULE_VAR,
  },
  javascript: {
    function_declaration: NAME,
    generator_function_declaration: NAME,
    class_declaration: NAME,
    method_definition: NAME,
    field_definition: { nameField: "property" },
    variable_declarator: MODULE_VAR,
  },
  rust: {
    function_item: NAME,
    function_signature_item: NAME,
    struct_item: NAME,
    enum_item: NAME,
    union_item: NAME,
    trait_item: NAME,
    type_item: NAME,
    mod_item: NAME,
    const_item: NAME,
    static_item: NAME,
    macro_definition: NAME,
  },
  python: {
    function_definition: NAME,
    class_definition: NAME,
    assignment: { nameField: "left", nameTypes: ["identifier"], moduleScopeOnly: true },
  },
  go: {
    function_declaration: NAME,
    method_declaration: NAME,
    type_spec: NAME,
    const_spec: NAME,
    var_spec: NAME,
  },
};
DECL_RULES.tsx = DECL_RULES.typescript;

let parserReady: Promise<void> | undefined;
let sharedParser: Parser | undefined;
const loadedLanguages = new Map<string, Promise<Parser.Language>>();

function loadLanguage(grammar: string): Promise<Parser.Language> {
  let language = loadedLanguages.get(grammar);
  if (language === undefined) {
    language = (async () => {
      parserReady ??= Parser.init();
      await parserReady;
      const require = createRequire(import.meta.url);
      const wasmDir = join(dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
      return Parser.Language.load(join(wasmDir, `tree-sitter-${grammar}.wasm`));
    })();
    loadedLanguages.set(grammar, language);
  }
  return language;
}

function nodeSpan(node: Parser.SyntaxNode): LineRange {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.column === 0 ? node.endPosition.row : node.endPosition.row + 1;
  return { start, end: Math.max(start, end) };
}

// Wrappers a module-scope declaration may sit inside without leaving module
// scope; anything else on the way up (function bodies, blocks) means local.
const SCOPE_WRAPPERS = new Set([
  "export_statement",
  "expression_statement",
  "lexical_declaration",
  "variable_declaration",
]);
const MODULE_ROOTS = new Set(["program", "module", "source_file"]);

function atModuleScope(node: Parser.SyntaxNode): boolean {
  let cur = node.parent;
  while (cur !== null && SCOPE_WRAPPERS.has(cur.type)) cur = cur.parent;
  return cur !== null && MODULE_ROOTS.has(cur.type);
}

function collectDeclarations(
  root: Parser.SyntaxNode,
  rules: Record<string, DeclRule>,
  symbol: string,
): LineRange[] {
  const matches: LineRange[] = [];
  const walk = (node: Parser.SyntaxNode): void => {
    const rule = rules[node.type];
    if (rule !== undefined) {
      const names = node
        .childrenForFieldName(rule.nameField)
        .filter((n) => rule.nameTypes === undefined || rule.nameTypes.includes(n.type));
      if (
        names.some((n) => n.text === symbol) &&
        (rule.moduleScopeOnly !== true || atModuleScope(node))
      ) {
        const spanNode = rule.spanIsParent === true && node.parent !== null ? node.parent : node;
        matches.push(nodeSpan(spanNode));
      }
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
  return matches;
}

async function syntacticMatches(
  grammar: string,
  content: string,
  symbol: string,
): Promise<LineRange[]> {
  const language = await loadLanguage(grammar);
  sharedParser ??= new Parser();
  sharedParser.setLanguage(language);
  const tree = sharedParser.parse(content);
  try {
    return collectDeclarations(tree.rootNode, DECL_RULES[grammar], symbol);
  } finally {
    tree.delete();
  }
}

// --- regex-heuristic fallback ------------------------------------------------

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function heuristicMatches(content: string, symbol: string): LineRange[] {
  const sym = escapeRegExp(symbol);
  const patterns = [
    new RegExp(`(?:^|[^\\w.])function\\*?\\s+${sym}\\s*[(<]`),
    new RegExp(`(?:^|[^\\w.])fn\\s+${sym}\\s*[(<]`),
    new RegExp(`(?:^|[^\\w.])def\\s+${sym}\\s*\\(`),
    new RegExp(`(?:^|[^\\w.])class\\s+${sym}(?:$|[^\\w])`),
    new RegExp(`^\\s*func\\s+(?:\\([^)]*\\)\\s*)?${sym}\\s*\\(`),
  ];
  const matches: LineRange[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some((p) => p.test(lines[i]))) {
      matches.push({ start: i + 1, end: i + 1 });
    }
  }
  return matches;
}

// --- lookup ------------------------------------------------------------------

interface FileMatches {
  matches: LineRange[];
  confidence: SymbolConfidence;
}

/** Declarations of `symbol` in `path` at HEAD, or null if the path is absent. */
async function matchesInFile(
  repo: string,
  path: string,
  symbol: string,
): Promise<FileMatches | null> {
  const content = showFile(repo, "HEAD", path);
  if (content === null) return null;
  const grammar = GRAMMAR_BY_EXTENSION[extname(path).toLowerCase()];
  if (grammar !== undefined) {
    return { matches: await syntacticMatches(grammar, content, symbol), confidence: "syntactic" };
  }
  return { matches: heuristicMatches(content, symbol), confidence: "heuristic" };
}

/** Files at HEAD whose content mentions `symbol` at all (textual pre-filter). */
function grepCandidates(repo: string, symbol: string): string[] {
  const r = git(repo, ["grep", "-l", "--fixed-strings", "-e", symbol, "HEAD"]);
  if (r.status === 1) return [];
  if (r.status !== 0) throw new Error(`git grep failed: ${r.stderr.trim()}`);
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^HEAD:/, ""));
}

/**
 * True when git history connects `candidate` (a path at HEAD) to the anchor's
 * original path within as_of..HEAD: the original name appears in the
 * candidate's `git log --follow -M -C --name-status` output for that window
 * (as the old side of a rename/copy, or as the candidate's own earlier name).
 */
function connectedByHistory(
  repo: string,
  asOfSha: string,
  originalPath: string,
  candidate: string,
): boolean {
  const out = gitOrThrow(repo, [
    "log",
    "--follow",
    "-M",
    "-C",
    "--name-status",
    "--format=%H",
    `${asOfSha}..HEAD`,
    "--",
    candidate,
  ]);
  for (const line of out.split("\n")) {
    const fields = line.split("\t");
    if (fields.length >= 2 && fields.slice(1).includes(originalPath)) return true;
  }
  return false;
}

export async function findSymbol(repo: string, anchor: SymbolAnchor): Promise<FindSymbolResult> {
  const { path, symbol, asOf } = anchor;
  if (symbol.trim() === "") {
    throw new Error("symbol must be non-empty");
  }

  const rev = git(repo, ["rev-parse", "--verify", "--quiet", `${asOf}^{commit}`]);
  if (rev.status !== 0) {
    throw new Error(`as_of "${asOf}" does not resolve to a commit in ${repo}`);
  }
  const asOfSha = rev.stdout.trim();
  if (git(repo, ["merge-base", "--is-ancestor", asOfSha, "HEAD"]).status !== 0) {
    throw new Error(`as_of ${asOf} is not an ancestor of HEAD; cannot resolve against it`);
  }

  // Step 1: the anchored file itself, at HEAD.
  const sameFile = await matchesInFile(repo, path, symbol);
  if (sameFile !== null && sameFile.matches.length > 0) {
    if (sameFile.matches.length > 1) return { found: false, reason: "ambiguous" };
    return { found: true, path, lines: sameFile.matches[0], confidence: sameFile.confidence };
  }

  // Step 2: only files git history connects to the original path.
  const hits: { path: string; matches: LineRange[]; confidence: SymbolConfidence }[] = [];
  for (const candidate of grepCandidates(repo, symbol)) {
    if (candidate === path) continue;
    const m = await matchesInFile(repo, candidate, symbol);
    if (m === null || m.matches.length === 0) continue;
    if (!connectedByHistory(repo, asOfSha, path, candidate)) continue;
    hits.push({ path: candidate, ...m });
  }
  if (hits.length === 0) return { found: false, reason: "not-found" };
  if (hits.length > 1 || hits[0].matches.length > 1) return { found: false, reason: "ambiguous" };
  return { found: true, path: hits[0].path, lines: hits[0].matches[0], confidence: hits[0].confidence };
}
