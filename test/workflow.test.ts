import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { loadBundle } from "../src/bundle.ts";
import { scaffoldBundle } from "../src/init.ts";
import { bootstrapBundle, maintainBundle, WorkflowError } from "../src/workflow.ts";
import { git, makeRepo, write } from "./helpers.ts";

test("bootstrap prepares episodes, evidence, and one agent handoff, then becomes current", async () => {
  const repo = await makeRepo("why-bootstrap-");
  try {
    await write(repo, "src/a.ts", "export const a = 1;\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "first choice\n\nBecause the old value timed out.");
    const root = await scaffoldBundle(repo);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "add why bundle");
    const first = await bootstrapBundle(await loadBundle(root), { full: true });
    assert.equal(first.alreadyCurrent, false);
    assert.ok(first.episodes > 0);
    assert.ok(first.handoff !== null && existsSync(first.handoff));
    const handoff = await readFile(first.handoff!, "utf8");
    assert.match(handoff, /skills\/dig/);
    assert.match(handoff, /skills\/dig-synthesize/);
    const second = await bootstrapBundle(await loadBundle(root));
    assert.equal(second.alreadyCurrent, true);
    assert.equal(second.episodes, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("maintain re-anchors drift and returns the consolidated health and review result", async () => {
  const repo = await makeRepo("why-maintain-");
  try {
    await write(repo, "src/a.ts", "one\ntwo\nthree\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "initial");
    const asOf = git(repo, "rev-parse", "HEAD");
    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
    await write(repo, ".why/decisions/a.md", `---
type: decision
title: Keep two
why:
  status: active
  anchors:
    - path: src/a.ts
      lines: 2
      as_of: ${asOf}
      state: live
---

# Keep two

# Why

Because.
`);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "record why");
    await write(repo, "src/a.ts", "zero\none\ntwo\nthree\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "shift lines");
    const report = await maintainBundle(await loadBundle(`${repo}/.why`));
    assert.equal(report.healthy, true);
    assert.equal(report.anchorsWritten.length, 1);
    assert.equal(report.review.total, 0);
    const updated = await readFile(`${repo}/.why/decisions/a.md`, "utf8");
    assert.match(updated, /lines: 3/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("maintain refuses writes away from the known integration branch", async () => {
  const repo = await makeRepo("why-maintain-branch-");
  try {
    await write(repo, "src/a.ts", "one\n");
    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "initial");
    git(repo, "branch", "-M", "main");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    git(repo, "switch", "-qc", "feature/work");
    const bundle = await loadBundle(`${repo}/.why`);
    await assert.rejects(
      () => maintainBundle(bundle),
      (error: unknown) => error instanceof WorkflowError && /switch to main/.test(error.message),
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
