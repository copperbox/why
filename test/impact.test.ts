import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadBundle } from "../src/bundle.ts";
import { buildImpactReport, parseDiff } from "../src/impact.ts";
import { main } from "../src/cli.ts";
import { capture, git, makeRepo, write } from "./helpers.ts";

test("parseDiff keeps new-side hunks, pure deletions, and renamed paths", () => {
  const files = parseDiff([
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -2,1 +2,2 @@",
    "diff --git a/src/old.ts b/src/new.ts",
    "similarity index 90%",
    "--- a/src/old.ts",
    "+++ b/src/new.ts",
    "@@ -8,1 +8,0 @@",
  ].join("\n"));
  assert.deepEqual(files, [
    { path: "src/a.ts", lines: [{ start: 2, end: 3 }], deleted: false },
    { path: "src/new.ts", lines: [{ start: 8, end: 8 }], deleted: false },
  ]);
});

test("impact reports exact and same-file concepts plus only causally upstream expiry", async () => {
  const repo = await makeRepo("why-impact-");
  try {
    await write(repo, "src/a.ts", "one\ntwo\nthree\nfour\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "initial");
    const asOf = git(repo, "rev-parse", "HEAD");
    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
    await write(repo, ".why/decisions/exact.md", `---
type: decision
title: Exact decision
why:
  status: active
  confidence: recorded
  anchors:
    - path: src/a.ts
      lines: 2
      as_of: ${asOf}
      state: live
---

# Exact decision

# Why

Because.

# Because of

- [Old constraint](/constraints/old.md)
`);
    await write(repo, ".why/decisions/same-file.md", `---
type: decision
title: Same-file decision
why:
  status: active
  anchors:
    - path: src/a.ts
      lines: 4
      as_of: ${asOf}
      state: live
---

# Same-file decision

# Why

Because.
`);
    await write(repo, ".why/constraints/old.md", `---
type: constraint
title: Old constraint
why:
  status: expired
  expired_on: 2026-01-01
---

# Old constraint

# Still true?

No.
`);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "record why");
    await write(repo, "src/a.ts", "one\nTWO\nthree\nfour\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "change the decision line");

    const report = buildImpactReport(await loadBundle(`${repo}/.why`), "HEAD~1..HEAD");
    assert.deepEqual(report.concepts.map((item) => [item.id, item.overlaps_hunk]), [
      ["decisions/exact", true],
      ["decisions/same-file", false],
    ]);
    assert.deepEqual(report.expired_constraints, [{
      id: "constraints/old",
      title: "Old constraint",
      expired_on: "2026-01-01",
      affects: ["decisions/exact"],
    }]);
    const cli = capture();
    assert.equal(await main(["impact", "HEAD~1..HEAD", "--bundle", `${repo}/.why`, "--json"], repo, cli.io), 0);
    assert.equal(JSON.parse(cli.out.join("\n")).concepts.length, 2);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
