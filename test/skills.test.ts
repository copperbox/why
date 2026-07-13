// The dig and capture skills are prompt-docs, but their acceptance criteria
// are mechanical: the confidence ladder must be verbatim DESIGN.md §2, the
// question-over-speculative rule must appear unweakened, and every tool the
// prose tells an agent to run must actually exist at this point in the plan.
// These tests pin all three so the docs can't drift from the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");

const SKILL_PATHS = [
  "skills/dig/SKILL.md",
  "skills/dig-synthesize/SKILL.md",
  "skills/capture/SKILL.md",
];
const DOC_PATHS = [...SKILL_PATHS, "docs/digging.md", "docs/capture.md", "docs/ci.md", "docs/ui-contract.md"];

/** `why <sub>` may only name subcommands implemented by this point in the
 * plan (Phases 1–4 plus the Phase 5/6 UI surface: `export`, `serve`). */
const IMPLEMENTED_SUBCOMMANDS = new Set([
  "init",
  "lint",
  "blame",
  "anchor",
  "doctor",
  "dig",
  "audit",
  "capture",
  "export",
  "serve",
]);

/** snake_case tokens in the docs that are schema fields, example symbols, or
 * GitHub Actions vocabulary, not okf-mcp tool names. */
const NON_TOOL_TOKENS = new Set([
  "happened_on",
  "expired_on",
  "as_of",
  "review_by",
  "okf_version",
  "retry_jitter",
  "acquire_shared",
  "pull_request",
  "workflow_dispatch",
]);

/** Everything an agent would treat as runnable: fenced blocks + inline code. */
function codeSpans(markdown: string): string[] {
  const spans: string[] = [];
  const withoutFences = markdown.replace(/^(`{3,4})[\s\S]*?^\1/gm, (fence) => {
    spans.push(fence);
    return "";
  });
  for (const m of withoutFences.matchAll(/`[^`\n]+`/g)) spans.push(m[0]);
  return spans;
}

test("both skills restate the confidence ladder verbatim from DESIGN.md §2", () => {
  const design = read("DESIGN.md");
  const rows = design.match(/^\| `(?:recorded|corroborated|inferred|speculative)` \|.*$/gm);
  assert.equal(rows?.length, 4, "DESIGN.md no longer has the four ladder rows where expected");
  for (const path of SKILL_PATHS) {
    const skill = read(path);
    assert.ok(skill.includes("| Level | Meaning | Bar |"), `${path}: ladder header row missing`);
    for (const row of rows!) {
      assert.ok(skill.includes(row), `${path}: ladder row not verbatim: ${row}`);
    }
  }
});

test("both skills carry the when-in-doubt rule verbatim, not paraphrased", () => {
  const rule = "when in doubt, file a `question`, not a `speculative` decision";
  assert.ok(read("DESIGN.md").includes(rule), "rule text drifted in DESIGN.md — update this test");
  for (const path of SKILL_PATHS) {
    assert.ok(read(path).includes(rule), `${path}: missing the verbatim rule`);
  }
});

test("skill files have Claude Code skill frontmatter matching their directory", () => {
  for (const path of SKILL_PATHS) {
    const skill = read(path);
    const dirName = path.split("/")[1]!;
    assert.ok(skill.startsWith("---\n"), `${path}: no frontmatter block`);
    assert.ok(skill.includes(`name: ${dirName}\n`), `${path}: frontmatter name must be "${dirName}"`);
    assert.match(skill, /^description: \S/m, `${path}: frontmatter needs a description`);
  }
});

test("docs reference only why subcommands that exist at this point in the plan", () => {
  for (const path of DOC_PATHS) {
    for (const span of codeSpans(read(path))) {
      for (const m of span.matchAll(/\bwhy +([a-z][a-z-]*)/g)) {
        assert.ok(
          IMPLEMENTED_SUBCOMMANDS.has(m[1]!),
          `${path}: references unimplemented/fictional subcommand "why ${m[1]}" in: ${span.slice(0, 120)}`,
        );
      }
    }
  }
});

test("docs name only okf-mcp tools that actually exist", () => {
  const okfReadme = read("node_modules/@copperbox/okf-mcp/README.md");
  const tools = new Set([...okfReadme.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]!));
  for (const known of ["search_concepts", "get_concept", "write_concept", "update_concept"]) {
    assert.ok(tools.has(known), `okf-mcp README table no longer lists ${known} — update this test`);
  }
  for (const path of DOC_PATHS) {
    for (const span of codeSpans(read(path))) {
      for (const m of span.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) {
        const token = m[0];
        assert.ok(
          tools.has(token) || NON_TOOL_TOKENS.has(token),
          `${path}: "${token}" looks like a tool name but okf-mcp has no such tool (span: ${span.slice(0, 120)})`,
        );
      }
    }
  }
});

test("runbook walks the full pipeline and the harbor dry run", () => {
  const runbook = read("docs/digging.md");
  for (const needle of [
    "why dig --episodes",
    "why dig --evidence",
    "skills/dig/SKILL.md",
    "skills/dig-synthesize/SKILL.md",
    "why anchor",
    "examples/harbor",
    "era",
  ]) {
    assert.ok(runbook.includes(needle), `docs/digging.md: missing "${needle}"`);
  }
});
