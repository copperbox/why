// `why anchor` end-to-end (issue: full re-resolution with frontmatter-only
// writes). A temp repo seeds code + a mini bundle, then a refactor renames a
// file, shifts lines, and deletes a function — the §4 resolution order must
// report one moved, one resolved (shifted), one lost, and every write must
// touch nothing but `why.anchors`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findSymbolSpan } from "../src/anchor.ts";
import { loadBundle } from "../src/bundle.ts";
import { main } from "../src/cli.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeRepo, write } from "./helpers.ts";

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
      as_of: "${asOf}"
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
      as_of: "${asOf}"
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
      as_of: "${asOf}"
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
  const repo = await makeRepo("why-anchor-");
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

// --- The PR gate's question (docs/ci.md) ---------------------------------
//
// A contributor cannot re-anchor correctly from a branch: their HEAD is what
// the squash discards. So the gate tolerates drift (the why-anchor job
// re-stamps it from main) and blocks only on an anchor the PR destroyed.

test("--check --allow-drift tolerates drift and blocks only on a destroyed anchor", async () => {
  const { repo, whyRoot } = await seedScenario();

  // seedScenario's refactor renames a file (moved), shifts lines (resolved),
  // and deletes a function (lost) — one of each, in one run.
  const strict = capture();
  assert.equal(await main(["anchor", "--check", "--bundle", whyRoot], repo, strict.io), 1);

  const lenient = capture();
  const code = await main(["anchor", "--check", "--allow-drift", "--bundle", whyRoot], repo, lenient.io);
  assert.equal(code, 1, "a deleted function destroyed an anchor — that still blocks");
  const text = lenient.out.join("\n");
  assert.ok(text.includes("1 anchor lost"), text);
  assert.ok(text.includes("2 anchors drifted"), text);
  assert.ok(!text.includes("run `why anchor`"), "must not tell the author to stamp a doomed as_of");
});

test("--check --allow-drift passes when nothing is destroyed, however much drifted", async () => {
  const repo = await makeRepo("why-drift-");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const c1 = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/47s-request-deadline.md", deadlineDecision(c1));

  await write(repo, "config/defaults.toml", DEFAULTS_TOML_SHIFTED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "shift the block");

  const before = await readFile(join(whyRoot, "decisions/47s-request-deadline.md"), "utf8");
  const { io, out } = capture();
  const code = await main(["anchor", "--check", "--allow-drift", "--bundle", whyRoot], repo, io);
  assert.equal(code, 0, `drift alone must not block a PR:\n${out.join("\n")}`);
  assert.ok(out.join("\n").includes("why-anchor job re-stamps"), out.join("\n"));
  assert.equal(
    await readFile(join(whyRoot, "decisions/47s-request-deadline.md"), "utf8"),
    before,
    "--check writes nothing, with or without --allow-drift",
  );
});

test("an anchor already recorded lost does not block the gate forever", async () => {
  const { repo, whyRoot } = await seedScenario();
  // Record reality once, from a state where the deletion is already committed.
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, capture().io), 0);

  const { io, out } = capture();
  const code = await main(["anchor", "--check", "--allow-drift", "--bundle", whyRoot], repo, io);
  assert.equal(code, 0, `a committed state: lost is doctor's business, not the gate's:\n${out.join("\n")}`);
});

