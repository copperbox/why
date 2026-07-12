// `why anchor` end-to-end (issue: full re-resolution with frontmatter-only
// writes). A temp repo seeds code + a mini bundle, then a refactor renames a
// file, shifts lines, and deletes a function — the §4 resolution order must
// report one moved, one resolved (shifted), one lost, and every write must
// touch nothing but `why.anchors`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findSymbolSpan } from "../src/anchor.ts";
import { loadBundle } from "../src/bundle.ts";
import { main } from "../src/cli.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture } from "./helpers.ts";

function git(repo: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

async function write(repo: string, rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, rel)), { recursive: true });
  await writeFile(join(repo, rel), content, "utf8");
}

const LOCK_RS = `// locking module

pub fn acquire_shared() {
    step_one();
    step_two();
}
`;

const DEFAULTS_TOML = `# defaults

[server]
request_deadline = 47
retry_jitter = false
`;

const DEFAULTS_TOML_SHIFTED = `# tuned in production
# see .why/decisions/47s-request-deadline.md
${DEFAULTS_TOML}`;

const RETRY_RS = `// retry module

pub fn with_jitter() {
    jitter();
}

pub fn without_jitter() {
    plain();
}
`;

const RETRY_RS_FN_DELETED = `// retry module

pub fn with_jitter() {
    jitter();
}
`;

const RETRY_RS_FN_RESTORED = `${RETRY_RS_FN_DELETED}
pub fn without_jitter() {
    retry();
}
`;

// Concept docs in okf-mcp's normalized formatting, so a frontmatter-only
// write must leave every non-anchor byte identical.
const queueDecision = (asOf: string) => `---
type: decision
title: Queue-based locking
description: Serialize shard mutations through one ordered queue.
tags: [ locking, concurrency ]
timestamp: 2026-07-11
why:
  status: active
  happened_on: 2024-03-14
  confidence: recorded
  anchors:
    - path: src/lock.rs
      symbol: acquire_shared
      lines: 3-6
      as_of: ${asOf}
      state: live
---

# Queue-based locking

Reads go through \`acquire_shared\`; all mutations queue.

# Why

The striped design failed structurally; the queue makes deadlock impossible.

# Citations

[1] [PR #212](https://github.com/acme/harbor/pull/212)
`;

const deadlineDecision = (asOf: string) => `---
type: decision
title: 47s request deadline
description: Server-side deadline pinned 2s past the gateway cap.
timestamp: 2026-07-11
why:
  status: active
  happened_on: 2024-01-15
  confidence: corroborated
  anchors:
    - path: config/defaults.toml
      lines: 3-4
      as_of: ${asOf}
      state: live
---

# 47s request deadline

47 = 45 + 2, so the gateway timeout always fires first.

# Citations

[1] [commit 51be07d](https://github.com/acme/harbor/commit/51be07d)
`;

const jitterQuestion = (asOf: string) => `---
type: question
title: Why is retry jitter disabled?
description: No recoverable rationale for retry_jitter defaulting off.
timestamp: 2026-07-11
why:
  status: open
  happened_on: 2024-06-02
  anchors:
    - path: src/retry.rs
      symbol: without_jitter
      lines: 7-9
      as_of: ${asOf}
      state: live
---

# Why is retry jitter disabled?

Unknown — an honest gap instead of a confident guess.
`;

const CONCEPT_FILES = [
  "decisions/queue-based-locking.md",
  "decisions/47s-request-deadline.md",
  "questions/why-retry-jitter-disabled.md",
] as const;

interface Scenario {
  repo: string;
  whyRoot: string;
  c1: string;
  c2: string;
}