test("--allow-drift without --check is a usage error, not a silent no-op", async () => {
  const { repo, whyRoot } = await seedScenario();
  const { io, err } = capture();
  const code = await main(["anchor", "--allow-drift", "--bundle", whyRoot], repo, io);
  assert.equal(code, 2);
  assert.ok(err.join("\n").includes("--allow-drift"), err.join("\n"));
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

// --- as_of and squash merges (DESIGN.md §4) ------------------------------
//
// A squash merge rewrites a branch into one new commit, so an `as_of` stamped
// on the branch names a commit that never reaches the integration branch. It
// survives in the clone that made it and nowhere else — the failure these
// tests pin is a tool whose answer depends on the operator's local branches.

interface SquashRepo {
  repo: string;
  whyRoot: string;
  /** Last commit on main before the branch — an ancestor of HEAD. */
  base: string;
  /** The branch commit the squash discarded: present here, absent in a fresh clone. */
  orphan: string;
}

const wholeFileConcept = (path: string, asOf: string) => `---
type: decision
title: A whole-file claim
description: Anchored to a path, so the path existing is the whole claim.
timestamp: 2026-07-14
why:
  status: active
  happened_on: 2026-07-14
  confidence: recorded
  anchors:
    - path: ${path}
      as_of: "${asOf}"
      state: live
---

# A whole-file claim

Body text.
`;

const linesConcept = (asOf: string) => `---
type: decision
title: A line-range claim
description: Anchored to lines, so re-lining needs a usable as_of to trace from.
timestamp: 2026-07-14
why:
  status: active
  happened_on: 2026-07-14
  confidence: recorded
  anchors:
    - path: config/defaults.toml
      lines: 3-4
      as_of: "${asOf}"
      state: live
---

# A line-range claim

Body text.
`;

/**
 * main → a branch commit → a squash of that branch back onto main. The branch
 * ref is kept, so `orphan` is reachable in this repo exactly as a merged PR's
 * branch still is on the machine that pushed it.
 */
async function seedSquashRepo(rename: boolean): Promise<SquashRepo> {
  const repo = await makeRepo("why-squash-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  await write(repo, "src/lock.rs", LOCK_RS);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const base = git(repo, "rev-parse", "--short", "HEAD");

  git(repo, "checkout", "-q", "-b", "drafts");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML_SHIFTED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "draft: shift defaults");
  const orphan = git(repo, "rev-parse", "--short", "HEAD");

  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "--squash", "-q", "drafts");
  git(repo, "commit", "-qm", "squash of drafts (#1)");
  if (rename) {
    // A rename that lands on main *after* the branch point, so git can detect
    // it across `orphan..HEAD` even though orphan is not an ancestor.
    git(repo, "mv", "src/lock.rs", "src/locking.rs");
    git(repo, "commit", "-qm", "rename lock.rs");
  }

  const whyRoot = await scaffoldBundle(repo);
  return { repo, whyRoot, base, orphan };
}

test("a squash-orphaned as_of degrades to unverified, not lost, and rewrites nothing", async () => {
  const { repo, whyRoot, orphan } = await seedSquashRepo(false);
  await write(repo, ".why/decisions/lines-claim.md", linesConcept(orphan));
  const before = await readFile(join(whyRoot, "decisions/lines-claim.md"), "utf8");

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));
  const text = out.join("\n");

  // The file is right there; only its provenance is unreadable. Calling that
  // `lost` is the false alarm that trains people to ignore the health report.
  assert.ok(text.includes("unverified as_of"), text);
  assert.ok(text.includes("0 lost"), text);

  const after = await readFile(join(whyRoot, "decisions/lines-claim.md"), "utf8");
  assert.equal(after, before, "an unverifiable as_of must not provoke a rewrite");
  const anchor = await anchorOf(whyRoot, "decisions/lines-claim");
  assert.equal(anchor.state, "live");
  assert.equal(anchor.lines, "3-4", "the recorded lines stay exactly as written");
  assert.equal(anchor.as_of, orphan, "as_of is kept for forensics, not silently repaired");
});

test("rename detection refuses to read history through a non-ancestor as_of", async () => {
  const { repo, whyRoot, base, orphan } = await seedSquashRepo(true);

  // Sanity: git *will* answer the rename question across the orphan, which is
  // exactly why the ancestry gate has to be explicit rather than incidental.
  const detected = git(repo, "diff", "--name-status", "-M", orphan, "HEAD");
  assert.ok(/^R\d*\tsrc\/lock\.rs\tsrc\/locking\.rs$/m.test(detected), detected);

  await write(repo, ".why/decisions/orphan-claim.md", wholeFileConcept("src/lock.rs", orphan));
  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  // Following that rename would resolve here and go lost in a fresh clone —
  // the same bundle answering differently per operator. Refuse it.
  const orphaned = await anchorOf(whyRoot, "decisions/orphan-claim");
  assert.equal(orphaned.state, "lost", "a rename seen only through an orphan is not evidence");
  assert.equal(orphaned.path, "src/lock.rs");

  // The same rename through an ancestor as_of is real history: follow it.
  await write(repo, ".why/decisions/ancestor-claim.md", wholeFileConcept("src/lock.rs", base));
  const second = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, second.io), 0);
  const followed = await anchorOf(whyRoot, "decisions/ancestor-claim");
  assert.equal(followed.state, "live");
  assert.equal(followed.path, "src/locking.rs", "an ancestor as_of still follows renames");
});

// --- Choosing the as_of to stamp -----------------------------------------

/** Record `main` as the remote's default branch, then branch off it. */
function withIntegrationBranch(repo: string): void {
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "main"));
  git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
}

/** A stale `lines` the symbol step will correct, so the anchor really moves. */
const symbolConcept = (asOf: string) => `---
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
      symbol: request_deadline
      lines: 1
      as_of: "${asOf}"
      state: live
---

# 47s request deadline

47 = 45 + 2, so the gateway timeout always fires first.
`;

test("on a branch, as_of is stamped at the surviving merge-base when the span holds there", async () => {
  const repo = await makeRepo("why-stamp-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const seed = git(repo, "rev-parse", "--short", "HEAD");

  await write(repo, "CHANGELOG.md", "# changelog\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "later work on main");
  const mainTip = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo);

  // A feature branch that leaves the anchored file alone. Its own HEAD will be
  // squashed away at merge, so stamping HEAD would orphan the anchor — while
  // the span is provably identical at the merge-base, which survives.
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "README.md", "# unrelated\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "unrelated work");
  const featureTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/47s-request-deadline.md", symbolConcept(seed));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  const anchor = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(anchor.lines, "4", "the symbol step re-lined the claim");
  assert.equal(anchor.as_of, mainTip, "stamp the newest commit certain to survive the squash");
  assert.notEqual(anchor.as_of, featureTip, "HEAD here is exactly what a squash discards");
  assert.notEqual(anchor.as_of, seed, "and it is a fresh stamp, not the old value kept");
});

test("as_of falls back to HEAD when the span cannot be verified at the merge-base", async () => {
  const repo = await makeRepo("why-stamp-head-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const mainTip = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo);

  // This branch moves the anchored lines, so the merge-base is precisely where
  // the new span is *not* valid. Stamping it would re-point the anchor at
  // whatever text held those line numbers back then — the silently-wrong
  // anchor. HEAD is truthful even though the squash will orphan it.
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML_SHIFTED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "shift the deadline block");
  const featureTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/47s-request-deadline.md", deadlineDecision(mainTip));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  const anchor = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(anchor.lines, "5-6", "the span moved on this branch");
  assert.equal(anchor.as_of, featureTip, "an unverifiable merge-base loses to a truthful HEAD");
  assert.notEqual(anchor.as_of, mainTip);
});

/**
 * Two byte-identical blocks. The anchor claims the second; deleting the first
 * shifts it onto the line numbers the first used to occupy — so the text at the
 * merge-base matches the text at HEAD while naming entirely different code.
 */
const clientDeadlineDecision = (asOf: string) => `---
type: decision
title: 47s client deadline
description: The client deadline is pinned 2s past the gateway cap.
timestamp: 2026-07-11
why:
  status: active
  happened_on: 2024-01-15
  confidence: corroborated
  anchors:
    - path: config/defaults.toml
      lines: 5-6
      as_of: "${asOf}"
      state: live
---

# 47s client deadline

47 = 45 + 2, so the gateway timeout always fires first.
`;

const DUPLICATE_BLOCKS = `[server]
request_deadline = 47
retry_jitter = false
[client]
request_deadline = 47
retry_jitter = false
`;
const CLIENT_BLOCK_ONLY = `[client]
request_deadline = 47
retry_jitter = false
`;

test("a merge-base whose text merely matches is not a verified span", async () => {
  const repo = await makeRepo("why-stamp-dup-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DUPLICATE_BLOCKS);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const mainTip = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo);

  // Drop [server], so the anchored [client] block slides from 5-6 up to 2-3 —
  // where [server] used to sit, with identical text. Byte-comparing the span at
  // the merge-base therefore says "holds" about the wrong block entirely.
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "config/defaults.toml", CLIENT_BLOCK_ONLY);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "drop the server block");
  const featureTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/47s-request-deadline.md", clientDeadlineDecision(mainTip));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  const first = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(first.lines, "2-3", "the [client] block moved up");
  assert.equal(first.as_of, featureTip, "identical text at the merge-base is not the same code");
  assert.notEqual(first.as_of, mainTip, "stamping it would name [server], which this is not about");

  // The real cost of a false stamp: the next run traces from the deleted
  // [server] block, finds nothing, and buries an anchor whose code is untouched.
  const { io: io2, out: out2 } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io2), 0, out2.join("\n"));

  const second = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(second.state, "live", "a second run must not lose an anchor whose code is present");
  assert.equal(second.lines, "2-3", "re-anchoring is idempotent");
  assert.equal(second.as_of, first.as_of, "and the stamp is one the next run re-derives");
});

// --- Repairing an orphaned as_of ------------------------------------------

/** The symbol resolves at HEAD to exactly the recorded span, so the claim is
 * current — the orphaned as_of is the only thing wrong with the anchor. */
const repairSymbolConcept = (asOf: string) => `---
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
      symbol: request_deadline
      lines: 4
      as_of: "${asOf}"
      state: live
---

# 47s request deadline

47 = 45 + 2, so the gateway timeout always fires first.
`;