/** Seed code + bundle at c1, then refactor (rename, shift, delete) into c2. */
async function seedScenario(): Promise<Scenario> {
  const repo = await mkdtemp(join(tmpdir(), "why-anchor-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "why tests");
  await write(repo, "src/lock.rs", LOCK_RS);
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  await write(repo, "src/retry.rs", RETRY_RS);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const c1 = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/queue-based-locking.md", queueDecision(c1));
  await write(repo, ".why/decisions/47s-request-deadline.md", deadlineDecision(c1));
  await write(repo, ".why/questions/why-retry-jitter-disabled.md", jitterQuestion(c1));

  git(repo, "mv", "src/lock.rs", "src/locking.rs");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML_SHIFTED);
  await write(repo, "src/retry.rs", RETRY_RS_FN_DELETED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "refactor: rename lock.rs, shift defaults, delete without_jitter");
  const c2 = git(repo, "rev-parse", "--short", "HEAD");
  return { repo, whyRoot, c1, c2 };
}

async function readConcepts(whyRoot: string): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const rel of CONCEPT_FILES) {
    sources.set(rel, await readFile(join(whyRoot, rel), "utf8"));
  }
  return sources;
}

/**
 * The file with its `why.anchors` block removed — everything left must be
 * byte-identical across an anchor run (the acceptance criterion).
 */
function withoutAnchorBlock(source: string): string {
  const lines = source.split("\n");
  const kept: string[] = [];
  let fences = 0;
  let skipping = false;
  for (const line of lines) {
    if (line === "---" && fences < 2) {
      fences++;
      skipping = false;
      kept.push(line);
      continue;
    }
    if (fences === 1) {
      if (/^ {2}anchors:\s*$/.test(line)) {
        skipping = true;
        continue;
      }
      if (skipping && /^ {4}/.test(line)) continue;
      skipping = false;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

async function anchorOf(whyRoot: string, conceptId: string) {
  const bundle = await loadBundle(whyRoot);
  const concept = bundle.concepts.get(conceptId);
  assert.ok(concept, `concept ${conceptId} missing after run`);
  assert.equal(concept.why.anchors.length, 1);
  return concept.why.anchors[0]!;
}

test("why anchor: rename → moved, shift → resolved, delete → lost; only why.anchors changes", async () => {
  const { repo, whyRoot, c1, c2 } = await seedScenario();
  const before = await readConcepts(whyRoot);

  const { io, out } = capture();
  const code = await main(["anchor", "--bundle", whyRoot], repo, io);
  assert.equal(code, 0, out.join("\n"));

  const text = out.join("\n");
  assert.ok(text.includes("1 moved"), text);
  assert.ok(text.includes("1 resolved"), text);
  assert.ok(text.includes("1 lost"), text);

  const moved = await anchorOf(whyRoot, "decisions/queue-based-locking");
  assert.equal(moved.path, "src/locking.rs");
  assert.equal(moved.lines, "3-6");
  assert.equal(moved.as_of, c2);
  assert.equal(moved.state, "live");

  const shifted = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(shifted.path, "config/defaults.toml");
  assert.equal(shifted.lines, "5-6");
  assert.equal(shifted.as_of, c2);
  assert.equal(shifted.state, "live");

  const lost = await anchorOf(whyRoot, "questions/why-retry-jitter-disabled");
  assert.equal(lost.state, "lost");
  assert.equal(lost.path, "src/retry.rs");
  assert.equal(lost.lines, "7-9");
  assert.equal(lost.symbol, "without_jitter");
  assert.equal(lost.as_of, c1, "a lost anchor keeps its last-known as_of");

  // The acceptance criterion: outside `why.anchors`, every byte survives.
  const after = await readConcepts(whyRoot);
  for (const rel of CONCEPT_FILES) {
    assert.notEqual(after.get(rel), before.get(rel), `${rel} should have been rewritten`);
    assert.equal(
      withoutAnchorBlock(after.get(rel)!),
      withoutAnchorBlock(before.get(rel)!),
      `${rel}: bytes outside why.anchors changed`,
    );
  }
});

test("why anchor --check: exits 1 on drift and writes nothing", async () => {
  const { repo, whyRoot } = await seedScenario();
  const before = await readConcepts(whyRoot);

  const { io, out } = capture();
  const code = await main(["anchor", "--check", "--bundle", whyRoot], repo, io);
  assert.equal(code, 1, out.join("\n"));
  assert.ok(out.join("\n").includes("why anchor"), out.join("\n"));

  const after = await readConcepts(whyRoot);
  for (const rel of CONCEPT_FILES) {
    assert.equal(after.get(rel), before.get(rel), `--check must not write ${rel}`);
  }
});

test("why anchor is idempotent: the second run reports current and writes nothing", async () => {
  const { repo, whyRoot } = await seedScenario();
  const first = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, first.io), 0);
  const afterFirst = await readConcepts(whyRoot);

  const second = capture();
  const code = await main(["anchor", "--bundle", whyRoot], repo, second.io);
  assert.equal(code, 0);
  const text = second.out.join("\n");
  assert.ok(text.includes("0 moved"), text);
  assert.ok(text.includes("0 resolved"), text);
  assert.ok(text.includes("2 already current"), text);

  const afterSecond = await readConcepts(whyRoot);
  for (const rel of CONCEPT_FILES) {
    assert.equal(afterSecond.get(rel), afterFirst.get(rel), `second run rewrote ${rel}`);
  }

  // A committed-but-still-lost anchor is doctor's warning, not a CI failure:
  // --check passes once the bundle records what is actually true.
  const check = capture();
  assert.equal(await main(["anchor", "--check", "--bundle", whyRoot], repo, check.io), 0);
});

test("a lost anchor whose symbol reappears resolves back to live", async () => {
  const { repo, whyRoot } = await seedScenario();
  const first = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, first.io), 0);
  assert.equal((await anchorOf(whyRoot, "questions/why-retry-jitter-disabled")).state, "lost");

  await write(repo, "src/retry.rs", RETRY_RS_FN_RESTORED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "restore without_jitter");
  const c3 = git(repo, "rev-parse", "--short", "HEAD");

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));
  const recovered = await anchorOf(whyRoot, "questions/why-retry-jitter-disabled");
  assert.equal(recovered.state, "live", "recovery must not require hand-editing");
  assert.equal(recovered.path, "src/retry.rs");
  assert.equal(recovered.lines, "7-9");
  assert.equal(recovered.as_of, c3);
});