test("an orphaned as_of is repaired when the claim re-verifies on the integration branch", async () => {
  const repo = await makeRepo("why-repair-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");

  // The branch births a file; the squash then discards the only commit the
  // anchors' as_of ever named.
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "docs/notes.md", "# born on the branch\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "add notes");
  const orphan = git(repo, "rev-parse", "--short", "HEAD");

  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "--squash", "-q", "feature");
  git(repo, "commit", "-qm", "squash of feature (#1)");
  const squash = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo); // HEAD is contained in origin/HEAD, so HEAD is durable

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/born-on-branch.md", wholeFileConcept("docs/notes.md", orphan));
  await write(repo, ".why/decisions/47s-request-deadline.md", repairSymbolConcept(orphan));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));
  assert.ok(out.join("\n").includes("repaired as_of"), out.join("\n"));

  const wholeFile = await anchorOf(whyRoot, "decisions/born-on-branch");
  assert.equal(wholeFile.as_of, squash, "the squash is the surviving commit that contains the file");
  assert.equal(wholeFile.path, "docs/notes.md");
  assert.equal(wholeFile.state, "live");

  const symbol = await anchorOf(whyRoot, "decisions/47s-request-deadline");
  assert.equal(symbol.as_of, squash, "a re-found symbol verifies the claim without reading as_of");
  assert.equal(symbol.lines, "4", "the span itself did not move");

  // Idempotent: a stamp repair writes is one the next run re-derives and keeps.
  const second = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, second.io), 0, second.out.join("\n"));
  assert.ok(second.out.join("\n").includes("2 already current"), second.out.join("\n"));
  assert.equal((await anchorOf(whyRoot, "decisions/born-on-branch")).as_of, squash);
});

test("repair declines on a diverged branch when the span cannot be verified at the merge-base", async () => {
  const repo = await makeRepo("why-repair-branch-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  withIntegrationBranch(repo);

  // An orphan: the tip of a branch main never merged.
  git(repo, "checkout", "-q", "-b", "elsewhere");
  await write(repo, "scratch.txt", "gone tomorrow\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "never merged");
  const orphan = git(repo, "rev-parse", "--short", "HEAD");

  // The anchored file is born on *this* branch, so the merge-base cannot
  // verify it — the only available stamp is a branch HEAD the coming squash
  // discards, which would merely recreate the orphan. Repair must decline.
  git(repo, "checkout", "-q", "main");
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "docs/notes.md", "# born on the branch\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "add notes");
  const featureTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/born-on-branch.md", wholeFileConcept("docs/notes.md", orphan));
  const before = await readFile(join(whyRoot, "decisions/born-on-branch.md"), "utf8");

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));
  assert.ok(out.join("\n").includes("already current"), out.join("\n"));

  assert.equal(
    await readFile(join(whyRoot, "decisions/born-on-branch.md"), "utf8"),
    before,
    "no branch-side churn: an undurable repair writes nothing",
  );
  const anchor = await anchorOf(whyRoot, "decisions/born-on-branch");
  assert.equal(anchor.as_of, orphan, "left for the post-merge run on the integration branch");
  assert.notEqual(anchor.as_of, featureTip);
});

test("on a diverged branch, repair stamps the merge-base when the span holds there", async () => {
  const repo = await makeRepo("why-repair-base-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  await write(repo, "docs/notes.md", "# on main since the start\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const mainTip = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo);

  git(repo, "checkout", "-q", "-b", "elsewhere");
  await write(repo, "scratch.txt", "gone tomorrow\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "never merged");
  const orphan = git(repo, "rev-parse", "--short", "HEAD");

  git(repo, "checkout", "-q", "main");
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "README.md", "# unrelated\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "unrelated work");
  const featureTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/born-on-main.md", wholeFileConcept("docs/notes.md", orphan));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  const anchor = await anchorOf(whyRoot, "decisions/born-on-main");
  assert.equal(anchor.as_of, mainTip, "the merge-base survives the squash and verifiably has the file");
  assert.notEqual(anchor.as_of, featureTip, "a branch HEAD stamp would re-orphan at the squash");
});

test("on the integration branch itself, as_of is stamped at HEAD", async () => {
  const repo = await makeRepo("why-stamp-main-");
  git(repo, "checkout", "-q", "-b", "main");
  await write(repo, "config/defaults.toml", DEFAULTS_TOML);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const seed = git(repo, "rev-parse", "--short", "HEAD");
  withIntegrationBranch(repo);

  await write(repo, "config/defaults.toml", DEFAULTS_TOML_SHIFTED);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "shift");
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "main"));
  const mainTip = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/47s-request-deadline.md", deadlineDecision(seed));

  const { io, out } = capture();
  assert.equal(await main(["anchor", "--bundle", whyRoot], repo, io), 0, out.join("\n"));

  // HEAD is contained in the integration branch, so HEAD survives and is both
  // the truthful and the durable stamp — no merge-base indirection.
  assert.equal((await anchorOf(whyRoot, "decisions/47s-request-deadline")).as_of, mainTip);
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