test("--concept scopes resolution and writes to that concept only", async () => {
  const { repo, whyRoot, c2 } = await seedScenario();
  const before = await readConcepts(whyRoot);

  const { io, out } = capture();
  const code = await main(
    ["anchor", "--bundle", whyRoot, "--concept", "decisions/queue-based-locking"],
    repo,
    io,
  );
  assert.equal(code, 0, out.join("\n"));

  assert.equal((await anchorOf(whyRoot, "decisions/queue-based-locking")).as_of, c2);
  const after = await readConcepts(whyRoot);
  for (const rel of CONCEPT_FILES.slice(1)) {
    assert.equal(after.get(rel), before.get(rel), `--concept must not touch ${rel}`);
  }

  const missing = capture();
  const bad = await main(
    ["anchor", "--bundle", whyRoot, "--concept", "decisions/no-such-thing"],
    repo,
    missing.io,
  );
  assert.equal(bad, 1);
  assert.ok(missing.err.join("\n").includes("no-such-thing"), missing.err.join("\n"));
});

// The grep-heuristic symbol finder never guesses: ambiguity and absence both
// fail the symbol step rather than emit a plausible-but-wrong span.
test("findSymbolSpan: brace blocks, indent blocks, single lines — and no guessing", () => {
  const rust = "// mod\n\npub fn alpha() {\n    one();\n}\n\npub fn beta() {\n    two();\n}\n";
  assert.deepEqual(findSymbolSpan(rust, "beta"), { start: 7, end: 9 });

  const python = "class Retry:\n    def backoff(self):\n        wait()\n        again()\n\n    def stop(self):\n        halt()\n";
  assert.deepEqual(findSymbolSpan(python, "backoff"), { start: 2, end: 4 });

  const toml = "# defaults\n\n[server]\nrequest_deadline = 47\nretry_jitter = false\n";
  assert.deepEqual(findSymbolSpan(toml, "request_deadline"), { start: 4, end: 4 });

  assert.equal(findSymbolSpan(rust, "gamma"), undefined);
  const ambiguous = "fn dup() {\n    a();\n}\nfn dup() {\n    b();\n}\n";
  assert.equal(findSymbolSpan(ambiguous, "dup"), undefined);
  const commented = "// pub fn alpha() {\npub fn alpha() {\n    real();\n}\n";
  assert.deepEqual(findSymbolSpan(commented, "alpha"), { start: 2, end: 4 });
});
